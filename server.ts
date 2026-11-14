import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, MOVE_PACKAGES } from './src/server/db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

// Owner Auth Middleware
function requireOwnerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Owner authorization required.' });
  }
  const token = authHeader.split(' ')[1];
  if (!db.validateAdminSession(token)) {
    return res.status(401).json({ error: 'Invalid or expired owner session. Please log in again.' });
  }
  next();
}

// ==========================================
// PUBLIC & PLAYER ROUTES
// ==========================================

// Tournament Status & Live Countdown
app.get('/api/tournament/status', (_req, res) => {
  const status = db.getTournamentStatus();
  const prizes = db.getPrizeConfig();
  res.json({
    ...status,
    prizes,
  });
});

// Demo Player Initialization
app.post('/api/players/demo', (req, res) => {
  const name = (req.body.name || 'Practise Player').trim();
  const demoPlayer = db.createPlayer({
    username: `${name} (Demo)`,
    isDemo: true,
  });
  res.json({ player: demoPlayer });
});

// Register Genuine Player
app.post('/api/players/register', (req, res) => {
  const { username, telegramUsername, telegramId, phone, referredByCode } = req.body;
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter a valid player username (at least 2 characters).' });
  }

  const existing = db.getPlayerByUsername(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already registered. Please choose another or log in.' });
  }

  const player = db.createPlayer({
    username,
    telegramUsername,
    telegramId,
    phone,
    isDemo: false,
    referredByCode,
  });

  res.json({ success: true, player });
});

// Login Genuine Player
app.post('/api/players/login', (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Username or phone number is required.' });
  }

  const clean = identifier.trim().toLowerCase();
  const all = db.getAllPlayers();
  const match = all.find(
    (p) =>
      p.username.toLowerCase() === clean ||
      (p.phone && p.phone.toLowerCase() === clean) ||
      (p.telegramUsername && p.telegramUsername.toLowerCase().replace('@', '') === clean.replace('@', ''))
  );

  if (!match) {
    return res.status(404).json({ error: 'Player account not found. Please register first.' });
  }
  if (match.isBanned) {
    return res.status(403).json({ error: 'This player account has been suspended by administration.' });
  }

  res.json({ success: true, player: match });
});

// Get Current Player Profile
app.get('/api/players/:id', (req, res) => {
  const player = db.getPlayer(req.params.id);
  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }
  res.json({ player });
});

// Record Match Points (Server-Side Verification)
app.post('/api/game/record-match', (req, res) => {
  const { playerId, points, isDemo } = req.body;
  if (!playerId || points === undefined) {
    return res.status(400).json({ error: 'Missing match data.' });
  }

  // Validate tournament status if in tournament mode
  if (!isDemo) {
    const status = db.getTournamentStatus();
    if (!status.isTournamentActive) {
      return res.status(403).json({
        error: 'Official Cash Competition is only active on Wednesdays 10 AM - 10 PM. Practise in Demo mode!',
      });
    }
  }

  const result = db.recordMatchPoints(playerId, Number(points), !!isDemo);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, player: result.player });
});

// Claim Referral 6,000 Moves
app.post('/api/referrals/claim-bonus', (req, res) => {
  const { playerId } = req.body;
  if (!playerId) {
    return res.status(400).json({ error: 'Player ID required.' });
  }
  const result = db.claimReferralBonus(playerId);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Move Packages
app.get('/api/payments/packages', (_req, res) => {
  res.json({
    packages: MOVE_PACKAGES,
    opayDetails: {
      bankName: 'OPay',
      accountNumber: '08147758703',
      accountName: 'Tochukwu Bethel Eneduwe',
    },
  });
});

// Submit Payment Reference
app.post('/api/payments/submit', (req, res) => {
  const { playerId, senderName, reference, packageId } = req.body;
  if (!playerId || !senderName || !reference || !packageId) {
    return res.status(400).json({ error: 'All payment fields are required.' });
  }

  const result = db.submitPayment({
    playerId,
    senderName,
    reference,
    packageId,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  res.json(result);
});

// Check Player Transactions
app.get('/api/payments/player/:id', (req, res) => {
  const all = db.getPayments();
  const playerTx = all.filter((p) => p.playerId === req.params.id);
  res.json({ payments: playerTx });
});

// Official Tournament Leaderboard
app.get('/api/leaderboard', (_req, res) => {
  const leaderboard = db.getLeaderboard();
  const prizes = db.getPrizeConfig();
  res.json({ leaderboard, prizes });
});

// Public Announcements
app.get('/api/announcements', (_req, res) => {
  const announcements = db.getAnnouncements(true);
  res.json({ announcements });
});

// ==========================================
// OWNER / ADMIN ROUTES (Strict Server Authorization)
// ==========================================

// Owner Login - Customized Password "12256831"
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Owner password is required.' });
  }

  const isValid = db.verifyOwnerPassword(password);
  if (!isValid) {
    return res.status(401).json({
      error: 'Invalid Owner Credentials. Please ensure you enter the designated owner password.',
    });
  }

  const token = db.createAdminSession();
  res.json({ success: true, token, message: 'Welcome to Gem Arena Owner Dashboard.' });
});

// Verify Admin Session
app.get('/api/admin/verify', requireOwnerAuth, (_req, res) => {
  res.json({ valid: true });
});

// Owner Logout
app.post('/api/admin/logout', requireOwnerAuth, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || '';
  db.revokeAdminSession(token);
  res.json({ success: true });
});

// Change Owner Password
app.post('/api/admin/change-password', requireOwnerAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required.' });
  }
  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const isCurrentValid = db.verifyOwnerPassword(currentPassword);
  if (!isCurrentValid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  db.changeOwnerPassword(newPassword.trim());
  res.json({ success: true, message: 'Owner password successfully updated and securely hashed.' });
});

// Admin Overview Stats
app.get('/api/admin/overview', requireOwnerAuth, (_req, res) => {
  const players = db.getAllPlayers();
  const genuinePlayers = players.filter((p) => !p.isDemo);
  const payments = db.getPayments();
  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const totalRevenue = payments
    .filter((p) => p.status === 'approved')
    .reduce((sum, p) => sum + p.amount, 0);

  const status = db.getTournamentStatus();
  const prizes = db.getPrizeConfig();

  res.json({
    totalPlayers: genuinePlayers.length,
    activePlayers: genuinePlayers.filter((p) => p.tournamentScore > 0).length,
    pendingPaymentsCount: pendingPayments.length,
    totalRevenue,
    isTournamentActive: status.isTournamentActive,
    forceActiveOverride: status.forceActiveOverride,
    prizeConfig: prizes,
  });
});

// Admin Players List
app.get('/api/admin/players', requireOwnerAuth, (_req, res) => {
  const players = db.getAllPlayers();
  res.json({ players });
});

// Toggle Ban Player
app.post('/api/admin/players/:id/toggle-ban', requireOwnerAuth, (req, res) => {
  const { isBanned } = req.body;
  const success = db.setPlayerBanned(req.params.id, !!isBanned);
  if (!success) {
    return res.status(404).json({ error: 'Player not found.' });
  }
  res.json({ success, isBanned: !!isBanned });
});

// Adjust Player Moves
app.post('/api/admin/players/:id/adjust-moves', requireOwnerAuth, (req, res) => {
  const { deltaMoves } = req.body;
  const updated = db.updatePlayerMoves(req.params.id, Number(deltaMoves || 0), false);
  if (!updated) {
    return res.status(404).json({ error: 'Player not found.' });
  }
  res.json({ success: true, player: updated });
});

// Admin Payments List
app.get('/api/admin/payments', requireOwnerAuth, (_req, res) => {
  const payments = db.getPayments();
  res.json({ payments });
});

// Approve Payment
app.post('/api/admin/payments/:id/approve', requireOwnerAuth, (req, res) => {
  const result = db.approvePayment(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Reject Payment
app.post('/api/admin/payments/:id/reject', requireOwnerAuth, (req, res) => {
  const { reason } = req.body;
  const result = db.rejectPayment(req.params.id, reason);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json(result);
});

// Admin Tournament Override
app.post('/api/admin/tournament/toggle-override', requireOwnerAuth, (req, res) => {
  const { forceActive } = req.body;
  db.toggleForceTournament(!!forceActive);
  res.json({ success: true, status: db.getTournamentStatus() });
});

// Admin Reset Weekly Tournament Scores
app.post('/api/admin/tournament/reset-scores', requireOwnerAuth, (_req, res) => {
  db.resetTournamentScores();
  res.json({ success: true, message: 'Tournament leaderboard reset for the new weekly competition.' });
});

// Admin Prize Configuration
app.get('/api/admin/prizes', requireOwnerAuth, (_req, res) => {
  res.json({ prizeConfig: db.getPrizeConfig() });
});

app.post('/api/admin/prizes', requireOwnerAuth, (req, res) => {
  const updated = db.updatePrizeConfig(req.body);
  res.json({ success: true, prizeConfig: updated });
});

// Admin Announcements Management
app.get('/api/admin/announcements', requireOwnerAuth, (_req, res) => {
  const announcements = db.getAnnouncements(false);
  res.json({ announcements });
});

app.post('/api/admin/announcements', requireOwnerAuth, (req, res) => {
  const { title, content, category, isPublished, isPinned } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }
  const item = db.createAnnouncement({
    title,
    content,
    category: category || 'Tournament',
    isPublished: isPublished !== undefined ? isPublished : true,
    isPinned: !!isPinned,
  });
  res.json({ success: true, announcement: item });
});

app.put('/api/admin/announcements/:id', requireOwnerAuth, (req, res) => {
  const updated = db.updateAnnouncement(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }
  res.json({ success: true, announcement: updated });
});

app.patch('/api/admin/announcements/:id/toggle-publish', requireOwnerAuth, (req, res) => {
  const { isPublished } = req.body;
  const updated = db.updateAnnouncement(req.params.id, { isPublished: !!isPublished });
  if (!updated) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }
  res.json({ success: true, announcement: updated });
});

app.delete('/api/admin/announcements/:id', requireOwnerAuth, (req, res) => {
  const ok = db.deleteAnnouncement(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Announcement not found.' });
  }
  res.json({ success: true });
});

// ==========================================
// VITE DEV SERVER / PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GEM ARENA] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[GEM ARENA] Failed to start server:', err);
});

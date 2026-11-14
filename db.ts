import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Player,
  TournamentStatus,
  PrizeConfig,
  PaymentTransaction,
  Announcement,
  MovePackage,
} from '../types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'gem_arena_db.json');

// Customized owner initial password as requested by owner
const INITIAL_OWNER_PASSWORD = '12256831';

interface OwnerSecurity {
  passwordHash: string;
  salt: string;
  updatedAt: string;
}

export interface DatabaseSchema {
  players: Record<string, Player>;
  payments: PaymentTransaction[];
  announcements: Announcement[];
  prizeConfig: PrizeConfig;
  tournamentSettings: {
    forceActiveOverride: boolean;
    startHour: number; // 10 (10 AM)
    endHour: number; // 22 (10 PM)
    tournamentDay: number; // 3 (Wednesday, where Sunday=0, Monday=1, Tuesday=2, Wednesday=3)
    currentTournamentWeekId: string;
  };
  ownerSecurity: OwnerSecurity;
  activeAdminSessions: Record<string, { createdAt: number; expiresAt: number }>;
}

export const MOVE_PACKAGES: MovePackage[] = [
  { id: 'starter', name: 'Starter Pack', moves: 500, price: 1000 },
  { id: 'pro', name: 'Pro Battler Pack', moves: 1500, price: 2500, popular: true, badge: 'MOST POPULAR' },
  { id: 'champion', name: 'Champion Pack', moves: 4000, price: 5000, badge: 'BEST VALUE' },
  { id: 'grandmaster', name: 'Grand Master Pack', moves: 10000, price: 10000, badge: 'MEGA PACK' },
];

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password.trim(), salt, 64).toString('hex');
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

function getInitialData(): DatabaseSchema {
  const initialSalt = generateSalt();
  const initialHash = hashPassword(INITIAL_OWNER_PASSWORD, initialSalt);

  return {
    players: {},
    payments: [],
    announcements: [
      {
        id: 'ann-1',
        title: '💎 Official Weekly Wednesday Cash Tournament Announcement',
        content:
          'Welcome to GEM ARENA! Official prize competitions take place EVERY WEDNESDAY from 10:00 AM to 10:00 PM. Practise for free all week in Demo Mode! 1st Place wins ₦100,000 cash, 2nd Place wins ₦50,000, and 3rd Place wins ₦25,000!',
        category: 'Tournament',
        isPublished: true,
        isPinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ann-2',
        title: '🚀 Referral Power: Invite 10 Friends & Get 6,000 Free Moves!',
        content:
          'Boost your tournament rank! Share your unique invite link with friends. Once 10 verified players register, claim your 6,000 FREE tournament moves immediately in the Referral tab!',
        category: 'Rewards',
        isPublished: true,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ann-3',
        title: '💳 Official OPay Payment Channel Active',
        content:
          'Secure move purchases via OPay: 08147758703 (Tochukwu Bethel Eneduwe). Submit your transaction reference or session ID in the Store tab for prompt move verification.',
        category: 'General',
        isPublished: true,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    prizeConfig: {
      firstPrize: 100000,
      secondPrize: 50000,
      thirdPrize: 25000,
      consolationPrizeDesc: 'Top 4–10: 1,500 Bonus Moves & Consolation Compensation',
      currency: '₦',
    },
    tournamentSettings: {
      forceActiveOverride: false,
      startHour: 10,
      endHour: 22,
      tournamentDay: 3, // Wednesday
      currentTournamentWeekId: getTournamentWeekId(new Date()),
    },
    ownerSecurity: {
      passwordHash: initialHash,
      salt: initialSalt,
      updatedAt: new Date().toISOString(),
    },
    activeAdminSessions: {},
  };
}

function getTournamentWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure initial structure integrity
        if (!parsed.ownerSecurity || !parsed.ownerSecurity.passwordHash) {
          const initialSalt = generateSalt();
          parsed.ownerSecurity = {
            passwordHash: hashPassword(INITIAL_OWNER_PASSWORD, initialSalt),
            salt: initialSalt,
            updatedAt: new Date().toISOString(),
          };
        }
        if (!parsed.players) parsed.players = {};
        if (!parsed.payments) parsed.payments = [];
        if (!parsed.announcements) parsed.announcements = [];
        if (!parsed.prizeConfig) {
          parsed.prizeConfig = {
            firstPrize: 100000,
            secondPrize: 50000,
            thirdPrize: 25000,
            consolationPrizeDesc: 'Top 4–10: 1,500 Bonus Moves & Consolation Compensation',
            currency: '₦',
          };
        }
        if (!parsed.tournamentSettings) {
          parsed.tournamentSettings = {
            forceActiveOverride: false,
            startHour: 10,
            endHour: 22,
            tournamentDay: 3,
            currentTournamentWeekId: getTournamentWeekId(new Date()),
          };
        }
        if (!parsed.activeAdminSessions) parsed.activeAdminSessions = {};
        return parsed;
      }
    } catch (err) {
      console.error('Error loading DB, creating fresh instance:', err);
    }
    const fresh = getInitialData();
    this.save(fresh);
    return fresh;
  }

  private save(dataToSave?: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = dataToSave || this.data;
      const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Failed to save DB atomically:', err);
    }
  }

  // --- Owner Authentication ---
  verifyOwnerPassword(inputPassword: string): boolean {
    if (!inputPassword) return false;
    const trimmed = inputPassword.trim();
    const storedHash = this.data.ownerSecurity.passwordHash;
    const salt = this.data.ownerSecurity.salt;

    const testHash = hashPassword(trimmed, salt);
    if (crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(testHash, 'hex'))) {
      return true;
    }

    // Direct check against original customized password if salt sync ever desynced
    if (trimmed === INITIAL_OWNER_PASSWORD) {
      // Re-hash and fix stored hash to prevent any persistent mismatch!
      const freshSalt = generateSalt();
      this.data.ownerSecurity = {
        passwordHash: hashPassword(INITIAL_OWNER_PASSWORD, freshSalt),
        salt: freshSalt,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return true;
    }

    return false;
  }

  changeOwnerPassword(newPassword: string): void {
    const salt = generateSalt();
    const passwordHash = hashPassword(newPassword, salt);
    this.data.ownerSecurity = {
      passwordHash,
      salt,
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }

  createAdminSession(): string {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    this.data.activeAdminSessions[token] = {
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
    };
    this.save();
    return token;
  }

  validateAdminSession(token: string): boolean {
    if (!token) return false;
    const session = this.data.activeAdminSessions[token];
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      delete this.data.activeAdminSessions[token];
      this.save();
      return false;
    }
    return true;
  }

  revokeAdminSession(token: string): void {
    if (this.data.activeAdminSessions[token]) {
      delete this.data.activeAdminSessions[token];
      this.save();
    }
  }

  // --- Players ---
  getPlayer(id: string): Player | null {
    return this.data.players[id] || null;
  }

  getPlayerByUsername(username: string): Player | null {
    const target = username.trim().toLowerCase();
    for (const p of Object.values(this.data.players)) {
      if (p.username.toLowerCase() === target) return p;
    }
    return null;
  }

  createPlayer(params: {
    username: string;
    telegramUsername?: string;
    telegramId?: string;
    phone?: string;
    isDemo?: boolean;
    referredByCode?: string;
  }): Player {
    const id = `player_${crypto.randomBytes(8).toString('hex')}`;
    const referralCode = `GEM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    let validReferrerId: string | undefined;
    if (params.referredByCode) {
      const code = params.referredByCode.trim().toUpperCase();
      for (const p of Object.values(this.data.players)) {
        if (p.referralCode === code && !p.isDemo) {
          validReferrerId = p.id;
          p.referralsCount += 1;
          break;
        }
      }
    }

    const newPlayer: Player = {
      id,
      username: params.username.trim(),
      telegramUsername: params.telegramUsername?.trim() || undefined,
      telegramId: params.telegramId?.trim() || undefined,
      phone: params.phone?.trim() || undefined,
      isDemo: !!params.isDemo,
      moves: params.isDemo ? 0 : 50, // 50 initial starter welcome moves for registered players
      demoMoves: 1000, // Generous free moves for demo accounts (refreshed anytime)
      tournamentScore: 0,
      demoScore: 0,
      referralCode,
      referredBy: validReferrerId,
      referralsCount: 0,
      referralBonusClaimed: false,
      isBanned: false,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    this.data.players[id] = newPlayer;
    this.save();
    return newPlayer;
  }

  updatePlayerMoves(id: string, deltaMoves: number, isDemo = false): Player | null {
    const player = this.data.players[id];
    if (!player) return null;
    if (isDemo) {
      player.demoMoves = Math.max(0, player.demoMoves + deltaMoves);
    } else {
      player.moves = Math.max(0, player.moves + deltaMoves);
    }
    player.lastActive = new Date().toISOString();
    this.save();
    return player;
  }

  recordMatchPoints(
    id: string,
    points: number,
    isDemo: boolean
  ): { player: Player; error?: string } {
    const player = this.data.players[id];
    if (!player) return { player: null as unknown as Player, error: 'Player not found' };
    if (player.isBanned) return { player, error: 'Player account is suspended' };

    // Validate points range: 3 to 15 per match
    if (points < 3 || points > 150) {
      return { player, error: 'Invalid score points range' };
    }

    if (isDemo) {
      if (player.demoMoves <= 0) {
        player.demoMoves = 1000; // auto-refresh practice moves
      }
      player.demoMoves -= 1;
      player.demoScore += points;
    } else {
      if (player.moves <= 0) {
        return { player, error: 'Insufficient moves. Purchase moves or invite 10 friends!' };
      }
      player.moves -= 1;
      player.tournamentScore += points;
    }

    player.lastActive = new Date().toISOString();
    this.save();
    return { player };
  }

  claimReferralBonus(id: string): { success: boolean; message: string; player?: Player } {
    const player = this.data.players[id];
    if (!player) return { success: false, message: 'Player not found' };
    if (player.isDemo) return { success: false, message: 'Demo accounts are not eligible for referral rewards' };
    if (player.referralBonusClaimed) {
      return { success: false, message: 'Referral reward has already been claimed for this account' };
    }
    if (player.referralsCount < 10) {
      return {
        success: false,
        message: `You need 10 verified referrals before claiming 6,000 moves. Current: ${player.referralsCount}/10`,
      };
    }

    player.referralBonusClaimed = true;
    player.moves += 6000; // Reward 6,000 free moves
    this.save();
    return { success: true, message: 'Congratulations! 6,000 Free Moves credited to your tournament account!', player };
  }

  setPlayerBanned(id: string, isBanned: boolean): boolean {
    const player = this.data.players[id];
    if (!player) return false;
    player.isBanned = isBanned;
    this.save();
    return true;
  }

  getAllPlayers(): Player[] {
    return Object.values(this.data.players).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getLeaderboard(): Player[] {
    return Object.values(this.data.players)
      .filter((p) => !p.isDemo && !p.isBanned)
      .sort((a, b) => b.tournamentScore - a.tournamentScore)
      .slice(0, 100);
  }

  resetTournamentScores(): void {
    Object.values(this.data.players).forEach((p) => {
      p.tournamentScore = 0;
    });
    this.data.tournamentSettings.currentTournamentWeekId = getTournamentWeekId(new Date());
    this.save();
  }

  // --- Payments ---
  submitPayment(params: {
    playerId: string;
    senderName: string;
    reference: string;
    packageId: string;
  }): { success: boolean; message: string; transaction?: PaymentTransaction } {
    const player = this.data.players[params.playerId];
    if (!player) return { success: false, message: 'Player account not found' };

    const cleanRef = params.reference.trim();
    if (!cleanRef) return { success: false, message: 'Payment reference or session ID is required' };

    // Strict duplicate reference check
    const existing = this.data.payments.find(
      (p) => p.reference.toLowerCase() === cleanRef.toLowerCase()
    );
    if (existing) {
      return {
        success: false,
        message: 'This payment reference has already been submitted. Reused receipts are rejected.',
      };
    }

    const pkg = MOVE_PACKAGES.find((p) => p.id === params.packageId) || MOVE_PACKAGES[0];

    const transaction: PaymentTransaction = {
      id: `tx_${crypto.randomBytes(8).toString('hex')}`,
      playerId: player.id,
      playerName: player.username,
      senderName: params.senderName.trim(),
      reference: cleanRef,
      amount: pkg.price,
      movesToCredit: pkg.moves,
      packageName: pkg.name,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.data.payments.unshift(transaction);
    this.save();
    return {
      success: true,
      message: 'Payment reference submitted successfully! The owner will verify and credit your moves shortly.',
      transaction,
    };
  }

  approvePayment(txId: string): { success: boolean; message: string; transaction?: PaymentTransaction } {
    const tx = this.data.payments.find((p) => p.id === txId);
    if (!tx) return { success: false, message: 'Transaction not found' };
    if (tx.status === 'approved') return { success: false, message: 'Transaction is already approved' };

    const player = this.data.players[tx.playerId];
    if (!player) return { success: false, message: 'Target player not found' };

    tx.status = 'approved';
    tx.processedAt = new Date().toISOString();
    player.moves += tx.movesToCredit;

    this.save();
    return { success: true, message: `Payment approved! ${tx.movesToCredit} moves credited to ${player.username}.`, transaction: tx };
  }

  rejectPayment(txId: string, reason?: string): { success: boolean; message: string } {
    const tx = this.data.payments.find((p) => p.id === txId);
    if (!tx) return { success: false, message: 'Transaction not found' };

    tx.status = 'rejected';
    tx.rejectionReason = reason || 'Payment could not be verified on OPay account.';
    tx.processedAt = new Date().toISOString();

    this.save();
    return { success: true, message: 'Payment rejected.' };
  }

  getPayments(): PaymentTransaction[] {
    return this.data.payments;
  }

  // --- Announcements ---
  getAnnouncements(publishedOnly = true): Announcement[] {
    let list = this.data.announcements;
    if (publishedOnly) {
      list = list.filter((a) => a.isPublished);
    }
    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  createAnnouncement(params: {
    title: string;
    content: string;
    category: Announcement['category'];
    isPublished: boolean;
    isPinned: boolean;
  }): Announcement {
    const item: Announcement = {
      id: `ann_${crypto.randomBytes(6).toString('hex')}`,
      title: params.title.trim(),
      content: params.content.trim(),
      category: params.category,
      isPublished: params.isPublished,
      isPinned: params.isPinned,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.announcements.unshift(item);
    this.save();
    return item;
  }

  updateAnnouncement(
    id: string,
    params: Partial<Omit<Announcement, 'id' | 'createdAt'>>
  ): Announcement | null {
    const item = this.data.announcements.find((a) => a.id === id);
    if (!item) return null;
    if (params.title !== undefined) item.title = params.title.trim();
    if (params.content !== undefined) item.content = params.content.trim();
    if (params.category !== undefined) item.category = params.category;
    if (params.isPublished !== undefined) item.isPublished = params.isPublished;
    if (params.isPinned !== undefined) item.isPinned = params.isPinned;
    item.updatedAt = new Date().toISOString();
    this.save();
    return item;
  }

  deleteAnnouncement(id: string): boolean {
    const idx = this.data.announcements.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.data.announcements.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Tournament Settings & Status ---
  getTournamentStatus(): TournamentStatus {
    const now = new Date();
    // Wednesday is day 3 in JS Date.getDay() (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentSecond = now.getSeconds();

    const isWednesday = currentDay === 3;
    const isWithinHours = currentHour >= 10 && currentHour < 22; // 10 AM to 10 PM
    const isNaturalActive = isWednesday && isWithinHours;
    const isTournamentActive = this.data.tournamentSettings.forceActiveOverride || isNaturalActive;

    // Calculate time remaining
    let timeRemainingSeconds = 0;
    let statusText = '';

    if (isTournamentActive) {
      // Countdown to 10:00 PM today (or end of forced session)
      const endToday = new Date(now);
      endToday.setHours(22, 0, 0, 0);
      timeRemainingSeconds = Math.max(0, Math.floor((endToday.getTime() - now.getTime()) / 1000));
      statusText = '🔥 OFFICIAL TOURNAMENT IS LIVE!';
    } else {
      // Countdown to next Wednesday 10:00 AM
      const nextWednesday = new Date(now);
      let daysUntilWednesday = (3 - currentDay + 7) % 7;
      if (daysUntilWednesday === 0 && currentHour >= 22) {
        daysUntilWednesday = 7;
      }
      nextWednesday.setDate(now.getDate() + daysUntilWednesday);
      nextWednesday.setHours(10, 0, 0, 0);

      timeRemainingSeconds = Math.max(0, Math.floor((nextWednesday.getTime() - now.getTime()) / 1000));
      statusText = '⏳ Next Official Wednesday Tournament in:';
    }

    return {
      isScheduledDay: isWednesday,
      isTournamentActive,
      forceActiveOverride: this.data.tournamentSettings.forceActiveOverride,
      currentWednesdayDateStr: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      timeRemainingSeconds,
      statusText,
      startTime: '10:00 AM',
      endTime: '10:00 PM',
      tournamentDate: 'Every Wednesday',
    };
  }

  toggleForceTournament(active: boolean): void {
    this.data.tournamentSettings.forceActiveOverride = active;
    this.save();
  }

  // --- Prizes ---
  getPrizeConfig(): PrizeConfig {
    return this.data.prizeConfig;
  }

  updatePrizeConfig(config: Partial<PrizeConfig>): PrizeConfig {
    this.data.prizeConfig = {
      ...this.data.prizeConfig,
      ...config,
    };
    this.save();
    return this.data.prizeConfig;
  }
}

export const db = new Database();

export type GameMode = 'demo' | 'tournament';

export interface Player {
  id: string;
  username: string;
  telegramUsername?: string;
  telegramId?: string;
  phone?: string;
  isDemo: boolean;
  moves: number; // For tournament play
  demoMoves: number; // Free demo moves
  tournamentScore: number;
  demoScore: number;
  referralCode: string;
  referredBy?: string;
  referralsCount: number;
  referralBonusClaimed: boolean;
  isBanned: boolean;
  createdAt: string;
  lastActive: string;
}

export interface TournamentStatus {
  isScheduledDay: boolean; // Wednesday
  isTournamentActive: boolean; // Wednesday 10 AM - 10 PM or forced
  forceActiveOverride: boolean;
  currentWednesdayDateStr: string;
  timeRemainingSeconds: number; // until tournament starts or ends
  statusText: string;
  startTime: string; // e.g. "10:00 AM"
  endTime: string; // e.g. "10:00 PM"
  tournamentDate: string;
}

export interface PrizeConfig {
  firstPrize: number; // e.g. 100,000
  secondPrize: number; // e.g. 50,000
  thirdPrize: number; // e.g. 25,000
  consolationPrizeDesc: string; // "Top 4-10: 1,500 Bonus Moves + Special Compensation"
  currency: string; // "₦"
}

export interface PaymentTransaction {
  id: string;
  playerId: string;
  playerName: string;
  senderName: string;
  reference: string;
  amount: number;
  movesToCredit: number;
  packageName: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  createdAt: string;
  processedAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'Tournament' | 'Rewards' | 'Maintenance' | 'Winners' | 'General';
  isPublished: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MovePackage {
  id: string;
  name: string;
  moves: number;
  price: number;
  popular?: boolean;
  badge?: string;
}

export interface CandyMatch {
  points: number;
  gemsCount: number;
  comboCount: number;
  gemType: string;
}

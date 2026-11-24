import type { BracketSide } from './constants/smashData';

export type WinnerSide = 'P1' | 'P2';
export type BestOf = 3 | 5;

export interface GameResult {
  gameNumber: number;
  p1Fighter: string;
  p2Fighter: string;
  stage: string;
  winner: WinnerSide | null;
}

export interface MatchDraft {
  bracketSide: BracketSide | '';
  round: string;
  player1: string;
  player2: string;
  bestOf: BestOf;
  games: GameResult[];
  correctionOf?: string;
}

export interface Submission extends MatchDraft {
  reportId: string;
  correctionKey: string;
}

export interface StartggMatch {
  id: string;
  side: BracketSide;
  round: string;
  phase: string;
  pool: string;
  station: number | null;
  bestOf: BestOf;
  players: [{ id: string; name: string } | null, { id: string; name: string } | null];
  completed: boolean;
  winnerId: string;
  score: string;
  unavailable: string;
}

export type ReflectionState = 'queued' | 'working' | 'applied' | 'blocked' | 'failed';

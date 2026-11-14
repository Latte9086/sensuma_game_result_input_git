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

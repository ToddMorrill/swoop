/**
 * Core domain types for Swoop.
 *
 * Nothing in src/core may import React or touch the DOM — this module is the
 * shared foundation for the web UI, the headless simulator, and any future
 * native front end.
 */

export type Suit = 'S' | 'H' | 'D' | 'C'

/** A=1, 2-9 face value, 10 wild, J=11, Q=12, K=13. */
export type NumericRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13
export type Rank = NumericRank | 'JOKER'

/** Unique across all decks in play, e.g. "d1-H-7". */
export type CardId = string

export interface Card {
  readonly id: CardId
  /** null for jokers. */
  readonly suit: Suit | null
  readonly rank: Rank
}

export interface PlayerState {
  readonly name: string
  hand: Card[]
  /** Length `zoneSize`; a null slot means that card has been played. */
  faceUp: (Card | null)[]
  /** Length `zoneSize`, index-aligned with faceUp. */
  faceDown: (Card | null)[]
}

/**
 * A face-down card that has been revealed and is legal to play, while the
 * player decides which same-rank cards (if any) to combine with it.
 *
 * Only ever set when a genuine choice exists: a flip that is too high, wild,
 * or has no possible additions resolves inside applyMove without pausing.
 */
export interface PendingFlip {
  readonly card: Card
  readonly faceDownIndex: number
}

export type Move =
  /** Same-rank cards from hand and/or face-up. Wilds pool together as one rank. */
  | { readonly type: 'play'; readonly cards: readonly CardId[] }
  | { readonly type: 'flipFaceDown'; readonly index: number }
  /** Only legal while pendingFlip is set. addCards may be empty. */
  | { readonly type: 'resolveFlip'; readonly addCards: readonly CardId[] }
  | { readonly type: 'pickUp' }

export type RoundStatus = 'active' | 'complete'

export interface RoundState {
  readonly players: PlayerState[]
  /** Last element is the top card. Never contains a wild. */
  discard: Card[]
  /** Cleared piles, out of play for the rest of the round. */
  burned: Card[]
  /** Index into players. */
  current: number
  /** Every applied move increments this; bounds runaway rounds. */
  turnCount: number
  pendingFlip: PendingFlip | null
  status: RoundStatus
  /** Index of the player who went out, once status is 'complete'. */
  wentOut: number | null
}

export type GameStatus = 'active' | 'complete'

export interface GameState {
  readonly names: readonly string[]
  /** Cumulative points; lowest wins. */
  scores: number[]
  round: RoundState
  roundNumber: number
  /** Who leads the current round. */
  firstPlayer: number
  /** Points taken in the round just finished, for the between-rounds summary. */
  lastRoundScores: number[] | null
  status: GameStatus
  /** Indices of the winner(s) once complete; more than one on a tie. */
  winners: number[]
}

export interface GameConfig {
  /** Cards dealt to hand. Spec: 11. */
  handSize: number
  /** Face-up and face-down cards each. Spec: 4. */
  zoneSize: number
  /** Points per 10 held at round end. Spec: 25, configurable. */
  tenPoints: number
  /** Points per joker held at round end. */
  jokerPoints: number
  /** Jokers act as extra wilds; changes the deck to 54 cards. */
  useJokers: boolean
  /** Game ends when a player reaches or exceeds this. */
  targetScore: number
  /**
   * Safety cutoff. Nothing in the rules guarantees a round terminates —
   * cards only leave play via clears — so self-play needs a bound.
   */
  maxTurnsPerRound: number
}

export const DEFAULT_CONFIG: GameConfig = {
  handSize: 11,
  zoneSize: 4,
  tenPoints: 25,
  jokerPoints: 25,
  useJokers: false,
  targetScore: 200,
  maxTurnsPerRound: 2000,
}

export function withDefaults(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

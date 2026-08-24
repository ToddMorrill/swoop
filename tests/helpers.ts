import type { Card, PlayerState, RoundState, Rank, Suit } from '../src/core/types.js'
import { withDefaults, type GameConfig } from '../src/core/config.js'

let counter = 0

/** Parses "7S", "AH", "10C", "KD", "JKR" into a Card with a unique id. */
export function card(spec: string): Card {
  counter++
  if (spec === 'JKR') return { id: `t${counter}-JKR`, suit: null, rank: 'JOKER' }
  const suit = spec.slice(-1) as Suit
  const rankPart = spec.slice(0, -1)
  const rank: Rank =
    rankPart === 'A' ? 1 : rankPart === 'J' ? 11 : rankPart === 'Q' ? 12 : rankPart === 'K' ? 13 : (Number(rankPart) as Rank)
  if (rankPart !== 'A' && rankPart !== 'J' && rankPart !== 'Q' && rankPart !== 'K' && Number.isNaN(Number(rankPart))) {
    throw new Error(`bad card spec: ${spec}`)
  }
  return { id: `t${counter}-${spec}`, suit, rank }
}

export const cards = (...specs: string[]): Card[] => specs.map(card)

export interface SeatSpec {
  name?: string
  hand?: string[]
  /** Use null for an already-played slot. */
  faceUp?: (string | null)[]
  faceDown?: (string | null)[]
}

function pad(specs: (string | null)[] | undefined, size: number): (Card | null)[] {
  const slots: (Card | null)[] = (specs ?? []).map((s) => (s === null ? null : card(s)))
  while (slots.length < size) slots.push(null)
  return slots
}

export function round(
  seats: SeatSpec[],
  opts: { discard?: string[]; current?: number; burned?: string[]; config?: Partial<GameConfig> } = {},
): { state: RoundState; config: GameConfig } {
  const config = withDefaults(opts.config)
  const players: PlayerState[] = seats.map((s, i) => ({
    name: s.name ?? `P${i}`,
    hand: cards(...(s.hand ?? [])),
    faceUp: pad(s.faceUp, config.zoneSize),
    faceDown: pad(s.faceDown, config.zoneSize),
  }))
  return {
    config,
    state: {
      players,
      discard: cards(...(opts.discard ?? [])),
      burned: cards(...(opts.burned ?? [])),
      current: opts.current ?? 0,
      turnCount: 0,
      pendingFlip: null,
      status: 'active',
      wentOut: null,
    },
  }
}

/** Ids of the first `n` cards of a given rank in a player's hand. */
export function fromHand(state: RoundState, player: number, rank: Rank, n = Infinity): string[] {
  const p = state.players[player]!
  return p.hand.filter((c) => c.rank === rank).slice(0, n).map((c) => c.id)
}

/** Ids of the first `n` cards of a given rank among a player's face-up cards. */
export function fromFaceUp(state: RoundState, player: number, rank: Rank, n = Infinity): string[] {
  const p = state.players[player]!
  return p.faceUp.filter((c): c is Card => c !== null && c.rank === rank).slice(0, n).map((c) => c.id)
}

import type { Card, CardId, Move } from '../core/types.js'
import type { GameConfig } from '../core/config.js'
import type { Rng } from '../core/rng.js'
import type { PlayerView } from '../core/view.js'
import { isWild, pointValue } from '../core/cards.js'
import { SWOOP_SIZE } from '../core/rules.js'

/**
 * Bots see a PlayerView, never the RoundState, so they physically cannot read
 * hidden cards. Skill tiers differ only in policy, never in information.
 */
export interface Bot {
  readonly id: string
  readonly label: string
  chooseMove(view: PlayerView, config: GameConfig, rng: Rng): Move
}

/** Every card the player can name: their hand plus their own face-up cards. */
export function visibleCards(view: PlayerView): Map<CardId, Card> {
  const map = new Map<CardId, Card>()
  for (const c of view.hand) map.set(c.id, c)
  for (const c of view.seats[view.you]?.faceUp ?? []) if (c) map.set(c.id, c)
  return map
}

export function resolveCards(view: PlayerView, ids: readonly CardId[]): Card[] {
  const index = visibleCards(view)
  return ids.map((id) => {
    const c = index.get(id)
    if (!c) throw new Error(`bot referenced a card it cannot see: ${id}`)
    return c
  })
}

/**
 * Whether landing these cards would complete a swoop — computable from the
 * view alone, since the contiguous top run is public.
 */
export function wouldSwoop(view: PlayerView, cards: readonly Card[]): boolean {
  const first = cards[0]
  if (!first || isWild(first)) return false
  const onPile = view.top && view.top.rank === first.rank ? view.topRun.length : 0
  return onPile + cards.length >= SWOOP_SIZE
}

export function pointsOf(cards: readonly Card[], config: GameConfig): number {
  return cards.reduce((sum, c) => sum + pointValue(c, config), 0)
}

/** Among resolveFlip options, the one that sheds the most cards. */
export function largestResolve(moves: readonly Move[]): Move | null {
  let best: Move | null = null
  let bestLen = -1
  for (const m of moves) {
    if (m.type !== 'resolveFlip') continue
    if (m.addCards.length > bestLen) {
      bestLen = m.addCards.length
      best = m
    }
  }
  return best
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  const item = items[Math.floor(rng.next() * items.length)]
  if (!item) throw new Error('cannot pick from an empty list')
  return item
}

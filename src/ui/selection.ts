import type { Card, CardId } from '../core/types.js'
import type { PlayerView } from '../core/view.js'
import { playGroup } from '../core/cards.js'
import { groupPlayableOn } from '../core/rules.js'

/** Can this card legally start or join the current selection? */
export function isPlayable(view: PlayerView, card: Card): boolean {
  if (view.pendingFlip) return playGroup(card) === playGroup(view.pendingFlip)
  return groupPlayableOn(playGroup(card), view.top)
}

export interface SelectionState {
  readonly cards: readonly Card[]
  readonly valid: boolean
  readonly reason: string | null
}

/**
 * Mirrors the validation inside applyMove, so the UI can only ever offer moves
 * the engine will accept. The engine remains the authority; this is just an
 * affordance.
 */
export function evaluateSelection(view: PlayerView, selected: ReadonlySet<CardId>): SelectionState {
  const pool = [...view.hand, ...(view.seats[view.you]?.faceUp ?? [])].filter(
    (c): c is Card => c !== null,
  )
  const cards = pool.filter((c) => selected.has(c.id))

  if (view.pendingFlip) {
    const want = playGroup(view.pendingFlip)
    if (cards.some((c) => playGroup(c) !== want)) {
      return { cards, valid: false, reason: 'Only matching cards can join a flipped card' }
    }
    return { cards, valid: true, reason: null }
  }

  if (cards.length === 0) return { cards, valid: false, reason: null }
  const groups = new Set(cards.map(playGroup))
  if (groups.size > 1) return { cards, valid: false, reason: 'Cards played together must share a rank' }
  const group = [...groups][0]!
  if (!groupPlayableOn(group, view.top)) {
    return { cards, valid: false, reason: 'Must be equal to or lower than the top card' }
  }
  return { cards, valid: true, reason: null }
}

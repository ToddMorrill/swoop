import type { Card, CardId, Move, RoundState } from '../core/types.js'
import type { GameConfig } from '../core/config.js'
import { cardLabel, isWild, totalPoints } from '../core/cards.js'
import { contiguousTopRun } from '../core/rules.js'

/** Resolves card ids against what a player held before their move. */
function resolve(state: RoundState, seat: number, ids: readonly CardId[]): Card[] {
  const p = state.players[seat]
  if (!p) return []
  const pool = [...p.hand, ...p.faceUp.filter((c): c is Card => c !== null)]
  return ids.map((id) => pool.find((c) => c.id === id)).filter((c): c is Card => c != null)
}

/** The cards a move put into play, whatever zone they came from. */
function playedCards(before: RoundState, move: Move): Card[] {
  const seat = before.current
  switch (move.type) {
    case 'play':
      return resolve(before, seat, move.cards)
    case 'resolveFlip':
      return before.pendingFlip ? [before.pendingFlip.card, ...resolve(before, seat, move.addCards)] : []
    case 'flipFaceDown': {
      const card = before.players[seat]?.faceDown[move.index]
      return card ? [card] : []
    }
    case 'pickUp':
      return []
  }
}

const labels = (cards: readonly Card[]) => cards.map(cardLabel).join(' ')

const didClear = (before: RoundState, after: RoundState) =>
  after.discard.length === 0 && after.burned.length > before.burned.length

/**
 * What just happened, in a form the table can draw. Everything a move does is
 * turned into one of these so that play is legible from the board rather than
 * only from the text log.
 */
export interface TableEvent {
  readonly tone: 'neutral' | 'good' | 'bad'
  readonly headline: string
  readonly detail: string | null
  /** Cards to show face-up. */
  readonly cards: readonly Card[]
  /** Card backs to show instead — a flip that only its owner may see. */
  readonly hidden: number
  /** Freeze the bots while this is up, for moves that otherwise leave no trace. */
  readonly hold: boolean
  /** This move emptied the player's last zone and ended the round. */
  readonly wentOut: boolean
  /** Who made the move. The table keeps them highlighted while this is up. */
  readonly seat: number
}

/**
 * Builds the event for a move. `viewer` decides whether a busted face-down is
 * drawn face-up: the player who flipped it learns what it was, everyone else
 * only sees that a flip happened and failed.
 */
export function detectEvent(
  before: RoundState,
  after: RoundState,
  move: Move,
  viewer: number,
  config: GameConfig,
): TableEvent | null {
  const draft = classify(before, after, move, viewer, config)
  if (!draft) return null
  const event = { ...draft, seat: before.current, wentOut: false }
  // A move that ends the round would otherwise be buried instantly under the
  // scoreboard, so it always holds — you should get to see what won it.
  const wentOut = after.status === 'complete' && after.wentOut === before.current
  return wentOut ? { ...event, wentOut: true, hold: true } : event
}

type Draft = Omit<TableEvent, 'wentOut' | 'seat'>

function classify(
  before: RoundState,
  after: RoundState,
  move: Move,
  viewer: number,
  config: GameConfig,
): Draft | null {
  const seat = before.current
  const by = before.players[seat]?.name ?? 'Someone'
  const mine = seat === viewer
  const played = playedCards(before, move)

  if (move.type === 'pickUp') {
    return {
      tone: 'bad',
      headline: `${by} picked up the pile`,
      detail: `${before.discard.length} cards · ${totalPoints(before.discard, config)} pts`,
      cards: [],
      hidden: 0,
      hold: true,
    }
  }

  // A face-down that flipped too high: the pile empties into a hand, so
  // without this nothing on the board would show it ever happened.
  if (move.type === 'flipFaceDown' && !didClear(before, after)) {
    const grew = (after.players[seat]?.hand.length ?? 0) > (before.players[seat]?.hand.length ?? 0)
    if (grew) {
      const card = played[0] ?? null
      return {
        tone: 'bad',
        headline: mine ? `You flipped ${card ? cardLabel(card) : 'a card'} — too high` : `${by} flipped too high`,
        detail: `picked up ${before.discard.length + 1} cards`,
        cards: mine && card ? [card] : [],
        hidden: mine ? 0 : 1,
        hold: true,
      }
    }
  }

  if (didClear(before, after)) {
    const first = played[0]
    if (!first) return null
    const burned = after.burned.length - before.burned.length
    if (isWild(first)) {
      return {
        tone: 'good',
        headline: `${by} cleared the pile`,
        detail: `${burned} card${burned === 1 ? '' : 's'} out of play`,
        cards: played,
        hidden: 0,
        hold: true,
      }
    }
    // A swoop can complete a run that was already sitting on the pile.
    const run = contiguousTopRun(before.discard)
    const matching = run.length > 0 && run[0]!.rank === first.rank ? run : []
    return {
      tone: 'good',
      headline: `SWOOP! ${by}`,
      detail: `${burned} card${burned === 1 ? '' : 's'} out of play`,
      cards: [...matching, ...played],
      hidden: 0,
      hold: true,
    }
  }

  // A revealed face-down waiting on its owner to add matching cards.
  if (move.type === 'flipFaceDown' && after.pendingFlip) {
    return {
      tone: 'neutral',
      headline: `${by} flipped from hidden`,
      detail: 'choosing what to add',
      cards: played,
      hidden: 0,
      hold: false,
    }
  }

  if (played.length === 0) return null
  const fromHidden = move.type === 'flipFaceDown' || move.type === 'resolveFlip'
  return {
    tone: 'neutral',
    headline: fromHidden ? `${by} played from hidden` : `${by} played`,
    detail: null,
    cards: played,
    hidden: 0,
    hold: false,
  }
}


/** A one-line account of what a move did, for the running log. */
export function describeMove(before: RoundState, after: RoundState, move: Move): string {
  const seat = before.current
  const who = before.players[seat]?.name ?? 'Someone'
  const cleared = didClear(before, after)
  const wild = cleared && isWild(playedCards(before, move)[0] ?? { id: '', suit: null, rank: 1 })

  switch (move.type) {
    case 'pickUp':
      return `${who} picked up ${before.discard.length} cards`

    case 'play': {
      const text = labels(resolve(before, seat, move.cards))
      if (wild) return `${who} played ${text} — pile cleared`
      if (cleared) return `SWOOP! ${who} played ${text}`
      return `${who} played ${text}`
    }

    case 'flipFaceDown': {
      const card = before.players[seat]?.faceDown[move.index]
      if (!card) return `${who} flipped a face-down card`
      if (wild) return `${who} flipped ${cardLabel(card)} — pile cleared`
      if (cleared) return `SWOOP! ${who} flipped ${cardLabel(card)}`
      const grew = (after.players[seat]?.hand.length ?? 0) > (before.players[seat]?.hand.length ?? 0)
      if (grew) return `${who} flipped ${cardLabel(card)} — too high, picked up ${before.discard.length + 1}`
      if (after.pendingFlip) return `${who} flipped ${cardLabel(card)}`
      return `${who} flipped ${cardLabel(card)} and played it`
    }

    case 'resolveFlip': {
      const extra = move.addCards.length > 0 ? ` + ${labels(resolve(before, seat, move.addCards))}` : ''
      const flipped = before.pendingFlip ? cardLabel(before.pendingFlip.card) : '?'
      if (cleared) return `SWOOP! ${who} played ${flipped}${extra}`
      return `${who} played ${flipped}${extra}`
    }
  }
}

import type { Card, Move, RoundState } from './types.js'
import type { GameConfig } from './config.js'
import { sortForDisplay, totalPoints } from './cards.js'
import { contiguousTopRun, isPlayerOut, legalMoves } from './rules.js'

/** What one player may see of a seat at the table, including their own. */
export interface SeatView {
  readonly index: number
  readonly name: string
  readonly handCount: number
  /** Visible to everyone; null means already played. */
  readonly faceUp: readonly (Card | null)[]
  /** Which face-down slots still hold a card. The cards themselves stay hidden. */
  readonly faceDownPresent: readonly boolean[]
  readonly isOut: boolean
}

/**
 * Everything one player is entitled to see. Bots receive this rather than the
 * full RoundState, so they cannot read hidden cards — and so an online mode
 * later has its wire format already defined.
 */
export interface PlayerView {
  readonly you: number
  readonly hand: readonly Card[]
  readonly seats: readonly SeatView[]
  readonly current: number
  readonly isYourTurn: boolean
  readonly top: Card | null
  /** The contiguous same-rank run on top, which a swoop can build on. */
  readonly topRun: readonly Card[]
  readonly pileCount: number
  /**
   * The whole pile, oldest first. Public information: every card in it was
   * played face-up in front of everyone, so showing it is a memory aid rather
   * than a leak. A face-down card that flipped too high never lands here.
   */
  readonly pile: readonly Card[]
  /** Spec: the pile's total point value is visible to everyone. */
  readonly pilePoints: number
  readonly burnedCount: number
  readonly turnCount: number
  /** Your revealed face-down card awaiting a combine decision, if any. */
  readonly pendingFlip: Card | null
  readonly status: RoundState['status']
  readonly wentOut: number | null
  /** Empty unless it is your turn. */
  readonly legal: readonly Move[]
}

export function viewFor(state: RoundState, you: number, config: GameConfig): PlayerView {
  const me = state.players[you]
  if (!me) throw new Error(`no player at index ${you}`)
  const isYourTurn = state.current === you && state.status === 'active'

  return {
    you,
    hand: me.hand.slice(),
    seats: state.players.map((p, index) => ({
      index,
      name: p.name,
      handCount: p.hand.length,
      faceUp: p.faceUp.slice(),
      faceDownPresent: p.faceDown.map((c) => c !== null),
      isOut: isPlayerOut(p),
    })),
    current: state.current,
    isYourTurn,
    top: state.discard[state.discard.length - 1] ?? null,
    topRun: contiguousTopRun(state.discard),
    pileCount: state.discard.length,
    pile: state.discard.slice(),
    pilePoints: totalPoints(state.discard, config),
    burnedCount: state.burned.length,
    turnCount: state.turnCount,
    pendingFlip: isYourTurn ? (state.pendingFlip?.card ?? null) : null,
    status: state.status,
    wentOut: state.wentOut,
    legal: isYourTurn ? legalMoves(state, config) : [],
  }
}

/** One player's holdings at the moment a round ended. */
export interface RevealedSeat {
  readonly index: number
  readonly name: string
  readonly hand: readonly Card[]
  readonly faceUp: readonly Card[]
  readonly faceDown: readonly Card[]
  readonly points: number
  readonly wentOut: boolean
}

/**
 * Everyone's remaining cards, for the end-of-round tally. Hidden cards become
 * public at exactly this moment — in a real game you turn them over to count
 * them — so this is the one place face-downs are legible, and it refuses to
 * run while the round is still live.
 */
export function revealRound(state: RoundState, config: GameConfig): RevealedSeat[] {
  if (state.status !== 'complete') {
    throw new Error('cannot reveal hands while the round is still in play')
  }
  return state.players.map((p, index) => {
    const faceUp = p.faceUp.filter((c): c is Card => c !== null)
    const faceDown = p.faceDown.filter((c): c is Card => c !== null)
    return {
      index,
      name: p.name,
      hand: sortForDisplay(p.hand),
      faceUp: sortForDisplay(faceUp),
      faceDown: sortForDisplay(faceDown),
      points: totalPoints([...p.hand, ...faceUp, ...faceDown], config),
      wentOut: state.wentOut === index,
    }
  })
}

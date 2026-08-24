import { useCallback, useMemo, useReducer, useRef, useEffect, useState } from 'react'
import type { Bot } from '../bots/index.js'
import type { CardId, GameState, Move } from '../core/types.js'
import type { GameConfig } from '../core/config.js'
import { makeRng } from '../core/rng.js'
import { createGame, playMove, startNextRound } from '../core/game.js'
import { viewFor } from '../core/view.js'
import { describeMove, detectEvent, type TableEvent } from './describe.js'

export const HUMAN_SEAT = 0
const LOG_LENGTH = 6
/** Plenty of rewinds without letting a long round grow without bound. */
const MAX_HISTORY = 50

export type Speed = 'turtle' | 'slow' | 'normal' | 'fast'

export interface Tempo {
  /** How long an ordinary move stays on the table after it lands. */
  readonly show: number
  /**
   * How long a move that leaves no trace stays up — a clear burns its own
   * cards, a pick-up empties the pile into a hand, a busted flip does both.
   * Longer than `show`, since there is nothing left on the board to re-read.
   */
  readonly hold: number
  /** The beat after the turn passes, with the new player lit, before they act. */
  readonly think: number
}

/**
 * A turn reads in three phases: the move is shown, the highlight passes to the
 * next player, and only then do they move. Bots wait for the previous move to
 * leave the screen before starting to think, so the two never overlap.
 */
export const TEMPOS: Record<Speed, Tempo> = {
  turtle: { show: 2800, hold: 5200, think: 2600 },
  slow: { show: 1300, hold: 2600, think: 1100 },
  normal: { show: 600, hold: 1300, think: 450 },
  fast: { show: 220, hold: 550, think: 150 },
}

export interface GameSetup {
  readonly names: readonly string[]
  readonly bots: readonly (Bot | null)[]
  readonly config: GameConfig
  readonly seed: number
}

export interface Pacing {
  readonly speed: Speed
  /** Bots hold still until resumed, or nudged one move at a time. */
  readonly paused: boolean
}

interface Checkpoint {
  readonly game: GameState
  readonly log: readonly string[]
}

export interface Session {
  readonly game: GameState
  readonly log: readonly string[]
  /** One entry per human move, newest first. */
  readonly history: readonly Checkpoint[]
  /** What just happened, drawn in the middle of the table for a moment. */
  readonly event: TableEvent | null
  /** The move that ended the round, kept for the reveal screen. */
  readonly finalPlay: TableEvent | null
}

export type SessionAction =
  | { type: 'commit'; move: Move; config: GameConfig }
  | { type: 'undo' }
  | { type: 'nextRound'; game: GameState }
  | { type: 'dismissEvent' }

/**
 * Checkpoints are taken before each of the human's moves only, so one undo
 * rewinds their last decision *and* every bot reply that followed it —
 * otherwise a single step would strand them halfway round the table.
 */
export function reduceSession(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'commit': {
      const byHuman = session.game.round.current === HUMAN_SEAT
      const game = playMove(session.game, action.move, action.config)
      const event = detectEvent(session.game.round, game.round, action.move, HUMAN_SEAT, action.config)
      return {
        game,
        log: [describeMove(session.game.round, game.round, action.move), ...session.log].slice(0, LOG_LENGTH),
        history: byHuman
          ? [{ game: session.game, log: session.log }, ...session.history].slice(0, MAX_HISTORY)
          : session.history,
        event,
        finalPlay: game.round.status === 'complete' ? event : null,
      }
    }
    case 'undo': {
      const [previous, ...rest] = session.history
      if (!previous) return session
      return { game: previous.game, log: previous.log, history: rest, event: null, finalPlay: null }
    }
    case 'nextRound':
      return { game: action.game, log: [], history: [], event: null, finalPlay: null }
    case 'dismissEvent':
      return session.event ? { ...session, event: null } : session
  }
}

/**
 * How long an event stays on the table, or null to leave it up indefinitely.
 *
 * `awaitingHuman` is true only while *you* hold a revealed face-down: that card
 * is the whole basis for your decision, so it must not time out. A bot's
 * pending flip still expires — bots wait for the board to clear before moving,
 * so leaving one up forever would stall the game.
 */
export function eventLinger(
  event: TableEvent,
  awaitingHuman: boolean,
  speed: Speed,
): number | null {
  if (awaitingHuman) return null
  const tempo = TEMPOS[speed]
  // The last play of a round gets a longer beat before the scores land on top.
  if (event.wentOut) return tempo.hold * 2
  return event.hold ? tempo.hold : tempo.show
}

export function useGame(setup: GameSetup, pacing: Pacing) {
  const { config } = setup
  const rng = useRef(makeRng(setup.seed))
  const [session, dispatch] = useReducer(reduceSession, undefined, () => ({
    game: createGame(setup.names, config, rng.current),
    log: [] as readonly string[],
    history: [] as readonly Checkpoint[],
    event: null,
    finalPlay: null,
  }))
  const [selected, setSelected] = useState<Set<CardId>>(new Set())
  const { game, event, finalPlay } = session

  const view = useMemo(() => viewFor(game.round, HUMAN_SEAT, config), [game, config])

  const commit = useCallback(
    (move: Move) => {
      dispatch({ type: 'commit', move, config })
      setSelected(new Set())
    },
    [config],
  )

  const botToMove = useCallback((): Bot | null => {
    if (game.status === 'complete' || game.round.status === 'complete') return null
    return setup.bots[game.round.current] ?? null
  }, [game, setup.bots])

  /** Plays one bot turn immediately. Used by the Step button while paused. */
  const stepBot = useCallback(() => {
    const bot = botToMove()
    if (!bot) return
    commit(bot.chooseMove(viewFor(game.round, game.round.current, config), config, rng.current))
  }, [botToMove, game, config, commit])

  // Take the event back off the table once it has been seen.
  useEffect(() => {
    if (!event) return
    const awaitingHuman = game.round.pendingFlip !== null && game.round.current === HUMAN_SEAT
    const linger = eventLinger(event, awaitingHuman, pacing.speed)
    if (linger === null) return
    const timer = setTimeout(() => dispatch({ type: 'dismissEvent' }), linger)
    return () => clearTimeout(timer)
  }, [event, game.round.pendingFlip, game.round.current, pacing.speed])

  // Bots wait for the previous move to leave the table, so the turn passes
  // visibly to them and they sit highlighted for a beat before playing.
  useEffect(() => {
    if (pacing.paused || event) return
    const bot = botToMove()
    if (!bot) return
    const seat = game.round.current
    const timer = setTimeout(() => {
      commit(bot.chooseMove(viewFor(game.round, seat, config), config, rng.current))
    }, TEMPOS[pacing.speed].think)
    return () => clearTimeout(timer)
  }, [game, botToMove, config, commit, pacing.paused, pacing.speed, event])

  const toggle = useCallback((id: CardId) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const undo = useCallback(() => {
    dispatch({ type: 'undo' })
    setSelected(new Set())
  }, [])

  const nextRound = useCallback(() => {
    dispatch({ type: 'nextRound', game: startNextRound(game, config, rng.current) })
    setSelected(new Set())
  }, [game, config])

  return {
    game,
    view,
    selected,
    log: session.log,
    event,
    finalPlay,
    toggle,
    commit,
    undo,
    canUndo: session.history.length > 0,
    nextRound,
    stepBot,
    botIsThinking: botToMove() !== null,
    clearSelection: () => setSelected(new Set()),
  }
}

import type { Bot } from '../bots/index.js'
import type { GameConfig } from '../core/config.js'
import { createGame, playMove, startNextRound } from '../core/game.js'
import { makeRng } from '../core/rng.js'
import { viewFor } from '../core/view.js'

export interface SeatResult {
  readonly botId: string
  wins: number
  totalScore: number
}

export interface SimResult {
  games: number
  seats: SeatResult[]
  rounds: number
  moves: number
  /** Rounds that hit the turn cutoff with nobody going out. */
  stalemates: number
  maxTurnsSeen: number
}

const MAX_ROUNDS_PER_GAME = 500

/**
 * Plays complete games headlessly. Every chosen move is checked against the
 * legal set, so a bot that invents a move fails loudly here rather than
 * corrupting a game in the UI.
 */
export function simulate(
  bots: readonly Bot[],
  config: GameConfig,
  games: number,
  seed: number,
): SimResult {
  const names = bots.map((b, i) => `${b.label}#${i}`)
  const result: SimResult = {
    games,
    seats: bots.map((b) => ({ botId: b.id, wins: 0, totalScore: 0 })),
    rounds: 0,
    moves: 0,
    stalemates: 0,
    maxTurnsSeen: 0,
  }

  for (let g = 0; g < games; g++) {
    const rng = makeRng(seed + g)
    let game = createGame(names, config, rng)
    let rounds = 0

    while (game.status === 'active') {
      if (game.round.status === 'complete') {
        if (++rounds > MAX_ROUNDS_PER_GAME) throw new Error(`game ${g} exceeded round cap`)
        game = startNextRound(game, config, rng)
        continue
      }
      const seat = game.round.current
      const bot = bots[seat]!
      const view = viewFor(game.round, seat, config)
      const move = bot.chooseMove(view, config, rng)
      if (!view.legal.some((m) => JSON.stringify(m) === JSON.stringify(move))) {
        throw new Error(`${bot.id} chose an illegal move: ${JSON.stringify(move)}`)
      }
      result.moves++
      const before = game.round
      game = playMove(game, move, config)
      if (game.round.status === 'complete' && before.status === 'active') {
        result.rounds++
        result.maxTurnsSeen = Math.max(result.maxTurnsSeen, game.round.turnCount)
        if (game.round.wentOut === null) result.stalemates++
      }
    }

    for (let i = 0; i < bots.length; i++) {
      result.seats[i]!.totalScore += game.scores[i] ?? 0
      if (game.winners.includes(i)) result.seats[i]!.wins++
    }
  }

  return result
}

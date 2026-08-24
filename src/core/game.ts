import type { GameState, Move, RoundState } from './types.js'
import type { GameConfig } from './config.js'
import type { Rng } from './rng.js'
import { applyMove } from './rules.js'
import { createRound, scoreRound } from './round.js'

export function createGame(names: readonly string[], config: GameConfig, rng: Rng): GameState {
  const firstPlayer = Math.floor(rng.next() * names.length)
  return {
    names: names.slice(),
    scores: names.map(() => 0),
    round: createRound(names, config, rng, firstPlayer),
    roundNumber: 1,
    firstPlayer,
    lastRoundScores: null,
    status: 'active',
    winners: [],
  }
}

function settleRound(game: GameState, round: RoundState, config: GameConfig): GameState {
  const taken = scoreRound(round, config)
  const scores = game.scores.map((s, i) => s + (taken[i] ?? 0))
  const reachedTarget = scores.some((s) => s >= config.targetScore)
  const lowest = Math.min(...scores)

  return {
    ...game,
    round,
    scores,
    lastRoundScores: taken,
    // Next round is led by whoever went out; a stalemate passes the lead on.
    firstPlayer: round.wentOut ?? (game.firstPlayer + 1) % game.names.length,
    status: reachedTarget ? 'complete' : 'active',
    winners: reachedTarget
      ? scores.flatMap((s, i) => (s === lowest ? [i] : []))
      : [],
  }
}

/** Applies a move to the live round, settling scores if the round ends. */
export function playMove(game: GameState, move: Move, config: GameConfig): GameState {
  if (game.status === 'complete') throw new Error('game is already complete')
  if (game.round.status === 'complete') throw new Error('round is over; start the next one')

  const round = applyMove(game.round, move, config)
  if (round.status === 'active') return { ...game, round }
  return settleRound(game, round, config)
}

/** Deals the next round. Only valid once the current round has finished. */
export function startNextRound(game: GameState, config: GameConfig, rng: Rng): GameState {
  if (game.status === 'complete') throw new Error('game is already complete')
  if (game.round.status === 'active') throw new Error('current round is still in progress')
  return {
    ...game,
    round: createRound(game.names, config, rng, game.firstPlayer),
    roundNumber: game.roundNumber + 1,
    lastRoundScores: null,
  }
}

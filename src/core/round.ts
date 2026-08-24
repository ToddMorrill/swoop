import type { Card, PlayerState, RoundState } from './types.js'
import type { GameConfig } from './config.js'
import type { Rng } from './rng.js'
import { buildDeck, cardsPerPlayer, deckCount, totalPoints } from './cards.js'
import { shuffled } from './rng.js'

export function createRound(
  names: readonly string[],
  config: GameConfig,
  rng: Rng,
  firstPlayer = 0,
): RoundState {
  if (names.length < 2) throw new Error('Swoop needs at least 2 players')

  const deck = shuffled(buildDeck(deckCount(names.length, config), config.useJokers), rng)
  const needed = names.length * cardsPerPlayer(config)
  if (deck.length < needed) throw new Error('deck too small for this player count')

  let next = 0
  const draw = (n: number): Card[] => deck.slice(next, (next += n))

  // Extra cards beyond what the deal needs are set aside for the round.
  const players: PlayerState[] = names.map((name) => ({
    name,
    faceDown: draw(config.zoneSize),
    faceUp: draw(config.zoneSize),
    hand: draw(config.handSize),
  }))

  return {
    players,
    discard: [],
    burned: [],
    current: firstPlayer,
    turnCount: 0,
    pendingFlip: null,
    status: 'active',
    wentOut: null,
  }
}

/**
 * Points each player takes for the round. The player who went out holds no
 * cards and so scores 0 naturally. If the round hit the turn cutoff without
 * anyone going out, every player tallies what they are still holding.
 */
export function scoreRound(state: RoundState, config: GameConfig): number[] {
  return state.players.map((p) =>
    totalPoints(
      [
        ...p.hand,
        ...p.faceUp.filter((c): c is Card => c !== null),
        ...p.faceDown.filter((c): c is Card => c !== null),
      ],
      config,
    ),
  )
}

import { describe, expect, it } from 'vitest'
import { simulate } from '../src/sim/simulate.js'
import { botById } from '../src/bots/registry.js'
import { withDefaults } from '../src/core/config.js'

const config = withDefaults()
const bots = (...ids: string[]) => ids.map(botById)

describe('simulation', () => {
  it('plays complete games without illegal moves or stalemates', () => {
    const r = simulate(bots('hard', 'easy', 'random', 'random'), config, 150, 1)
    expect(r.stalemates).toBe(0)
    expect(r.rounds).toBeGreaterThan(0)
    expect(r.maxTurnsSeen).toBeLessThan(config.maxTurnsPerRound)
    expect(r.seats.reduce((n, s) => n + s.wins, 0)).toBeGreaterThanOrEqual(150)
  })

  it('is seat-fair: identical bots win about equally often', () => {
    const r = simulate(bots('hard', 'hard', 'hard', 'hard'), config, 400, 5)
    for (const seat of r.seats) {
      expect(seat.wins / 400).toBeGreaterThan(0.15)
      expect(seat.wins / 400).toBeLessThan(0.35)
    }
  })

  // The real correctness signal: if the rules or the heuristics were wrong,
  // skill would not translate into fewer points.
  it('ranks the bots hard > easy > random', () => {
    const r = simulate(bots('hard', 'easy', 'random'), config, 300, 9)
    const [hard, easy, random] = r.seats as [typeof r.seats[0], typeof r.seats[0], typeof r.seats[0]]
    expect(hard.totalScore).toBeLessThan(easy.totalScore)
    expect(easy.totalScore).toBeLessThan(random.totalScore)
    expect(hard.wins).toBeGreaterThan(easy.wins + random.wins)
  })

  it('handles two players and six players with jokers', () => {
    expect(simulate(bots('hard', 'random'), config, 40, 2).stalemates).toBe(0)
    const six = simulate(
      bots('hard', 'easy', 'random', 'hard', 'easy', 'random'),
      withDefaults({ useJokers: true }),
      40,
      3,
    )
    expect(six.stalemates).toBe(0)
  })
})

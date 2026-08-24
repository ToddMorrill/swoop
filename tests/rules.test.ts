import { describe, expect, it } from 'vitest'
import { round, fromHand, fromFaceUp } from './helpers.js'
import { applyMove, legalMoves, isPlayerOut } from '../src/core/rules.js'
import { scoreRound } from '../src/core/round.js'
import { withDefaults } from '../src/core/config.js'
import type { Card } from '../src/core/types.js'

const top = (s: { discard: Card[] }) => s.discard[s.discard.length - 1] ?? null

// The scenarios below are the acceptance list from the spec review, one test
// each, in order.
describe('spec scenarios', () => {
  it('1. any rank may be played on an empty pile, and multiples must share a rank', () => {
    const { state, config } = round([{ hand: ['KS', 'KH', 'KD', '3C'] }, { hand: ['2S'] }])
    const kings = fromHand(state, 0, 13)
    const next = applyMove(state, { type: 'play', cards: kings }, config)
    expect(next.discard).toHaveLength(3)
    expect(next.current).toBe(1)

    expect(() =>
      applyMove(state, { type: 'play', cards: [kings[0]!, ...fromHand(state, 0, 3)] }, config),
    ).toThrow(/share a rank/)
  })

  it('2. a face-down that flips too high takes the pile, ends the turn, and does not go out', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null, null, null, null], faceDown: ['QS', null, null, null] }, { hand: ['2S'] }],
      { discard: ['9H', '5D'] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    // Pile plus the flipped Queen all land in hand.
    expect(next.players[0]!.hand.map((c) => c.rank).sort((a, b) => Number(a) - Number(b))).toEqual([5, 9, 12])
    expect(next.discard).toHaveLength(0)
    expect(next.current).toBe(1)
    expect(next.status).toBe('active')
    expect(isPlayerOut(next.players[0]!)).toBe(false)
  })

  it('3. completing a fourth same-rank card on the pile swoops, clears, and grants another turn', () => {
    const { state, config } = round([{ hand: ['7S', '2C'] }, { hand: ['2S'] }], {
      discard: ['7H', '7D', '7C'],
    })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 7) }, config)
    expect(next.discard).toHaveLength(0)
    expect(next.burned).toHaveLength(4)
    expect(next.current).toBe(0)
  })

  it('4. four of a kind straight from hand swoops onto an unrelated top card', () => {
    const { state, config } = round([{ hand: ['5S', '5H', '5D', '5C', '2C'] }, { hand: ['2S'] }], {
      discard: ['KH'],
    })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 5) }, config)
    expect(next.discard).toHaveLength(0)
    expect(next.burned).toHaveLength(5) // the King went with them
    expect(next.current).toBe(0)
    expect(next.status).toBe('active')
  })

  it('5. tens do not fill out a swoop set; they simply clear', () => {
    const { state, config } = round([{ hand: ['6S', '6H', '10D', '10C'] }, { hand: ['2S'] }], {
      discard: ['6C'],
    })
    const played = applyMove(state, { type: 'play', cards: fromHand(state, 0, 6) }, config)
    expect(played.discard).toHaveLength(3) // run of three, not a swoop
    expect(played.current).toBe(1)

    const cleared = applyMove(state, { type: 'play', cards: fromHand(state, 0, 10) }, config)
    expect(cleared.discard).toHaveLength(0)
    expect(cleared.current).toBe(0) // wild grants another turn
  })

  it('6. a flip onto an empty pile cannot fail', () => {
    const { state, config } = round(
      [{ hand: ['2S', '3H'], faceUp: [null], faceDown: ['KS'] }, { hand: ['2H'] }],
      { discard: [] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(top(next)?.rank).toBe(13)
    expect(next.players[0]!.hand).toHaveLength(2) // nothing picked up
    expect(next.current).toBe(1)
  })

  it('7. a flip onto a low top card is a real gamble', () => {
    const { state, config } = round(
      [{ hand: ['2S', '3H'], faceUp: [null], faceDown: ['KS'] }, { hand: ['2H'] }],
      { discard: ['4D'] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(next.players[0]!.hand).toHaveLength(4) // 2 held + the 4 + the King
    expect(next.discard).toHaveLength(0)
  })

  it('8. after a pick-up the next player faces an empty pile and may play any rank', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['KH'] }], { discard: ['3D', '2H'] })
    const after = applyMove(state, { type: 'pickUp' }, config)
    expect(after.discard).toHaveLength(0)
    expect(after.current).toBe(1)
    const moves = legalMoves(after, config)
    expect(moves.some((m) => m.type === 'play')).toBe(true)
    expect(moves.some((m) => m.type === 'pickUp')).toBe(false) // nothing to pick up
  })

  it('9. going out on a ten ends the round and scores zero', () => {
    const { state, config } = round([{ hand: ['10S'] }, { hand: ['KH', '9D'] }], { discard: ['4D'] })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 10) }, config)
    expect(next.status).toBe('complete')
    expect(next.wentOut).toBe(0)
    expect(scoreRound(next, config)).toEqual([0, 19])
  })

  it('10. tied lowest scores share the win', () => {
    const config = withDefaults({ targetScore: 50 })
    const scores = [50, 12, 12]
    const lowest = Math.min(...scores)
    expect(scores.flatMap((s, i) => (s === lowest ? [i] : []))).toEqual([1, 2])
    expect(scores.some((s) => s >= config.targetScore)).toBe(true)
  })

  it('11. a player with a legal play may still choose to pick up', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['KH'] }], { discard: ['9D'] })
    const moves = legalMoves(state, config)
    expect(moves.some((m) => m.type === 'play')).toBe(true)
    expect(moves.some((m) => m.type === 'pickUp')).toBe(true)
    const after = applyMove(state, { type: 'pickUp' }, config)
    expect(after.players[0]!.hand).toHaveLength(2)
    expect(after.current).toBe(1)
  })

  it('12. a flipped card combines with matching cards in hand, and can swoop', () => {
    const { state, config } = round(
      [
        { hand: ['6S', '6H', '6D'], faceUp: [null], faceDown: ['6C'] },
        { hand: ['2S'] },
      ],
      { discard: ['8H'] },
    )
    const flipped = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    // A real choice exists, so the engine pauses for it.
    expect(flipped.pendingFlip?.card.rank).toBe(6)
    expect(flipped.current).toBe(0)

    const resolved = applyMove(
      flipped,
      { type: 'resolveFlip', addCards: fromHand(flipped, 0, 6) },
      config,
    )
    expect(resolved.discard).toHaveLength(0) // four 6s swooped
    expect(resolved.burned).toHaveLength(5)
    expect(resolved.current).toBe(0)
  })

  it('13. a single play may mix hand and face-up cards', () => {
    const { state, config } = round(
      [{ hand: ['6S'], faceUp: ['6H', 'KD'] }, { hand: ['2S'] }],
      { discard: ['8H'] },
    )
    const next = applyMove(
      state,
      { type: 'play', cards: [...fromHand(state, 0, 6), ...fromFaceUp(state, 0, 6)] },
      config,
    )
    expect(next.discard).toHaveLength(3)
    expect(next.players[0]!.hand).toHaveLength(0)
    expect(next.players[0]!.faceUp[0]).toBeNull()
  })
})

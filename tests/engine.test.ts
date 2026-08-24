import { describe, expect, it } from 'vitest'
import { round, fromHand } from './helpers.js'
import { applyMove, legalMoves, contiguousTopRun, unblockedFaceDownIndices } from '../src/core/rules.js'
import { createRound, scoreRound } from '../src/core/round.js'
import { createGame, playMove, startNextRound } from '../src/core/game.js'
import { buildDeck, cardsPerPlayer, deckCount, pointValue, sortForDisplay } from '../src/core/cards.js'
import { withDefaults } from '../src/core/config.js'
import { makeRng } from '../src/core/rng.js'
import { viewFor } from '../src/core/view.js'
import type { Card } from '../src/core/types.js'

describe('the <= rule', () => {
  it('a swoop does not exempt you from it: four Kings cannot go on a 5', () => {
    const { state, config } = round([{ hand: ['KS', 'KH', 'KD', 'KC'] }, { hand: ['2S'] }], {
      discard: ['5D'],
    })
    expect(legalMoves(state, config).some((m) => m.type === 'play')).toBe(false)
    expect(() => applyMove(state, { type: 'play', cards: fromHand(state, 0, 13) }, config)).toThrow(
      /cannot play/,
    )
  })

  it('only an Ace or a wild can follow an Ace', () => {
    const { state, config } = round([{ hand: ['AS', '2H', '10D', 'KC'] }, { hand: ['2S'] }], {
      discard: ['AD'],
    })
    const playable = legalMoves(state, config)
      .filter((m) => m.type === 'play')
      .flatMap((m) => (m.type === 'play' ? m.cards : []))
    const ranks = new Set(
      playable.map((id) => state.players[0]!.hand.find((c) => c.id === id)!.rank),
    )
    expect([...ranks].sort((a, b) => Number(a) - Number(b))).toEqual([1, 10])
  })

  it('an Ace is playable on anything', () => {
    for (const topRank of ['2H', '9D', 'KC']) {
      const { state, config } = round([{ hand: ['AS'] }, { hand: ['2S'] }], { discard: [topRank] })
      expect(legalMoves(state, config).some((m) => m.type === 'play')).toBe(true)
    }
  })
})

describe('wilds', () => {
  it('a ten may be played on an empty pile; it burns itself and grants another turn', () => {
    const { state, config } = round([{ hand: ['10S', '3H'] }, { hand: ['2S'] }], { discard: [] })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 10) }, config)
    expect(next.discard).toHaveLength(0)
    expect(next.burned).toHaveLength(1)
    expect(next.current).toBe(0)
  })

  it('several wilds can go at once, shedding their points together', () => {
    const { state, config } = round([{ hand: ['10S', '10H', '3C'] }, { hand: ['2S'] }], {
      discard: ['4D'],
    })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 10) }, config)
    expect(next.players[0]!.hand).toHaveLength(1)
    expect(next.burned).toHaveLength(3)
    expect(next.current).toBe(0)
  })

  it('jokers pool with tens as a single play group', () => {
    const config = withDefaults({ useJokers: true })
    const { state } = round([{ hand: ['10S', 'JKR', '3C'] }, { hand: ['2S'] }], {
      discard: ['4D'],
      config: { useJokers: true },
    })
    const ids = state.players[0]!.hand.filter((c) => c.rank === 10 || c.rank === 'JOKER').map((c) => c.id)
    const next = applyMove(state, { type: 'play', cards: ids }, config)
    expect(next.discard).toHaveLength(0)
    expect(next.current).toBe(0)
  })

  it('a flipped wild clears immediately without pausing to combine', () => {
    const { state, config } = round(
      [{ hand: ['10H', '3C'], faceUp: [null], faceDown: ['10S'] }, { hand: ['2S'] }],
      { discard: ['4D'] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(next.pendingFlip).toBeNull()
    expect(next.discard).toHaveLength(0)
    expect(next.current).toBe(0)
  })
})

describe('face-down cards', () => {
  it('stay blocked until the face-up card above them is played', () => {
    const { state, config } = round([{ hand: [], faceUp: ['5S', null], faceDown: ['2H', '3D'] }, { hand: ['2S'] }])
    expect(unblockedFaceDownIndices(state.players[0]!)).toEqual([1])
    expect(() => applyMove(state, { type: 'flipFaceDown', index: 0 }, config)).toThrow(/covered/)
  })

  it('resolve without pausing when no matching cards are available', () => {
    const { state, config } = round(
      [{ hand: ['KH'], faceUp: [null], faceDown: ['3S'] }, { hand: ['2S'] }],
      { discard: ['8D'] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(next.pendingFlip).toBeNull()
    expect(next.discard).toHaveLength(2)
    expect(next.current).toBe(1)
  })

  it('allow only one flip per play', () => {
    const { state, config } = round(
      [{ hand: ['6H'], faceUp: [null, null], faceDown: ['6S', '4D'] }, { hand: ['2S'] }],
      { discard: ['8D'] },
    )
    const flipped = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(flipped.pendingFlip).not.toBeNull()
    expect(legalMoves(flipped, config).every((m) => m.type === 'resolveFlip')).toBe(true)
    expect(() => applyMove(flipped, { type: 'flipFaceDown', index: 1 }, config)).toThrow(/one face-down flip/)
  })

  it('may be flipped even when the hand holds a playable card (free choice)', () => {
    const { state, config } = round(
      [{ hand: ['2H'], faceUp: [null], faceDown: ['9S'] }, { hand: ['2S'] }],
      { discard: ['KD'] },
    )
    const moves = legalMoves(state, config)
    expect(moves.some((m) => m.type === 'play')).toBe(true)
    expect(moves.some((m) => m.type === 'flipFaceDown')).toBe(true)
  })

  it('a too-high flip on your last card does not end the round', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null], faceDown: ['KS'] }, { hand: ['2S'] }],
      { discard: ['3D'] },
    )
    const next = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    expect(next.status).toBe('active')
    expect(next.players[0]!.hand).toHaveLength(2)
  })
})

describe('going out', () => {
  it('happens when a swoop uses the last cards', () => {
    const { state, config } = round([{ hand: ['7S'] }, { hand: ['2S', '3H'] }], {
      discard: ['7H', '7D', '7C'],
    })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 7) }, config)
    expect(next.status).toBe('complete')
    expect(next.wentOut).toBe(0)
  })

  it('requires every zone to be empty', () => {
    const { state, config } = round(
      [{ hand: ['2S'], faceUp: [null], faceDown: ['3H'] }, { hand: ['5S'] }],
      { discard: ['9D'] },
    )
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 2) }, config)
    expect(next.status).toBe('active')
  })
})

describe('scoring', () => {
  it('uses the spec values, with the ten value configurable', () => {
    const config = withDefaults()
    const value = (spec: string, rank: Card['rank']) => pointValue({ id: spec, suit: 'S', rank }, config)
    expect(value('a', 1)).toBe(1)
    expect(value('7', 7)).toBe(7)
    expect(value('j', 11)).toBe(10)
    expect(value('q', 12)).toBe(10)
    expect(value('k', 13)).toBe(10)
    expect(value('t', 10)).toBe(25)
    expect(pointValue({ id: 'x', suit: null, rank: 'JOKER' }, config)).toBe(25)
    expect(pointValue({ id: 'y', suit: 'S', rank: 10 }, withDefaults({ tenPoints: 50 }))).toBe(50)
  })

  it('counts every zone, and the player who went out takes nothing', () => {
    const { state, config } = round([
      { hand: [], faceUp: [], faceDown: [] },
      { hand: ['KS'], faceUp: ['AH'], faceDown: ['10D'] },
    ])
    expect(scoreRound(state, config)).toEqual([0, 36])
  })
})

describe('deck sizing', () => {
  it('follows ceil(players x 19 / 52)', () => {
    const config = withDefaults()
    expect(cardsPerPlayer(config)).toBe(19)
    expect([2, 3, 4, 5, 6, 8].map((n) => deckCount(n, config))).toEqual([1, 2, 2, 2, 3, 3])
  })

  it('switches to 54-card decks when jokers are in play', () => {
    const config = withDefaults({ useJokers: true })
    expect(deckCount(3, config)).toBe(2)
    expect(buildDeck(1, true)).toHaveLength(54)
    expect(buildDeck(2, false)).toHaveLength(104)
  })

  it('gives every card a unique id', () => {
    const deck = buildDeck(3, true)
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })
})

describe('hand display order', () => {
  it('runs wilds, then Ace low through King', () => {
    const { state } = round([
      { hand: ['KS', '3H', 'AS', '10D', 'QC', '9H', 'JS', '2D'] },
      { hand: ['2S'] },
    ])
    expect(sortForDisplay(state.players[0]!.hand).map((c) => c.rank)).toEqual([
      10, 1, 2, 3, 9, 11, 12, 13,
    ])
  })

  it('puts jokers ahead of the tens', () => {
    const { state } = round([{ hand: ['10D', 'JKR', 'AS'] }, { hand: ['2S'] }])
    expect(sortForDisplay(state.players[0]!.hand).map((c) => c.rank)).toEqual(['JOKER', 10, 1])
  })

  it('does not mutate the hand it is given', () => {
    const { state } = round([{ hand: ['KS', 'AS'] }, { hand: ['2S'] }])
    const before = state.players[0]!.hand.map((c) => c.id)
    sortForDisplay(state.players[0]!.hand)
    expect(state.players[0]!.hand.map((c) => c.id)).toEqual(before)
  })
})

describe('determinism', () => {
  it('deals identically from the same seed and differently from another', () => {
    const config = withDefaults()
    const names = ['A', 'B', 'C']
    const a = createRound(names, config, makeRng(42))
    const b = createRound(names, config, makeRng(42))
    const c = createRound(names, config, makeRng(43))
    expect(a.players[0]!.hand.map((x) => x.id)).toEqual(b.players[0]!.hand.map((x) => x.id))
    expect(a.players[0]!.hand.map((x) => x.id)).not.toEqual(c.players[0]!.hand.map((x) => x.id))
  })

  it('never mutates the state passed to applyMove', () => {
    const { state, config } = round([{ hand: ['2S', '3H'] }, { hand: ['4S'] }], { discard: ['9D'] })
    const before = JSON.stringify(state)
    applyMove(state, { type: 'play', cards: fromHand(state, 0, 2) }, config)
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('pile mechanics', () => {
  it('reports the contiguous same-rank run at the top', () => {
    const { state } = round([{ hand: [] }, { hand: [] }], { discard: ['3S', '7H', '7D', '7C'] })
    expect(contiguousTopRun(state.discard)).toHaveLength(3)
    expect(contiguousTopRun([])).toHaveLength(0)
  })

  it('refuses a pick-up when the pile is empty', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], { discard: [] })
    expect(() => applyMove(state, { type: 'pickUp' }, config)).toThrow(/empty pile/)
  })
})

describe('round cutoff', () => {
  it('ends the round with nobody out once the turn bound is hit', () => {
    const { state, config } = round([{ hand: ['2S', '3H'] }, { hand: ['2H', '3D'] }], {
      discard: ['KD'],
      config: { maxTurnsPerRound: 1 },
    })
    const next = applyMove(state, { type: 'play', cards: fromHand(state, 0, 2) }, config)
    expect(next.status).toBe('complete')
    expect(next.wentOut).toBeNull()
  })
})

describe('views', () => {
  it('hide opponents hands and everybody face-down cards', () => {
    const config = withDefaults()
    const state = createRound(['You', 'Bot'], config, makeRng(7))
    const view = viewFor(state, 0, config)
    const serialised = JSON.stringify(view)
    for (const hidden of state.players[1]!.hand) expect(serialised).not.toContain(hidden.id)
    for (const p of state.players) {
      for (const hidden of p.faceDown) expect(serialised).not.toContain(hidden!.id)
    }
    expect(view.seats[1]!.handCount).toBe(config.handSize)
    expect(view.seats[1]!.faceUp.filter(Boolean)).toHaveLength(config.zoneSize)
    expect(view.hand).toHaveLength(config.handSize)
  })

  it('expose the pile total and top run, and only offer moves on your turn', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], {
      discard: ['KD', '7H', '7C'],
    })
    const yours = viewFor(state, 0, config)
    expect(yours.pilePoints).toBe(24)
    expect(yours.topRun).toHaveLength(2)
    expect(yours.legal.length).toBeGreaterThan(0)
    expect(viewFor(state, 1, config).legal).toHaveLength(0)
  })
})

describe('game loop', () => {
  it('accumulates scores, ends at the threshold, and picks the lowest score', () => {
    const config = withDefaults({ targetScore: 1 })
    const rng = makeRng(3)
    let game = createGame(['A', 'B'], config, rng)
    game = { ...game, round: { ...game.round, current: 0 } }
    // Force an immediate finish: strip player 0 to a single playable card.
    const forced = round([{ hand: ['AS'] }, { hand: ['KH', '9D'] }], { discard: [] })
    game = { ...game, round: forced.state }
    game = playMove(game, { type: 'play', cards: fromHand(forced.state, 0, 1) }, config)
    expect(game.round.status).toBe('complete')
    expect(game.scores).toEqual([0, 19])
    expect(game.status).toBe('complete')
    expect(game.winners).toEqual([0])
    expect(() => startNextRound(game, config, rng)).toThrow(/already complete/)
  })

  it('deals a new round led by whoever went out', () => {
    const config = withDefaults({ targetScore: 10_000 })
    const rng = makeRng(11)
    let game = createGame(['A', 'B', 'C'], config, rng)
    const forced = round([{ hand: ['5S'] }, { hand: ['KH'] }, { hand: ['2D'] }], { discard: [] })
    game = { ...game, round: forced.state }
    game = playMove(game, { type: 'play', cards: fromHand(forced.state, 0, 5) }, config)
    expect(game.status).toBe('active')
    expect(game.firstPlayer).toBe(0)
    const next = startNextRound(game, config, rng)
    expect(next.round.current).toBe(0)
    expect(next.roundNumber).toBe(2)
  })
})

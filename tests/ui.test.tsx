// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { App } from '../src/ui/App.js'
import { YourZone } from '../src/ui/components/YourZone.js'
import { Seat } from '../src/ui/components/Seat.js'
import { PileInspector } from '../src/ui/components/PileInspector.js'
import { Pile } from '../src/ui/components/Pile.js'
import { Scoreboard } from '../src/ui/components/Scoreboard.js'
import { Setup } from '../src/ui/components/Setup.js'
import { Rules } from '../src/ui/components/Rules.js'
import { evaluateSelection, isPlayable } from '../src/ui/selection.js'
import { describeMove, detectEvent } from '../src/ui/describe.js'
import { viewFor, revealRound } from '../src/core/view.js'
import { applyMove } from '../src/core/rules.js'
import { round, fromHand } from './helpers.js'
import { reduceSession, eventLinger, TEMPOS } from '../src/ui/useGame.js'
import { createGame, playMove } from '../src/core/game.js'
import { makeRng } from '../src/core/rng.js'
import { withDefaults } from '../src/core/config.js'
import type { Card } from '../src/core/types.js'

afterEach(cleanup)

const find = (view: ReturnType<typeof viewFor>, rank: Card['rank']) =>
  view.hand.find((c) => c.rank === rank)!

describe('selection rules mirror the engine', () => {
  it('accepts a same-rank set that is low enough', () => {
    const { state, config } = round([{ hand: ['6S', '6H', 'KD'] }, { hand: ['2S'] }], { discard: ['8H'] })
    const view = viewFor(state, 0, config)
    const sixes = new Set(view.hand.filter((c) => c.rank === 6).map((c) => c.id))
    expect(evaluateSelection(view, sixes).valid).toBe(true)
  })

  it('rejects mixed ranks and cards above the top card', () => {
    const { state, config } = round([{ hand: ['6S', '3H', 'KD'] }, { hand: ['2S'] }], { discard: ['8H'] })
    const view = viewFor(state, 0, config)
    expect(evaluateSelection(view, new Set([find(view, 6).id, find(view, 3).id])).reason).toMatch(/share a rank/)
    expect(evaluateSelection(view, new Set([find(view, 13).id])).reason).toMatch(/equal to or lower/)
    expect(isPlayable(view, find(view, 13))).toBe(false)
    expect(isPlayable(view, find(view, 6))).toBe(true)
  })

  it('restricts the selection to the flipped rank mid-flip', () => {
    const { state, config } = round(
      [{ hand: ['6S', '3H'], faceUp: [null], faceDown: ['6C'] }, { hand: ['2S'] }],
      { discard: ['8H'] },
    )
    const flipped = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    const view = viewFor(flipped, 0, config)
    expect(view.pendingFlip?.rank).toBe(6)
    expect(evaluateSelection(view, new Set([find(view, 6).id])).valid).toBe(true)
    expect(evaluateSelection(view, new Set([find(view, 3).id])).valid).toBe(false)
    // Playing it alone is always allowed.
    expect(evaluateSelection(view, new Set()).valid).toBe(true)
  })
})

describe('move descriptions', () => {
  it('names a swoop, a pick-up, and a failed flip', () => {
    const swoop = round([{ hand: ['7S', '2C'] }, { hand: ['2S'] }], { discard: ['7H', '7D', '7C'] })
    const after = applyMove(swoop.state, { type: 'play', cards: fromHand(swoop.state, 0, 7) }, swoop.config)
    expect(describeMove(swoop.state, after, { type: 'play', cards: fromHand(swoop.state, 0, 7) })).toMatch(/^SWOOP!/)

    const grab = round([{ hand: ['2S'] }, { hand: ['3H'] }], { discard: ['3D', '2H'] })
    const grabbed = applyMove(grab.state, { type: 'pickUp' }, grab.config)
    expect(describeMove(grab.state, grabbed, { type: 'pickUp' })).toMatch(/picked up 2 cards/)

    const bust = round(
      [{ hand: [], faceUp: [null], faceDown: ['QS'] }, { hand: ['2S'] }],
      { discard: ['9H', '5D'] },
    )
    const busted = applyMove(bust.state, { type: 'flipFaceDown', index: 0 }, bust.config)
    expect(describeMove(bust.state, busted, { type: 'flipFaceDown', index: 0 })).toMatch(/too high, picked up 3/)
  })
})

describe('your zone', () => {
  it('offers a flip on an exposed slot and disables play with nothing selected', () => {
    const { state, config } = round(
      [{ hand: ['6S'], faceUp: [null, 'KD'], faceDown: ['6C', '2H'] }, { hand: ['2S'] }],
      { discard: ['8H'] },
    )
    const view = viewFor(state, 0, config)
    const onFlip = vi.fn()
    render(
      <YourZone
        view={view}
        selected={new Set()}
        onToggle={() => {}}
        onPlay={() => {}}
        onFlip={onFlip}
        onPickUp={() => {}}
      />,
    )
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /Pick up/ }) as HTMLButtonElement).disabled).toBe(false)

    // The uncovered face-down slot is clickable; the covered one is not.
    const flipButtons = screen.getAllByTitle(/Flip this hidden card/)
    expect(flipButtons).toHaveLength(1)
    flipButtons[0]!.click()
    expect(onFlip).toHaveBeenCalledWith(0)
  })
})

describe('opponent seats', () => {
  it('show one card back per card in hand, so the count is readable at a glance', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: ['3H', '4D', '5C'], faceUp: ['KS', null], faceDown: ['2H', '9D'] }],
      { discard: ['8H'] },
    )
    const view = viewFor(state, 0, config)
    const { container } = render(<Seat seat={view.seats[1]!} active={false} />)
    expect(container.querySelectorAll('.hand-backs .card.back')).toHaveLength(3)
    // The tableau still shows the two hidden cards under the face-up row.
    expect(container.querySelectorAll('.stack .card.back')).toHaveLength(2)
  })

  it('says so when a hand is empty rather than drawing nothing', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: [], faceUp: ['KS'] }], { discard: ['8H'] })
    const view = viewFor(state, 0, config)
    const { container } = render(<Seat seat={view.seats[1]!} active={false} />)
    expect(container.querySelectorAll('.hand-backs .card.back')).toHaveLength(0)
    expect(screen.getByText('hand empty')).toBeTruthy()
  })
})

describe('pacing', () => {
  // Pinned so a bot, not the human, is first to move.
  const BOT_FIRST = 1_700_000_000_000

  it('holds the bots still while paused and advances exactly one turn per step', async () => {
    vi.useFakeTimers()
    const now = vi.spyOn(Date, 'now').mockReturnValue(BOT_FIRST)
    try {
      render(<App />)
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      await act(async () => {
        screen.getByRole('button', { name: 'Pause' }).click()
      })

      const placeholder = /Play a card equal to or lower than the top card/
      expect(screen.getByText(placeholder)).toBeTruthy()

      // However long we wait, a paused table does not move.
      await act(async () => {
        vi.advanceTimersByTime(30_000)
      })
      expect(screen.getByText(placeholder)).toBeTruthy()

      await act(async () => {
        screen.getByRole('button', { name: 'Step' }).click()
      })
      expect(screen.queryByText(placeholder)).toBeNull()
    } finally {
      now.mockRestore()
      vi.useRealTimers()
    }
  })

  it('disables Step unless the table is paused with a bot to move', async () => {
    vi.useFakeTimers()
    const now = vi.spyOn(Date, 'now').mockReturnValue(BOT_FIRST)
    try {
      render(<App />)
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      expect((screen.getByRole('button', { name: 'Step' }) as HTMLButtonElement).disabled).toBe(true)
      await act(async () => {
        screen.getByRole('button', { name: 'Pause' }).click()
      })
      expect((screen.getByRole('button', { name: 'Step' }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      now.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('the app end to end', () => {
  it('deals a game from the setup screen and shows the table', async () => {
    vi.useFakeTimers()
    try {
      render(<App />)
      expect(screen.getByRole('heading', { name: 'Swoop' })).toBeTruthy()
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      expect(screen.getByText(/Round 1/)).toBeTruthy()
      expect(screen.getByText(/Your hand \(11\)/)).toBeTruthy()
      // Three opponents were requested by default.
      expect(screen.getAllByText(/in hand/)).toHaveLength(3)
      // Let the bots take a few turns; nothing should throw.
      await act(async () => {
        vi.advanceTimersByTime(20_000)
      })
      expect(screen.getByText(/burned/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('rewind', () => {
  const config = withDefaults({ targetScore: 10_000 })

  function session(seats: Parameters<typeof round>[0], discard: string[]) {
    const built = round(seats, { discard })
    const game = createGame(
      built.state.players.map((p) => p.name),
      config,
      makeRng(1),
    )
    return {
      state: { game: { ...game, round: built.state }, log: [] as readonly string[], history: [], event: null, finalPlay: null },
      round: built.state,
    }
  }

  it('does nothing when there is nothing to take back', () => {
    const { state } = session([{ hand: ['2S'] }, { hand: ['3H'] }], ['9D'])
    expect(reduceSession(state, { type: 'undo' })).toBe(state)
  })

  it('restores the board and the log to just before your move', () => {
    const { state, round: r } = session([{ hand: ['2S', '4H'] }, { hand: ['3H'] }], ['9D'])
    const move = { type: 'play', cards: fromHand(r, 0, 2) } as const
    const played = reduceSession(state, { type: 'commit', move, config })
    expect(played.game.round.players[0]!.hand).toHaveLength(1)
    expect(played.log).toHaveLength(1)

    const back = reduceSession(played, { type: 'undo' })
    expect(back.game.round.players[0]!.hand).toHaveLength(2)
    expect(back.game.round.discard).toHaveLength(1)
    expect(back.log).toHaveLength(0)
    expect(back.history).toHaveLength(0)
  })

  // The point of the feature: one rewind undoes your move and the replies to it.
  it('rewinds the opponents replies along with your move', () => {
    const { state, round: r } = session(
      [{ hand: ['2S', '4H'] }, { hand: ['AH', '5D'] }, { hand: ['AC', '6S'] }],
      ['9D'],
    )
    const mine = { type: 'play', cards: fromHand(r, 0, 2) } as const
    let s = reduceSession(state, { type: 'commit', move: mine, config })
    const afterMine = s.game.round
    s = reduceSession(s, { type: 'commit', move: { type: 'play', cards: fromHand(afterMine, 1, 1) }, config })
    s = reduceSession(s, { type: 'commit', move: { type: 'pickUp' }, config })
    expect(s.log).toHaveLength(3)
    expect(s.history).toHaveLength(1) // only my move was checkpointed

    const back = reduceSession(s, { type: 'undo' })
    expect(back.game.round.current).toBe(0)
    expect(back.game.round.players[0]!.hand).toHaveLength(2)
    expect(back.game.round.players[1]!.hand).toHaveLength(2)
    expect(back.log).toHaveLength(0)
  })

  it('steps back one of your moves at a time', () => {
    const { state, round: r } = session([{ hand: ['2S', '3H', '4D'] }, { hand: ['AH', '5D'] }], [])
    let s = reduceSession(state, { type: 'commit', move: { type: 'play', cards: fromHand(r, 0, 4) }, config })
    s = reduceSession(s, { type: 'commit', move: { type: 'pickUp' }, config })
    s = reduceSession(s, { type: 'commit', move: { type: 'play', cards: fromHand(s.game.round, 0, 3) }, config })
    expect(s.history).toHaveLength(2)

    const once = reduceSession(s, { type: 'undo' })
    expect(once.game.round.players[0]!.hand).toHaveLength(2)
    const twice = reduceSession(once, { type: 'undo' })
    expect(twice.game.round.players[0]!.hand).toHaveLength(3)
    expect(twice.history).toHaveLength(0)
  })

  it('drops the history when a new round is dealt', () => {
    const { state, round: r } = session([{ hand: ['2S', '4H'] }, { hand: ['3H'] }], ['9D'])
    const played = reduceSession(state, { type: 'commit', move: { type: 'play', cards: fromHand(r, 0, 2) }, config })
    const dealt = reduceSession(played, { type: 'nextRound', game: played.game })
    expect(dealt.history).toHaveLength(0)
    expect(dealt.log).toHaveLength(0)
  })
})

describe('discard pile inspection', () => {
  it('exposes the whole pile on the view, oldest first', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], {
      discard: ['KD', '7H', '7C'],
    })
    const view = viewFor(state, 0, config)
    expect(view.pile.map((c) => c.rank)).toEqual([13, 7, 7])
    expect(view.pile).toHaveLength(view.pileCount)
  })

  it('lists every card in the pile with its point value and a rank tally', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], {
      discard: ['KD', '7H', '7C', 'AS'],
    })
    const view = viewFor(state, 0, config)
    const { container } = render(<PileInspector view={view} config={config} onClose={() => {}} />)

    expect(container.querySelectorAll('.inspector-card')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: /Discard pile — 4 cards, 25 pts/ })).toBeTruthy()
    // Tally is in hand order: A, then 7s, then K.
    const tally = container.querySelector('.tally')!.textContent
    expect(tally).toContain('A × 1')
    expect(tally).toContain('7 × 2')
    expect(tally).toContain('K × 1')
  })

  it('opens from the pile and closes again', async () => {
    vi.useFakeTimers()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      render(<App />)
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      // Nothing has been played yet, so there is nothing to inspect.
      const pileButton = screen.getByTitle('See every card in the discard pile') as HTMLButtonElement
      expect(pileButton.disabled).toBe(true)

      // Generous, so this holds whatever the default tempo is.
      await act(async () => {
        vi.advanceTimersByTime(20_000)
      })
      expect((screen.getByTitle('See every card in the discard pile') as HTMLButtonElement).disabled).toBe(false)
      await act(async () => {
        screen.getByTitle('See every card in the discard pile').click()
      })
      expect(screen.getByRole('heading', { name: /Discard pile/ })).toBeTruthy()
      await act(async () => {
        screen.getByRole('button', { name: 'Close' }).click()
      })
      expect(screen.queryByRole('heading', { name: /Discard pile/ })).toBeNull()
    } finally {
      now.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe('showing what happened on the table', () => {
  const cfg = withDefaults()
  const HUMAN = 0
  const BOT = 1

  it('shows a swoop with the whole set, including cards already on the pile', () => {
    const { state, config } = round([{ hand: ['7S', '2C'] }, { hand: ['2S'] }], {
      discard: ['KD', '7H', '7D', '7C'],
    })
    const move = { type: 'play', cards: fromHand(state, 0, 7) } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.tone).toBe('good')
    expect(e.headline).toMatch(/^SWOOP! P0/)
    expect(e.cards.map((c) => c.rank)).toEqual([7, 7, 7, 7])
    expect(e.detail).toBe('5 cards out of play')
    expect(e.hold).toBe(true)
  })

  it('shows the wilds that cleared a pile', () => {
    const { state, config } = round([{ hand: ['10S', '10H', '3C'] }, { hand: ['2S'] }], {
      discard: ['4D', '9H'],
    })
    const move = { type: 'play', cards: fromHand(state, 0, 10) } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.headline).toMatch(/cleared the pile/)
    expect(e.cards).toHaveLength(2)
    expect(e.hold).toBe(true)
  })

  // The card stays hidden from everyone but the player who flipped it.
  it('shows an opponent bust as a face-down card with no rank', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: [], faceUp: [null], faceDown: ['QS'] }],
      { discard: ['9H', '5D'], current: BOT },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.tone).toBe('bad')
    expect(e.headline).toBe('P1 flipped too high')
    expect(e.cards).toHaveLength(0)
    expect(e.hidden).toBe(1)
    expect(e.detail).toBe('picked up 3 cards')
    expect(e.hold).toBe(true)
  })

  it('shows your own bust face-up, since you learn the card either way', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null], faceDown: ['QS'] }, { hand: ['2S'] }],
      { discard: ['9H', '5D'] },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.headline).toBe('You flipped Q♠ — too high')
    expect(e.cards.map((c) => c.rank)).toEqual([12])
    expect(e.hidden).toBe(0)
  })

  it('shows a pick-up with its size and cost', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], { discard: ['KD', '9H'] })
    const e = detectEvent(state, applyMove(state, { type: 'pickUp' }, config), { type: 'pickUp' }, HUMAN, config)!
    expect(e.tone).toBe('bad')
    expect(e.headline).toBe('P0 picked up the pile')
    expect(e.detail).toBe('2 cards · 19 pts')
    expect(e.hold).toBe(true)
  })

  it('shows an ordinary play without freezing the table for it', () => {
    const { state, config } = round([{ hand: ['6S', '6H', '4C'] }, { hand: ['2S'] }], { discard: ['8H'] })
    const move = { type: 'play', cards: fromHand(state, 0, 6) } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.tone).toBe('neutral')
    expect(e.headline).toBe('P0 played')
    expect(e.cards).toHaveLength(2)
    expect(e.hold).toBe(false)
  })

  it('marks cards that came out of the hidden row', () => {
    const { state, config } = round(
      [{ hand: ['KH'], faceUp: [null], faceDown: ['3S'] }, { hand: ['2S'] }],
      { discard: ['8D'] },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.headline).toBe('P0 played from hidden')
    expect(e.cards.map((c) => c.rank)).toEqual([3])
  })

  it('announces a revealed flip that is still waiting on a decision', () => {
    const { state, config } = round(
      [{ hand: ['6S', '6H'], faceUp: [null], faceDown: ['6C'] }, { hand: ['2S'] }],
      { discard: ['8H'] },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    expect(e.headline).toBe('P0 flipped from hidden')
    expect(e.detail).toBe('choosing what to add')
    expect(e.hold).toBe(false)
  })

  it('draws the panel beside the pile, backs and all', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: [], faceUp: [null], faceDown: ['QS'] }],
      { discard: ['9H', '5D'], current: BOT },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const e = detectEvent(state, applyMove(state, move, config), move, HUMAN, config)!
    const view = viewFor(state, HUMAN, config)
    const { container } = render(<Pile view={view} event={e} onInspect={() => {}} />)

    expect(container.querySelectorAll('.event-bad .card.back')).toHaveLength(1)
    expect(container.querySelectorAll('.event .card:not(.back)')).toHaveLength(0)
    expect(screen.getByText('P1 flipped too high')).toBeTruthy()
    // The pile stays visible and inspectable alongside the event.
    expect(screen.getByTitle('See every card in the discard pile')).toBeTruthy()
  })

  it('holds the bots only for events that leave no trace on the board', () => {
    const { state, config } = round([{ hand: ['10S', '3C'] }, { hand: ['2S'] }], { discard: ['4D'] })
    const game = createGame(['You', 'Bot'], cfg, makeRng(1))
    const start = { game: { ...game, round: state }, log: [] as readonly string[], history: [], event: null, finalPlay: null }
    const move = { type: 'play', cards: fromHand(state, 0, 10) } as const
    const after = reduceSession(start, { type: 'commit', move, config })
    expect(after.event?.hold).toBe(true)
    expect(reduceSession(after, { type: 'dismissEvent' }).event).toBeNull()
    // Rewinding drops a stale event rather than leaving it hanging.
    expect(reduceSession(after, { type: 'undo' }).event).toBeNull()
  })
})

describe('end-of-round reveal', () => {
  it('refuses to turn hands over while the round is still live', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['3H'] }], { discard: ['9D'] })
    expect(() => revealRound(state, config)).toThrow(/still in play/)
  })

  it('turns over every zone once the round is done, with each player point total', () => {
    const { state, config } = round([{ hand: ['10S'] }, { hand: ['KH', 'AD'], faceUp: ['9C'], faceDown: ['2H'] }], {
      discard: ['4D'],
    })
    const done = applyMove(state, { type: 'play', cards: fromHand(state, 0, 10) }, config)
    expect(done.status).toBe('complete')

    const seats = revealRound(done, config)
    expect(seats[0]!.wentOut).toBe(true)
    expect(seats[0]!.points).toBe(0)
    expect(seats[1]!.hand.map((c) => c.rank)).toEqual([1, 13]) // sorted for display
    expect(seats[1]!.faceUp.map((c) => c.rank)).toEqual([9])
    expect(seats[1]!.faceDown.map((c) => c.rank)).toEqual([2])
    expect(seats[1]!.points).toBe(22) // K10 + A1 + 9 + 2
  })

  it('draws every player hand and freezes on a Next round button', () => {
    const { state, config } = round(
      [{ hand: ['10S'] }, { hand: ['KH', 'AD'], faceUp: ['9C'], faceDown: ['2H'] }],
      { discard: ['4D'] },
    )
    const base = createGame(['You', 'Bot'], withDefaults({ targetScore: 10_000 }), makeRng(1))
    const played = playMove(
      { ...base, round: state },
      { type: 'play', cards: fromHand(state, 0, 10) },
      config,
    )
    const { container } = render(
      <Scoreboard game={played} config={config} finalPlay={null} onNextRound={() => {}} onNewGame={() => {}} />,
    )

    expect(screen.getByText(/Round 1 over/)).toBeTruthy()
    expect(screen.getByText('went out')).toBeTruthy()
    // Every card the loser held is shown, across all three zones.
    expect(container.querySelectorAll('.reveal-seat')).toHaveLength(2)
    expect(container.querySelectorAll('.reveal-zone')).toHaveLength(3)
    expect(container.querySelectorAll('.reveal-zones .card')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Next round' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New game' })).toBeNull()
  })

  it('offers a new game instead once someone reaches the target', () => {
    const { state, config } = round([{ hand: ['10S'] }, { hand: ['KH'] }], { discard: ['4D'] })
    const base = createGame(['You', 'Bot'], withDefaults({ targetScore: 5 }), makeRng(1))
    const played = playMove({ ...base, round: state }, { type: 'play', cards: fromHand(state, 0, 10) }, withDefaults({ targetScore: 5 }))
    render(<Scoreboard game={played} config={config} finalPlay={null} onNextRound={() => {}} onNewGame={() => {}} />)
    expect(screen.getByText(/You wins/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New game' })).toBeTruthy()
  })
})

describe('the play that ends a round', () => {
  const cfg = withDefaults({ targetScore: 10_000 })

  it('is flagged so it holds on the table instead of flashing past', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null], faceDown: ['3S'] }, { hand: ['KH', '9D'] }],
      { discard: ['8D'] },
    )
    const move = { type: 'flipFaceDown', index: 0 } as const
    const after = applyMove(state, move, config)
    expect(after.status).toBe('complete')

    const e = detectEvent(state, after, move, 0, config)!
    expect(e.wentOut).toBe(true)
    expect(e.hold).toBe(true)
    expect(e.cards.map((c) => c.rank)).toEqual([3])
  })

  it('is not flagged for a move that leaves cards behind', () => {
    const { state, config } = round([{ hand: ['2S', '4H'] }, { hand: ['KH'] }], { discard: ['8D'] })
    const move = { type: 'play', cards: fromHand(state, 0, 2) } as const
    expect(detectEvent(state, applyMove(state, move, config), move, 0, config)!.wentOut).toBe(false)
  })

  it('is kept for the reveal screen even after it leaves the table', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null], faceDown: ['3S'] }, { hand: ['KH', '9D'] }],
      { discard: ['8D'] },
    )
    const game = createGame(['You', 'Bot'], cfg, makeRng(1))
    const start = {
      game: { ...game, round: state },
      log: [] as readonly string[],
      history: [],
      event: null,
      finalPlay: null,
    }
    const after = reduceSession(start, { type: 'commit', move: { type: 'flipFaceDown', index: 0 }, config })
    expect(after.finalPlay?.wentOut).toBe(true)

    // Dismissing the on-table event must not take the reveal copy with it.
    const dismissed = reduceSession(after, { type: 'dismissEvent' })
    expect(dismissed.event).toBeNull()
    expect(dismissed.finalPlay?.wentOut).toBe(true)
  })

  it('is drawn at the top of the tally', () => {
    const { state, config } = round(
      [{ hand: [], faceUp: [null], faceDown: ['3S'] }, { hand: ['KH', '9D'] }],
      { discard: ['8D'] },
    )
    const base = createGame(['You', 'Bot'], cfg, makeRng(1))
    const move = { type: 'flipFaceDown', index: 0 } as const
    const played = playMove({ ...base, round: state }, move, config)
    const finalPlay = detectEvent(state, played.round, move, 0, config)

    const { container } = render(
      <Scoreboard game={played} config={config} finalPlay={finalPlay} onNextRound={() => {}} onNewGame={() => {}} />,
    )
    expect(container.querySelectorAll('.final-play .card')).toHaveLength(1)
    expect(screen.getByText('P0 played from hidden')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next round' })).toBeTruthy()
  })
})

describe('tempo', () => {
  it('offers four tempos, slowest first, and starts on Slow', async () => {
    expect(Object.keys(TEMPOS)).toEqual(['turtle', 'slow', 'normal', 'fast'])
    for (const phase of ['show', 'hold', 'think'] as const) {
      const values = Object.values(TEMPOS).map((t) => t[phase])
      expect(values).toEqual([...values].sort((a, b) => b - a))
    }
    // A trace-less move must outlast an ordinary one: there is nothing left on
    // the board to go back and read.
    for (const tempo of Object.values(TEMPOS)) {
      expect(tempo.hold).toBeGreaterThan(tempo.show)
      expect(tempo.show).toBeGreaterThan(0)
      expect(tempo.think).toBeGreaterThan(0)
    }

    vi.useFakeTimers()
    try {
      render(<App />)
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      const select = screen.getByLabelText('Bot speed') as HTMLSelectElement
      expect(select.value).toBe('slow')
      expect([...select.options].map((o) => o.textContent)).toEqual(['Turtle', 'Slow', 'Normal', 'Fast'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a revealed face-down card', () => {
  function pending() {
    const { state, config } = round(
      [{ hand: ['6S', '6H', 'KD'], faceUp: [null], faceDown: ['6C'] }, { hand: ['2S'] }],
      { discard: ['8H'] },
    )
    const flipped = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    return { before: state, state: flipped, config, view: viewFor(flipped, 0, config) }
  }

  it('is drawn face-up beside the decision, not just described', () => {
    const { view } = pending()
    const { container } = render(
      <YourZone
        view={view}
        selected={new Set()}
        onToggle={() => {}}
        onPlay={() => {}}
        onFlip={() => {}}
        onPickUp={() => {}}
      />,
    )
    const preview = container.querySelector('.pending-flip')!
    expect(preview.querySelectorAll('.card')).toHaveLength(1)
    expect(preview.textContent).toContain('6♣')
    expect(preview.textContent).toContain('matching 6s')
    expect(screen.getByRole('button', { name: 'Play it alone' })).toBeTruthy()
  })

  it('offers to carry matching cards along once they are selected', () => {
    const { state, view } = pending()
    const sixes = new Set(view.hand.filter((c) => c.rank === 6).map((c) => c.id))
    render(
      <YourZone
        view={view}
        selected={sixes}
        onToggle={() => {}}
        onPlay={() => {}}
        onFlip={() => {}}
        onPickUp={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Play with 2 more' })).toBeTruthy()
    expect(state.pendingFlip?.card.rank).toBe(6)
  })

  // The card is the whole basis for the decision, so it must not time out.
  it('stays on the table for as long as the decision is open', () => {
    const { before, state, config } = pending()
    const event = detectEvent(before, state, { type: 'flipFaceDown', index: 0 }, 0, config)!
    expect(eventLinger(event, true, 'slow')).toBeNull()
    expect(eventLinger(event, false, 'slow')).toBeGreaterThan(0)
  })

  it('still lets ordinary events expire, and holds the round-ending one longest', () => {
    const plain = round([{ hand: ['6S', '4C'] }, { hand: ['2S'] }], { discard: ['8H'] })
    const move = { type: 'play', cards: fromHand(plain.state, 0, 6) } as const
    const e = detectEvent(plain.state, applyMove(plain.state, move, plain.config), move, 0, plain.config)!
    expect(eventLinger(e, false, 'turtle')).toBe(TEMPOS.turtle.show)
    expect(eventLinger({ ...e, hold: true }, false, 'turtle')).toBe(TEMPOS.turtle.hold)
    expect(eventLinger({ ...e, wentOut: true }, false, 'turtle')).toBe(TEMPOS.turtle.hold * 2)
  })
})

describe('whose turn it is', () => {
  const cfg = withDefaults()

  it('records who made each move', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: ['6S', '4C'] }, { hand: ['3H'] }],
      { discard: ['8H'], current: 1 },
    )
    const move = { type: 'play', cards: fromHand(state, 1, 6) } as const
    const after = applyMove(state, move, config)
    const e = detectEvent(state, after, move, 0, config)!
    expect(e.seat).toBe(1)
    // The engine has already passed the turn on, which is why the event has
    // to carry the actor rather than the UI reading state.current.
    expect(after.current).toBe(2)
  })

  it('keeps the actor on a move that wins another turn', () => {
    const { state, config } = round([{ hand: ['2S'] }, { hand: ['10S', '4C'] }], {
      discard: ['8H'],
      current: 1,
    })
    const move = { type: 'play', cards: fromHand(state, 1, 10) } as const
    const after = applyMove(state, move, config)
    const e = detectEvent(state, after, move, 0, config)!
    expect(e.seat).toBe(1)
    expect(after.current).toBe(1)
  })

  it('lights the seat that acted, not the seat that is next, while the move shows', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: ['6S', '4C'] }, { hand: ['3H'] }],
      { discard: ['8H'], current: 1 },
    )
    const game = createGame(['You', 'A', 'B'], cfg, makeRng(1))
    const start = {
      game: { ...game, round: state },
      log: [] as readonly string[],
      history: [],
      event: null,
      finalPlay: null,
    }
    const after = reduceSession(start, { type: 'commit', move: { type: 'play', cards: fromHand(state, 1, 6) }, config })

    const lit = (s: typeof after) => (s.event ? s.event.seat : s.game.round.current)
    expect(lit(after)).toBe(1) // still showing seat 1's move
    expect(lit(reduceSession(after, { type: 'dismissEvent' }))).toBe(2) // then it moves on
  })
})

describe('the rhythm of a turn', () => {
  const cfg = withDefaults()

  function botFlipPending() {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: ['6S', '6H'], faceUp: [null], faceDown: ['6C'] }],
      { discard: ['8H'], current: 1 },
    )
    const after = applyMove(state, { type: 'flipFaceDown', index: 0 }, config)
    return { before: state, after, config }
  }

  // Bots now wait for the board to clear before moving, so an event that never
  // expires would stall the game outright.
  it("lets a bot's revealed flip expire, unlike your own", () => {
    const { before, after, config } = botFlipPending()
    expect(after.pendingFlip).not.toBeNull()
    expect(after.current).toBe(1)
    const e = detectEvent(before, after, { type: 'flipFaceDown', index: 0 }, 0, config)!
    // Not awaiting the human, so it times out and the bot can carry on.
    expect(eventLinger(e, false, 'slow')).toBe(TEMPOS.slow.show)
    expect(eventLinger(e, true, 'slow')).toBeNull()
  })

  it('passes the highlight on before the next player moves', () => {
    const { state, config } = round(
      [{ hand: ['2S'] }, { hand: ['6S', '4C'] }, { hand: ['3H'] }],
      { discard: ['8H'], current: 1 },
    )
    const game = createGame(['You', 'A', 'B'], cfg, makeRng(1))
    const start = {
      game: { ...game, round: state },
      log: [] as readonly string[],
      history: [],
      event: null,
      finalPlay: null,
    }
    const played = reduceSession(start, {
      type: 'commit',
      move: { type: 'play', cards: fromHand(state, 1, 6) },
      config,
    })
    const lit = (s: typeof played) => (s.event ? s.event.seat : s.game.round.current)

    // Phase 1: the move is on screen and its player is still lit.
    expect(lit(played)).toBe(1)
    // Phase 2: it clears, the highlight moves on, and nothing has been played.
    const cleared = reduceSession(played, { type: 'dismissEvent' })
    expect(lit(cleared)).toBe(2)
    expect(cleared.game.round.discard).toEqual(played.game.round.discard)
  })
})

describe('the landing page', () => {
  it('leads with the rules, since arrivals have never heard of Swoop', () => {
    render(<Setup onStart={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Swoop' })).toBeTruthy()
    for (const heading of ['The idea', 'Your turn', 'Scoring', 'Two ways to clear the pile']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Deal' })).toBeTruthy()
    expect(screen.getByLabelText('Bot skill')).toBeTruthy()
  })

  it('quotes the point values that are actually selected', () => {
    const { container, rerender } = render(<Rules config={withDefaults()} />)
    expect(container.textContent).toContain('Worth 25 points')
    expect(container.textContent).not.toContain('jokers')

    rerender(<Rules config={withDefaults({ tenPoints: 50, jokerPoints: 50, useJokers: true, targetScore: 500 })} />)
    expect(container.textContent).toContain('Worth 50 points')
    expect(container.textContent).toContain('jokers 50')
    expect(container.textContent).toContain('500 points')
  })

  it('hands the chosen options to the game', () => {
    const onStart = vi.fn()
    render(<Setup onStart={onStart} />)
    screen.getByRole('button', { name: 'Deal' }).click()
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ opponents: 3, botId: 'hard' }),
    )
  })
})

describe('rules during play', () => {
  it('can be reopened from the table and dismissed', async () => {
    vi.useFakeTimers()
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    try {
      render(<App />)
      await act(async () => {
        screen.getByRole('button', { name: 'Deal' }).click()
      })
      expect(screen.queryByRole('heading', { name: 'How to play' })).toBeNull()

      await act(async () => {
        screen.getByRole('button', { name: 'Rules' }).click()
      })
      expect(screen.getByRole('heading', { name: 'How to play' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Hidden cards are a gamble' })).toBeTruthy()

      await act(async () => {
        screen.getByRole('button', { name: 'Back to the game' }).click()
      })
      expect(screen.queryByRole('heading', { name: 'How to play' })).toBeNull()
    } finally {
      now.mockRestore()
      vi.useRealTimers()
    }
  })
})

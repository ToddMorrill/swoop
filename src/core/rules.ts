import type { Card, CardId, Move, PlayerState, RoundState } from './types.js'
import type { GameConfig } from './config.js'
import { isWild, orderValue, playGroup, type PlayGroup } from './cards.js'

/** Minimum same-rank cards on the top of the pile that trigger a swoop. */
export const SWOOP_SIZE = 4

export function currentPlayer(state: RoundState): PlayerState {
  const p = state.players[state.current]
  if (!p) throw new Error(`no player at index ${state.current}`)
  return p
}

export function topCard(state: RoundState): Card | null {
  return state.discard[state.discard.length - 1] ?? null
}

/**
 * The run of same-rank cards at the top of the pile. This is what a swoop
 * builds on, and what players are allowed to see (spec: the pile shows the
 * contiguous same-rank run, not just the top card).
 */
export function contiguousTopRun(discard: readonly Card[]): Card[] {
  const top = discard[discard.length - 1]
  if (!top) return []
  const run: Card[] = []
  for (let i = discard.length - 1; i >= 0; i--) {
    const c = discard[i]!
    if (c.rank !== top.rank) break
    run.unshift(c)
  }
  return run
}

/** Can a card of this play group go on this top card? */
export function groupPlayableOn(group: PlayGroup, top: Card | null): boolean {
  if (group === 'WILD') return true
  if (top === null) return true
  return group <= orderValue(top)
}

export function isPlayerOut(player: PlayerState): boolean {
  return (
    player.hand.length === 0 &&
    player.faceUp.every((c) => c === null) &&
    player.faceDown.every((c) => c === null)
  )
}

/** Face-down slots whose covering face-up card has already been played. */
export function unblockedFaceDownIndices(player: PlayerState): number[] {
  const out: number[] = []
  for (let i = 0; i < player.faceDown.length; i++) {
    if (player.faceDown[i] && !player.faceUp[i]) out.push(i)
  }
  return out
}

/** Cards a player can currently select from: hand plus their face-up cards. */
export function availableCards(player: PlayerState): Card[] {
  return [...player.hand, ...player.faceUp.filter((c): c is Card => c !== null)]
}

function groupCards(player: PlayerState): Map<PlayGroup, { hand: Card[]; faceUp: Card[] }> {
  const groups = new Map<PlayGroup, { hand: Card[]; faceUp: Card[] }>()
  const bucket = (g: PlayGroup) => {
    let b = groups.get(g)
    if (!b) {
      b = { hand: [], faceUp: [] }
      groups.set(g, b)
    }
    return b
  }
  for (const c of player.hand) bucket(playGroup(c)).hand.push(c)
  for (const c of player.faceUp) if (c) bucket(playGroup(c)).faceUp.push(c)
  return groups
}

/**
 * Every distinct move available to the player to move.
 *
 * Moves are canonicalised: same-rank cards within a zone are interchangeable,
 * so a group of N is enumerated as counts (how many from hand, how many from
 * face-up) rather than as every subset. Hand and face-up are kept separate
 * because playing a face-up card unblocks the face-down beneath it.
 */
export function legalMoves(state: RoundState, _config: GameConfig): Move[] {
  if (state.status === 'complete') return []
  const player = currentPlayer(state)
  const moves: Move[] = []

  // Mid-flip: the only decision left is what to add to the revealed card.
  if (state.pendingFlip) {
    const group = playGroup(state.pendingFlip.card)
    const bucket = groupCards(player).get(group) ?? { hand: [], faceUp: [] }
    for (let nHand = 0; nHand <= bucket.hand.length; nHand++) {
      for (let nFaceUp = 0; nFaceUp <= bucket.faceUp.length; nFaceUp++) {
        moves.push({
          type: 'resolveFlip',
          addCards: [
            ...bucket.hand.slice(0, nHand),
            ...bucket.faceUp.slice(0, nFaceUp),
          ].map((c) => c.id),
        })
      }
    }
    return moves
  }

  const top = topCard(state)

  for (const [group, bucket] of groupCards(player)) {
    if (!groupPlayableOn(group, top)) continue
    for (let nHand = 0; nHand <= bucket.hand.length; nHand++) {
      for (let nFaceUp = 0; nFaceUp <= bucket.faceUp.length; nFaceUp++) {
        if (nHand + nFaceUp === 0) continue
        moves.push({
          type: 'play',
          cards: [
            ...bucket.hand.slice(0, nHand),
            ...bucket.faceUp.slice(0, nFaceUp),
          ].map((c) => c.id),
        })
      }
    }
  }

  // Free choice of zone: a flip is legal at any time, even with a playable
  // hand. It is a gamble, not a last resort.
  for (const i of unblockedFaceDownIndices(player)) {
    moves.push({ type: 'flipFaceDown', index: i })
  }

  if (state.discard.length > 0) moves.push({ type: 'pickUp' })

  return moves
}

function cloneRound(s: RoundState): RoundState {
  return {
    players: s.players.map((p) => ({
      name: p.name,
      hand: p.hand.slice(),
      faceUp: p.faceUp.slice(),
      faceDown: p.faceDown.slice(),
    })),
    discard: s.discard.slice(),
    burned: s.burned.slice(),
    current: s.current,
    turnCount: s.turnCount,
    pendingFlip: s.pendingFlip,
    status: s.status,
    wentOut: s.wentOut,
  }
}

/** Removes the given cards from hand/face-up, or throws if any is unavailable. */
function takeCards(player: PlayerState, ids: readonly CardId[]): Card[] {
  const taken: Card[] = []
  for (const id of ids) {
    const handIdx = player.hand.findIndex((c) => c.id === id)
    if (handIdx >= 0) {
      taken.push(player.hand.splice(handIdx, 1)[0]!)
      continue
    }
    const upIdx = player.faceUp.findIndex((c) => c?.id === id)
    if (upIdx >= 0) {
      taken.push(player.faceUp[upIdx]!)
      player.faceUp[upIdx] = null
      continue
    }
    throw new Error(`card ${id} is not available to ${player.name}`)
  }
  return taken
}

function advance(s: RoundState): void {
  s.current = (s.current + 1) % s.players.length
}

function clearPile(s: RoundState, alsoBurn: readonly Card[] = []): void {
  s.burned.push(...s.discard, ...alsoBurn)
  s.discard = []
}

/**
 * Lands non-wild cards on the pile and resolves a swoop if one completes.
 * Returns true when the player has earned another turn.
 */
function landOnPile(s: RoundState, cards: readonly Card[]): boolean {
  s.discard.push(...cards)
  if (contiguousTopRun(s.discard).length >= SWOOP_SIZE) {
    clearPile(s)
    return true
  }
  return false
}

/** Ends the round if the player to move has run out of cards. */
function finishIfOut(s: RoundState): boolean {
  if (!isPlayerOut(currentPlayer(s))) return false
  s.status = 'complete'
  s.wentOut = s.current
  s.pendingFlip = null
  return true
}

/**
 * Applies a move and returns the resulting state. Pure — the input is never
 * mutated. Throws on an illegal move rather than silently correcting it, so
 * that bot and UI bugs surface immediately.
 */
export function applyMove(state: RoundState, move: Move, config: GameConfig): RoundState {
  if (state.status === 'complete') throw new Error('round is already complete')
  const s = cloneRound(state)
  const player = currentPlayer(s)
  s.turnCount++

  switch (move.type) {
    case 'pickUp': {
      if (s.pendingFlip) throw new Error('cannot pick up mid-flip')
      if (s.discard.length === 0) throw new Error('cannot pick up an empty pile')
      player.hand.push(...s.discard)
      s.discard = []
      advance(s)
      break
    }

    case 'play': {
      if (s.pendingFlip) throw new Error('must resolve the pending flip first')
      if (move.cards.length === 0) throw new Error('play requires at least one card')
      const cards = takeCards(player, move.cards)
      const groups = new Set(cards.map(playGroup))
      if (groups.size > 1) throw new Error('all cards in a play must share a rank')
      const group = [...groups][0]!
      if (!groupPlayableOn(group, topCard(s))) {
        throw new Error(`cannot play ${group} on ${topCard(s)?.rank}`)
      }
      let extraTurn: boolean
      if (group === 'WILD') {
        clearPile(s, cards)
        extraTurn = true
      } else {
        extraTurn = landOnPile(s, cards)
      }
      if (finishIfOut(s)) break
      if (!extraTurn) advance(s)
      break
    }

    case 'flipFaceDown': {
      if (s.pendingFlip) throw new Error('only one face-down flip per play')
      const card = player.faceDown[move.index]
      if (!card) throw new Error(`no face-down card at slot ${move.index}`)
      if (player.faceUp[move.index]) throw new Error(`slot ${move.index} is still covered`)
      player.faceDown[move.index] = null

      if (isWild(card)) {
        clearPile(s, [card])
        if (finishIfOut(s)) break
        break // wild grants another turn: do not advance
      }

      if (!groupPlayableOn(playGroup(card), topCard(s))) {
        // Too high: the flipped card joins the pile, then the whole pile is
        // picked up. The player never goes out this way.
        s.discard.push(card)
        player.hand.push(...s.discard)
        s.discard = []
        advance(s)
        break
      }

      // Legal. Pause only if there is a real choice of cards to add.
      const bucket = groupCards(player).get(playGroup(card))
      const hasAdditions = (bucket?.hand.length ?? 0) + (bucket?.faceUp.length ?? 0) > 0
      if (hasAdditions) {
        s.pendingFlip = { card, faceDownIndex: move.index }
        break // same player continues; turn does not advance
      }
      const extraTurn = landOnPile(s, [card])
      if (finishIfOut(s)) break
      if (!extraTurn) advance(s)
      break
    }

    case 'resolveFlip': {
      const pending = s.pendingFlip
      if (!pending) throw new Error('no pending flip to resolve')
      const additions = takeCards(player, move.addCards)
      const group = playGroup(pending.card)
      if (additions.some((c) => playGroup(c) !== group)) {
        throw new Error('added cards must match the revealed rank')
      }
      s.pendingFlip = null
      const extraTurn = landOnPile(s, [pending.card, ...additions])
      if (finishIfOut(s)) break
      if (!extraTurn) advance(s)
      break
    }
  }

  // Nothing in the rules guarantees termination, so bound the round.
  if (s.status === 'active' && s.turnCount >= config.maxTurnsPerRound) {
    s.status = 'complete'
    s.wentOut = null
    s.pendingFlip = null
  }

  return s
}

import type { Card, NumericRank, Rank, Suit } from './types.js'
import type { GameConfig } from './config.js'

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C']
export const SUIT_SYMBOL: Readonly<Record<Suit, string>> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
}

const STANDARD_RANKS: readonly NumericRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

/** Cards each player needs: hand + face-up + face-down. */
export function cardsPerPlayer(config: GameConfig): number {
  return config.handSize + config.zoneSize * 2
}

/** Wilds are playable on anything, clear the pile, and never remain on it. */
export function isWild(card: Card): boolean {
  return card.rank === 10 || card.rank === 'JOKER'
}

/**
 * Position in the <= ordering. Only defined for non-wild ranks: wilds have no
 * place in the ordering and can never be the top card, since playing one
 * clears the pile.
 */
export function orderValue(card: Card): number {
  if (isWild(card)) {
    throw new Error(`orderValue called on wild card ${card.id}`)
  }
  return card.rank as number
}

/**
 * Cards may be played together only if they share a play group. Non-wilds
 * group by rank; all wilds pool into one group, since a 10 and a joker have
 * identical effect and the spec gives jokers "the same role as 10s".
 */
export type PlayGroup = NumericRank | 'WILD'

export function playGroup(card: Card): PlayGroup {
  return isWild(card) ? 'WILD' : (card.rank as NumericRank)
}

export function pointValue(card: Card, config: GameConfig): number {
  if (card.rank === 'JOKER') return config.jokerPoints
  if (card.rank === 10) return config.tenPoints
  if (card.rank >= 11) return 10
  return card.rank
}

export function totalPoints(cards: readonly Card[], config: GameConfig): number {
  return cards.reduce((sum, c) => sum + pointValue(c, config), 0)
}

/** ceil(players * 19 / 52), or / 54 when jokers are in play. */
export function deckCount(players: number, config: GameConfig): number {
  const perDeck = config.useJokers ? 54 : 52
  return Math.ceil((players * cardsPerPlayer(config)) / perDeck)
}

export function buildDeck(numDecks: number, useJokers: boolean): Card[] {
  const cards: Card[] = []
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of STANDARD_RANKS) {
        cards.push({ id: `d${d}-${suit}${rank}`, suit, rank })
      }
    }
    if (useJokers) {
      cards.push({ id: `d${d}-J0`, suit: null, rank: 'JOKER' })
      cards.push({ id: `d${d}-J1`, suit: null, rank: 'JOKER' })
    }
  }
  return cards
}

/**
 * Sort position in a player's hand: wilds first, then Ace low through King.
 * Keeping the 10s at the near end groups the escape hatches together, and the
 * rest of the hand then reads in the same order as the <= rule.
 */
export function handSortKey(card: Card): number {
  if (card.rank === 'JOKER') return -1
  if (card.rank === 10) return 0
  return card.rank
}

/** A display-ordered copy of a hand. Pure, so a native UI can reuse it. */
export function sortForDisplay(cards: readonly Card[]): Card[] {
  return cards
    .slice()
    .sort((a, b) => handSortKey(a) - handSortKey(b) || (a.suit ?? '').localeCompare(b.suit ?? ''))
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 'JOKER':
      return 'JKR'
    case 1:
      return 'A'
    case 11:
      return 'J'
    case 12:
      return 'Q'
    case 13:
      return 'K'
    default:
      return String(rank)
  }
}

export function cardLabel(card: Card): string {
  return card.suit ? `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}` : rankLabel(card.rank)
}

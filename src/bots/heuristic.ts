import type { Bot } from './index.js'
import { largestResolve, pointsOf, resolveCards, wouldSwoop } from './index.js'
import { isWild, orderValue } from '../core/cards.js'
import type { Move } from '../core/types.js'
import type { PlayerView } from '../core/view.js'

/**
 * A plausible novice. It gets the big idea right — shed the expensive cards
 * while the top card is still high enough to allow it — but plays one card at
 * a time, never spots a swoop, never gambles on a face-down by choice, and
 * only spends a wild when it has nothing else.
 */
export const easyBot: Bot = {
  id: 'easy',
  label: 'Easy',
  chooseMove(view, config, _rng) {
    const resolve = largestResolve(view.legal)
    if (resolve) return resolve

    const singles = view.legal
      .filter((m): m is Extract<Move, { type: 'play' }> => m.type === 'play')
      .map((m) => ({ move: m, cards: resolveCards(view, m.cards) }))
      .filter((p) => p.cards.length === 1)

    const plain = singles.filter((p) => !isWild(p.cards[0]!))
    if (plain.length > 0) {
      // Highest points first, then highest rank, to clear liabilities early.
      plain.sort(
        (a, b) =>
          pointsOf(b.cards, config) - pointsOf(a.cards, config) ||
          orderValue(b.cards[0]!) - orderValue(a.cards[0]!),
      )
      return plain[0]!.move
    }

    const wild = singles.find((p) => isWild(p.cards[0]!))
    if (wild) return wild.move
    const pickUp = view.legal.find((m) => m.type === 'pickUp')
    if (pickUp) return pickUp
    return view.legal[0]!
  },
}

/**
 * Chance that a random unseen card outranks the current top. Wilds are always
 * safe, so only the ranks strictly above the top can lose.
 */
function flipRisk(view: PlayerView): number {
  if (!view.top) return 0
  const top = orderValue(view.top)
  const losingRanks = 13 - top // ranks above the top, excluding the wild 10
  return Math.max(0, losingRanks) / 13
}

/**
 * The strongest of the three. Its priorities, in order:
 *   1. Take any swoop — it clears the pile and buys another turn for free.
 *   2. Flip a face-down while it is cheap: on an empty pile or a King it
 *      cannot fail at all, and the cost of failing scales with the pile.
 *   3. Shed point liabilities in bulk, breaking ties toward the lower rank so
 *      the next player is squeezed.
 *   4. Hold wilds back as an escape hatch rather than spending them early.
 */
export const hardBot: Bot = {
  id: 'hard',
  label: 'Hard',
  chooseMove(view, config, _rng) {
    const resolve = largestResolve(view.legal)
    if (resolve) return resolve

    let best: { move: Move; score: number } | null = null
    const consider = (move: Move, score: number) => {
      if (!best || score > best.score) best = { move, score }
    }

    for (const move of view.legal) {
      switch (move.type) {
        case 'play': {
          const cards = resolveCards(view, move.cards)
          if (isWild(cards[0]!)) {
            // Worth spending only to escape a pile worth more than the wilds.
            consider(move, 60 + view.pilePoints - pointsOf(cards, config))
          } else if (wouldSwoop(view, cards)) {
            consider(move, 1000 + cards.length)
          } else {
            const shed = pointsOf(cards, config)
            consider(move, 100 + shed * 4 + cards.length * 3 - orderValue(cards[0]!))
          }
          break
        }
        case 'flipFaceDown': {
          const risk = flipRisk(view)
          // Expected cost of a failed flip is the pile you would swallow.
          consider(move, risk === 0 ? 900 : 400 - risk * (view.pilePoints + view.pileCount * 2))
          break
        }
        case 'pickUp': {
          consider(move, 40 - view.pilePoints)
          break
        }
        case 'resolveFlip':
          break
      }
    }

    if (!best) throw new Error('no legal moves')
    return (best as { move: Move; score: number }).move
  },
}


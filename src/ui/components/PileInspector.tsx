import type { PlayerView } from '../../core/view.js'
import { handSortKey, pointValue, rankLabel } from '../../core/cards.js'
import type { GameConfig } from '../../core/config.js'
import { CardView } from './CardView.js'

interface Props {
  view: PlayerView
  config: GameConfig
  onClose: () => void
}

/** Counts of each rank sitting in the pile, in hand-display order. */
function tally(view: PlayerView) {
  const counts = new Map<string, number>()
  for (const card of view.pile) {
    const key = rankLabel(card.rank)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const order = new Map<string, number>()
  for (const card of view.pile) order.set(rankLabel(card.rank), handSortKey(card))
  return [...counts.entries()].sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
}

export function PileInspector({ view, config, onClose }: Props) {
  const top = view.pile[view.pile.length - 1]

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel inspector" onClick={(e) => e.stopPropagation()}>
        <h2>
          Discard pile — {view.pileCount} card{view.pileCount === 1 ? '' : 's'}, {view.pilePoints} pts
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Oldest first. Everything here was played face-up, so it is all fair game to remember.
        </p>

        <div className="inspector-cards">
          {view.pile.map((card) => (
            <div className="inspector-card" key={card.id}>
              <CardView card={card} playable={card.id === top?.id} />
              <span className="muted">{pointValue(card, config)}</span>
            </div>
          ))}
        </div>

        <div className="tally">
          {tally(view).map(([label, count]) => (
            <span key={label}>
              {label} × {count}
            </span>
          ))}
        </div>

        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

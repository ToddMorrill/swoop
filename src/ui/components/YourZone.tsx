import type { CardId } from '../../core/types.js'
import type { PlayerView } from '../../core/view.js'
import { cardLabel, rankLabel, sortForDisplay } from '../../core/cards.js'
import { CardView } from './CardView.js'
import { evaluateSelection, isPlayable } from '../selection.js'

interface Props {
  view: PlayerView
  selected: ReadonlySet<CardId>
  onToggle: (id: CardId) => void
  onPlay: (ids: CardId[]) => void
  onFlip: (index: number) => void
  onPickUp: () => void
}

export function YourZone({ view, selected, onToggle, onPlay, onFlip, onPickUp }: Props) {
  const seat = view.seats[view.you]
  if (!seat) return null
  const yourTurn = view.isYourTurn
  const state = evaluateSelection(view, selected)
  const hand = sortForDisplay(view.hand)
  const ids = state.cards.map((c) => c.id)
  const canFlip = yourTurn && !view.pendingFlip

  return (
    <div className="you">
      <div>
        <div className="zone-label">Your table — face-up cards sit on hidden ones</div>
        <div className="tableau">
          {seat.faceUp.map((card, i) => {
            const hidden = seat.faceDownPresent[i] ?? false
            const exposed = hidden && !card
            return (
              <div className="slot" key={i}>
                <CardView
                  card={null}
                  faceDown={hidden}
                  onClick={exposed && canFlip ? () => onFlip(i) : undefined}
                  title={exposed ? 'Flip this hidden card — you find out what it is only after committing' : undefined}
                />
                {card ? (
                  <CardView
                    card={card}
                    selected={selected.has(card.id)}
                    playable={yourTurn && isPlayable(view, card)}
                    dimmed={yourTurn && !isPlayable(view, card)}
                    onClick={yourTurn ? () => onToggle(card.id) : undefined}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <div className="zone-label">Your hand ({view.hand.length})</div>
        <div className="card-row">
          {view.hand.length === 0 ? <span className="muted">empty</span> : null}
          {hand.map((card) => (
            <CardView
              key={card.id}
              card={card}
              selected={selected.has(card.id)}
              playable={yourTurn && isPlayable(view, card)}
              dimmed={yourTurn && !isPlayable(view, card)}
              onClick={yourTurn ? () => onToggle(card.id) : undefined}
            />
          ))}
        </div>
      </div>

      <div className="actions">
        {view.pendingFlip ? (
          <>
            <div className="pending-flip">
              <CardView card={view.pendingFlip} playable />
              <span className="hint">
                You flipped {cardLabel(view.pendingFlip)} out of your hidden row.
                <br />
                Add any matching {rankLabel(view.pendingFlip.rank)}s, or play it on its own.
              </span>
            </div>
            <button className="primary" disabled={!state.valid} onClick={() => onPlay(ids)}>
              {ids.length > 0 ? `Play with ${ids.length} more` : 'Play it alone'}
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              disabled={!yourTurn || !state.valid}
              onClick={() => onPlay(ids)}
            >
              {ids.length > 1 ? `Play ${ids.length} cards` : 'Play'}
            </button>
            <button disabled={!yourTurn || view.pileCount === 0} onClick={onPickUp}>
              Pick up {view.pileCount > 0 ? `(${view.pileCount})` : ''}
            </button>
            {state.reason ? <span className="hint">{state.reason}</span> : null}
            {!yourTurn && view.status === 'active' ? (
              <span className="muted">Waiting for {view.seats[view.current]?.name}…</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

import type { PlayerView } from '../../core/view.js'
import type { TableEvent } from '../describe.js'
import { CardView } from './CardView.js'

interface Props {
  view: PlayerView
  event: TableEvent | null
  onInspect: () => void
}

/**
 * What just happened, drawn beside the pile. Several moves leave no trace on
 * the board — a clear burns its own cards, a pick-up empties the pile into a
 * hand — so without this they would only ever appear in the text log.
 */
function EventPanel({ event }: { event: TableEvent }) {
  const showsCards = event.cards.length > 0 || event.hidden > 0
  return (
    <div className={`event event-${event.tone}`}>
      {showsCards ? (
        <div className="run">
          {event.cards.map((c) => (
            <CardView key={c.id} card={c} />
          ))}
          {Array.from({ length: event.hidden }, (_, i) => (
            <CardView key={`hidden-${i}`} card={null} faceDown title="Only its owner saw this card" />
          ))}
        </div>
      ) : null}
      <div className="pile-label">
        <strong>{event.headline}</strong>
        {event.wentOut ? <span className="went-out">went out</span> : null}
        {event.detail ? (
          <>
            <br />
            {event.detail}
          </>
        ) : null}
      </div>
    </div>
  )
}

export function Pile({ view, event, onInspect }: Props) {
  const run = view.topRun.slice(-4)
  return (
    <div className="middle">
      {event ? <EventPanel event={event} /> : null}

      <button
        type="button"
        className="pile pile-button"
        onClick={onInspect}
        disabled={view.pileCount === 0}
        title="See every card in the discard pile"
      >
        <div className="run">
          {run.length === 0 ? <CardView card={null} /> : run.map((c) => <CardView key={c.id} card={c} />)}
        </div>
        <div className="pile-label">
          {view.pileCount === 0
            ? 'pile empty — play anything'
            : `${view.pileCount} card${view.pileCount === 1 ? '' : 's'} · ${view.pilePoints} pts`}
          {view.topRun.length > 1 ? ` · run of ${view.topRun.length}` : ''}
          {view.pileCount > 0 ? (
            <>
              <br />
              tap to inspect
            </>
          ) : null}
        </div>
      </button>

      <div className="pile">
        <CardView card={null} faceDown={view.burnedCount > 0} />
        <div className="pile-label">{view.burnedCount} burned</div>
      </div>
    </div>
  )
}

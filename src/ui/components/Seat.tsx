import type { SeatView } from '../../core/view.js'
import { CardView } from './CardView.js'

/** Beyond this a fan of backs stops being readable, so the count carries it. */
const MAX_BACKS = 14

export function Seat({ seat, active }: { seat: SeatView; active: boolean }) {
  const classes = ['seat']
  if (active) classes.push('active')
  if (seat.isOut) classes.push('out')
  const backs = Math.min(seat.handCount, MAX_BACKS)

  return (
    <div className={classes.join(' ')}>
      <header>
        <span className="name">{seat.name}</span>
        <span className="muted">
          {seat.handCount} in hand{seat.handCount > MAX_BACKS ? ' (+)' : ''}
        </span>
      </header>
      <div className="hand-backs">
        {backs === 0 ? (
          <span className="muted">hand empty</span>
        ) : (
          Array.from({ length: backs }, (_, i) => <CardView key={i} card={null} faceDown />)
        )}
      </div>
      <div className="stack">
        {seat.faceUp.map((card, i) => (
          <div className="slot" key={i}>
            <CardView card={null} faceDown={seat.faceDownPresent[i] ?? false} />
            {card ? <CardView card={card} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

import type { Card, GameState } from '../../core/types.js'
import type { GameConfig } from '../../core/config.js'
import { revealRound, type RevealedSeat } from '../../core/view.js'
import type { TableEvent } from '../describe.js'
import { CardView } from './CardView.js'

interface Props {
  game: GameState
  config: GameConfig
  /** The move that ended the round, so the winning play stays readable here. */
  finalPlay: TableEvent | null
  onNextRound: () => void
  onNewGame: () => void
}

/** The play that ended the round, repeated at the top of the tally. */
function FinalPlay({ event }: { event: TableEvent }) {
  return (
    <div className={`final-play event-${event.tone}`}>
      <div className="run">
        {event.cards.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
        {Array.from({ length: event.hidden }, (_, i) => (
          <CardView key={`hidden-${i}`} card={null} faceDown />
        ))}
      </div>
      <div>
        <strong>{event.headline}</strong>
        {event.detail ? <div className="muted">{event.detail}</div> : null}
      </div>
    </div>
  )
}

function Zone({ label, cards }: { label: string; cards: readonly Card[] }) {
  if (cards.length === 0) return null
  return (
    <div className="reveal-zone">
      <span className="zone-tag">{label}</span>
      <div className="card-row">
        {cards.map((c) => (
          <CardView key={c.id} card={c} />
        ))}
      </div>
    </div>
  )
}

function SeatReveal({ seat, total, isWinner }: { seat: RevealedSeat; total: number; isWinner: boolean }) {
  return (
    <div className={`reveal-seat${isWinner ? ' winner' : ''}`}>
      <header>
        <span className="name">
          {seat.name}
          {seat.wentOut ? <span className="went-out">went out</span> : null}
        </span>
        <span className="tally">
          +{seat.points} <strong>{total}</strong>
        </span>
      </header>
      {seat.wentOut ? (
        <span className="muted">No cards left.</span>
      ) : (
        <div className="reveal-zones">
          <Zone label="hand" cards={seat.hand} />
          <Zone label="face-up" cards={seat.faceUp} />
          <Zone label="hidden" cards={seat.faceDown} />
        </div>
      )}
    </div>
  )
}

/** Between-rounds tally with every hand turned face-up, or the final result. */
export function Scoreboard({ game, config, finalPlay, onNextRound, onNewGame }: Props) {
  if (game.round.status === 'active') return null
  const finished = game.status === 'complete'
  const seats = revealRound(game.round, config)

  return (
    <div className="overlay">
      <div className="panel reveal">
        <h2>
          {finished
            ? game.winners.length > 1
              ? 'Tied game'
              : `${game.names[game.winners[0] ?? 0]} wins`
            : `Round ${game.roundNumber} over`}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {game.round.wentOut === null
            ? 'Nobody went out — the round hit its turn limit.'
            : `${game.names[game.round.wentOut]} went out. Everyone else counts what they were holding.`}
        </p>

        {finalPlay ? <FinalPlay event={finalPlay} /> : null}

        <div className="reveal-list">
          {seats.map((seat) => (
            <SeatReveal
              key={seat.index}
              seat={seat}
              total={game.scores[seat.index] ?? 0}
              isWinner={finished && game.winners.includes(seat.index)}
            />
          ))}
        </div>

        {finished ? (
          <button className="primary" onClick={onNewGame}>New game</button>
        ) : (
          <button className="primary" onClick={onNextRound}>Next round</button>
        )}
      </div>
    </div>
  )
}

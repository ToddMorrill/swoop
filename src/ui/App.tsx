import { useState } from 'react'
import { botById } from '../bots/registry.js'
import { HUMAN_SEAT, TEMPOS, useGame, type GameSetup, type Speed } from './useGame.js'
import { Pile } from './components/Pile.js'
import { PileInspector } from './components/PileInspector.js'
import { Seat } from './components/Seat.js'
import { YourZone } from './components/YourZone.js'
import { Scoreboard } from './components/Scoreboard.js'
import { Setup, type SetupChoice } from './components/Setup.js'
import { Rules } from './components/Rules.js'

function buildSetup(choice: SetupChoice): GameSetup {
  const bot = botById(choice.botId)
  const names = ['You', ...Array.from({ length: choice.opponents }, (_, i) => `${bot.label} ${i + 1}`)]
  return {
    names,
    bots: names.map((_, i) => (i === HUMAN_SEAT ? null : bot)),
    config: choice.config,
    seed: Date.now() >>> 0,
  }
}

interface TableProps {
  setup: GameSetup
  speed: Speed
  paused: boolean
  onSpeed: (speed: Speed) => void
  onTogglePause: () => void
  onNewGame: () => void
}

function Table({ setup, speed, paused, onSpeed, onTogglePause, onNewGame }: TableProps) {
  const { game, view, selected, log, event, finalPlay, toggle, commit, undo, canUndo, nextRound, stepBot, botIsThinking } =
    useGame(setup, { speed, paused })
  const [inspecting, setInspecting] = useState(false)
  const [showRules, setShowRules] = useState(false)
  // The engine passes the turn the instant a move resolves, but the table is
  // still showing that move. Keep the player who made it lit until their move
  // has left the screen, so the highlight tracks what you are looking at.
  const activeSeat = event ? event.seat : view.current

  return (
    <div className="app">
      <div className="topbar">
        <h1>Swoop</h1>
        <div className="controls">
          <select
            value={speed}
            onChange={(e) => onSpeed(e.target.value as Speed)}
            aria-label="Bot speed"
            title="How long opponents pause before playing"
          >
            {(Object.keys(TEMPOS) as Speed[]).map((s) => (
              <option key={s} value={s}>
                {s[0]!.toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <button className={paused ? 'paused' : undefined} onClick={onTogglePause}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={stepBot} disabled={!paused || !botIsThinking} title="Play one opponent turn">
            Step
          </button>
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Take back your last move, and the replies that followed it"
          >
            Rewind
          </button>
          <button onClick={() => setShowRules(true)}>Rules</button>
          <button onClick={onNewGame}>New game</button>
        </div>
      </div>

      <div className="muted">
        Round {game.roundNumber} · to {setup.config.targetScore} pts ·{' '}
        {game.names.map((n, i) => `${n} ${game.scores[i] ?? 0}`).join('  ·  ')}
      </div>

      <div className="seats">
        {view.seats
          .filter((s) => s.index !== HUMAN_SEAT)
          .map((s) => (
            <Seat key={s.index} seat={s} active={s.index === activeSeat} />
          ))}
      </div>

      <Pile view={view} event={event} onInspect={() => setInspecting(true)} />

      <div className="log">
        {log.length === 0 ? <span>Play a card equal to or lower than the top card.</span> : null}
        {log.map((entry, i) => (
          <span key={`${entry}-${i}`} className={i === 0 ? 'latest' : undefined}>
            {entry}
          </span>
        ))}
      </div>

      <YourZone
        view={view}
        selected={selected}
        onToggle={toggle}
        onPlay={(ids) =>
          commit(view.pendingFlip ? { type: 'resolveFlip', addCards: ids } : { type: 'play', cards: ids })
        }
        onFlip={(index) => commit({ type: 'flipFaceDown', index })}
        onPickUp={() => commit({ type: 'pickUp' })}
      />

      {showRules ? (
        <div className="overlay" onClick={() => setShowRules(false)}>
          <div className="panel rules-panel" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <Rules config={setup.config} />
            <button className="primary" onClick={() => setShowRules(false)}>Back to the game</button>
          </div>
        </div>
      ) : null}

      {inspecting ? (
        <PileInspector view={view} config={setup.config} onClose={() => setInspecting(false)} />
      ) : null}

      {/* Hold the table until the last play has been seen, then show the tally. */}
      {event ? null : (
        <Scoreboard
          game={game}
          config={setup.config}
          finalPlay={finalPlay}
          onNextRound={nextRound}
          onNewGame={onNewGame}
        />
      )}
    </div>
  )
}

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null)
  // Pacing lives above the table so it survives starting a new game.
  const [speed, setSpeed] = useState<Speed>('slow')
  const [paused, setPaused] = useState(false)

  if (!setup) return <Setup onStart={(choice) => setSetup(buildSetup(choice))} />
  // Remounting Table on a new setup resets every piece of game state at once.
  return (
    <Table
      key={setup.seed}
      setup={setup}
      speed={speed}
      paused={paused}
      onSpeed={setSpeed}
      onTogglePause={() => setPaused((p) => !p)}
      onNewGame={() => setSetup(null)}
    />
  )
}

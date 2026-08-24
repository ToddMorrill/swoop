import { useState } from 'react'
import { BOTS } from '../../bots/registry.js'
import { DEFAULT_CONFIG, type GameConfig } from '../../core/config.js'
import { deckCount } from '../../core/cards.js'
import { Rules } from './Rules.js'

export interface SetupChoice {
  readonly opponents: number
  readonly botId: string
  readonly config: GameConfig
}

/**
 * The landing page. Someone arriving cold has never heard of Swoop, so the
 * rules come first and the options sit underneath them.
 */
export function Setup({ onStart }: { onStart: (choice: SetupChoice) => void }) {
  const [opponents, setOpponents] = useState(3)
  const [botId, setBotId] = useState('hard')
  const [targetScore, setTargetScore] = useState(DEFAULT_CONFIG.targetScore)
  const [tenPoints, setTenPoints] = useState(DEFAULT_CONFIG.tenPoints)
  const [useJokers, setUseJokers] = useState(false)

  const config: GameConfig = { ...DEFAULT_CONFIG, targetScore, tenPoints, jokerPoints: tenPoints, useJokers }
  const players = opponents + 1
  const decks = deckCount(players, config)

  return (
    <div className="landing">
      <header className="landing-head">
        <h1>Swoop</h1>
      </header>

      <Rules config={config} />

      <div className="landing-setup">
        <h2>Set up a game</h2>
        <div className="fields">
          <div className="field">
            <label htmlFor="opponents">Opponents</label>
            <select id="opponents" value={opponents} onChange={(e) => setOpponents(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="skill">Bot skill</label>
            <select id="skill" value={botId} onChange={(e) => setBotId(e.target.value)}>
              {BOTS.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="target">Game ends at</label>
            <select id="target" value={targetScore} onChange={(e) => setTargetScore(Number(e.target.value))}>
              {[100, 200, 500].map((n) => (
                <option key={n} value={n}>{n} points</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ten">A 10 is worth</label>
            <select id="ten" value={tenPoints} onChange={(e) => setTenPoints(Number(e.target.value))}>
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>{n} points</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="jokers">Jokers (extra wilds)</label>
            <input id="jokers" type="checkbox" checked={useJokers} onChange={(e) => setUseJokers(e.target.checked)} />
          </div>
        </div>

        <p className="muted">
          {players} players · {decks} deck{decks === 1 ? '' : 's'} · 19 cards each
        </p>

        <button className="primary big" onClick={() => onStart({ opponents, botId, config })}>
          Deal
        </button>
      </div>
    </div>
  )
}

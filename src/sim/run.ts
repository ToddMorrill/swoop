import { botById } from '../bots/registry.js'
import { withDefaults } from '../core/config.js'
import { simulate } from './simulate.js'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback
}

const games = Number(arg('games', '1000'))
const seed = Number(arg('seed', '42'))
const botIds = arg('bots', 'hard,easy,random,random').split(',')
const config = withDefaults({
  targetScore: Number(arg('target', '200')),
  useJokers: arg('jokers', 'false') === 'true',
})

const bots = botIds.map(botById)
const started = performance.now()
const result = simulate(bots, config, games, seed)
const elapsed = performance.now() - started

console.log(`\n${games} games, ${bots.length} players, seed ${seed} — ${elapsed.toFixed(0)}ms`)
console.log(
  `${result.rounds} rounds, ${result.moves} moves, ${result.stalemates} stalemates, longest round ${result.maxTurnsSeen} turns\n`,
)
console.log('seat  bot       win%    avg final score')
console.log('----  --------  ------  ---------------')
result.seats.forEach((s, i) => {
  const winPct = ((s.wins / games) * 100).toFixed(1).padStart(5)
  const avg = (s.totalScore / games).toFixed(1).padStart(9)
  console.log(`${String(i).padEnd(4)}  ${s.botId.padEnd(8)}  ${winPct}%  ${avg}`)
})
console.log('')

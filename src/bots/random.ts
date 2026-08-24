import type { Bot } from './index.js'
import { pickRandom } from './index.js'

/** Uniform over legal moves. The baseline every other tier must beat. */
export const randomBot: Bot = {
  id: 'random',
  label: 'Random',
  chooseMove(view, _config, rng) {
    if (view.legal.length === 0) throw new Error('no legal moves')
    return pickRandom(view.legal, rng)
  },
}

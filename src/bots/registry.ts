import type { Bot } from './index.js'
import { randomBot } from './random.js'
import { easyBot, hardBot } from './heuristic.js'

export const BOTS: readonly Bot[] = [randomBot, easyBot, hardBot]

export function botById(id: string): Bot {
  const bot = BOTS.find((b) => b.id === id)
  if (!bot) throw new Error(`unknown bot "${id}" (have: ${BOTS.map((b) => b.id).join(', ')})`)
  return bot
}

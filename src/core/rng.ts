/**
 * Seeded PRNG. All randomness in the engine flows through this so that any
 * game can be replayed exactly — needed for reproducing bugs and for
 * reinforcement-learning episodes. src/core never calls Math.random().
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
}

/** mulberry32 — small, fast, good enough for shuffling. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** Fisher-Yates, returning a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

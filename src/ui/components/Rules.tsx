import type { GameConfig } from '../../core/config.js'

/**
 * The shape of the game for someone who has never played it. Deliberately not
 * the full rule set — the edge cases live in CLAUDE.md. Reads live from the
 * config so the point values match whatever is actually selected.
 */
export function Rules({ config }: { config: GameConfig }) {
  return (
    <div className="rules">
      <section>
        <h3>The idea</h3>
        <p>
          Take as few points as you can. Cards left in your hand at the end of a round
          cost you; the player with the lowest total when someone crosses{' '}
          {config.targetScore} points wins.
        </p>
      </section>

      <section>
        <h3>Your turn</h3>
        <p>
          Play a card <strong>equal to or lower</strong> than the top card of the pile.
          Several at once is fine if they are all the same rank. If you cannot play — or
          would rather not — you pick up the whole pile.
        </p>
        <p className="muted">
          Aces are lowest, then 2–9, then J, Q, K. So a low card is hard for the next
          player to follow.
        </p>
      </section>

      <section>
        <h3>Three places to play from</h3>
        <p>
          Your <strong>hand</strong>, your four <strong>face-up</strong> cards, and the
          four <strong>hidden</strong> cards beneath them — in any order you like. A
          hidden card only becomes reachable once the face-up card covering it is gone.
        </p>
      </section>

      <section>
        <h3>Hidden cards are a gamble</h3>
        <p>
          You commit to a hidden card before seeing it. If it turns out too high, you
          swallow the pile. Cheapest when the pile is small — and free when the pile is
          empty or topped by a King, since nothing can beat it.
        </p>
      </section>

      <section>
        <h3>Two ways to clear the pile</h3>
        <p>
          <strong>A 10 is wild.</strong> Play it on anything, the pile is burned out of
          the game, and you go again. Worth {config.tenPoints} points if you are still
          holding it at the end, so it is both your escape hatch and your worst card.
        </p>
        <p>
          <strong>A swoop</strong> is four of a kind on top of the pile — combining what
          is already there with what you add. It burns the pile and you go again. Watch
          for a pair or three of a rank sitting on top.
        </p>
      </section>

      <section>
        <h3>Scoring</h3>
        <p>
          Ace 1 · 2–9 face value · J, Q, K 10 each · 10s {config.tenPoints}
          {config.useJokers ? ` · jokers ${config.jokerPoints}` : ''}. The first player
          with nothing left scores 0; everyone else counts what they still hold,
          hidden cards included.
        </p>
      </section>

      <section>
        <h3>Worth knowing</h3>
        <ul>
          <li>Shed face cards early — they are 10 points each and only playable while the pile is high.</li>
          <li>Playing low squeezes whoever is next, but spends your own safest card.</li>
          <li>Clear your hidden cards while the pile is cheap, not when you are forced to.</li>
        </ul>
      </section>
    </div>
  )
}

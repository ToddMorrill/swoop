The goal is to generate a web-based implementation of the card game Swoop. It might be cool to eventually have a iPhone app version as well, so if you think there are design decisions that can be made now that would help with a future mobile app, then let's consider those as well.

Swoop is a card game that is played with several players, where the goal is to take as few points as possible. Each round, each player is dealt 11 cards that they hold in their hand, and they are also dealt 4 face-down cards with 4 face-up cards on top of them. The rules are as follows:
- When the discard pile is empty (at the start of the round, after a swoop, after a 10 has cleared the pile, or after the previous player has picked up the pile), the player can play any rank of card.
- Players can play cards from their hand, from the face-up cards, or from the face-down cards. The only ordering constraint is that a face-down stays blocked until the face-up on top of it is played. Face-down cards are hidden from everyone.
- Once the discard pile has a card on it, a player can either choose to pick up the discard pile or play one or more cards (if multiple cards, they must be the same rank). A set of played cards can be from in hand + face-up cards.
- If a player chooses to play cards, the cards they play must have a valueless than or equal to the value of the top card on the discard pile. If they cannot play any cards, they must pick up the entire discard pile and add it to their hand.
    - The ranking of cards (for less than or equal to) is as follows:
        - Aces are the lowest value.
        - 2-9 are ranked by their face value.
        - 10s are wild cards and can be played on any card.
        - Jacks, Queens, and Kings are ranked as 11, 12, and 13 respectively.
- If they play a card from the face-down cards, then
    - If it has higher value than the top card on the discard pile
        - they must pick up the entire discard pile, including the face-down card
        - the face-down card doesn't need to be revealed to other players (only to you, the player who played it)
        - your turn ends immediately.
    - If it has equal or lower value, they must play the face-down card and reveal it. They can also combine it with cards from their hand or face-up cards to play a set of cards of the same rank. If it is a 10, they clear the discard pile and take another turn.
- You're only permitted one face-down flip per play. You can't flip multiple face-down cards in a single play. 
- 10s are wild cards that can be used to clear the discard pile. After clearing the discard pile, the player can take another turn and play any card from their hand, face-up cards, or face-down cards.
    - Multiple 10s can be played at once, which is equivalent to playing a single 10.
    - The 10 itself is cleared with the cleared discard pile, and the player can continue playing.
    - A 10 does not substitute for another rank in a swoop set.
    - 10s can be played on an empty discard pile.
- The game gets its name from the "swoop" action, which happens when a player creates a set of 4 or more cards of the same value. The set can combine a combination of cards on the top of the discard pile, cards from their hand, face-up cards, and face-down cards. Note that face-down cards are not needed to form sets (it can consist of a combination of in-hand and face-up cards). When a player swoops, they clear the discard pile and take another turn.
    - The same-rank cards already on the pile must be the contiguous top of pile.
    - Swooping is automatic once 4 or more cards meeting the above criteria are played.
    - You can swoop with four cards entirely from your own hand onto an unrelated top card (e.g. four 5s onto a King). Rank ordering rules still apply (you can't swoop with four Kings on 5s).
    - Combining your cards with those in the discard pile only ever works when your cards match the top card's rank exactly.
- A normal play ends your turn. Extra turns are only granted when a player swoops or plays a 10.
- Picking up the pile ends your turn.
- Cleared discard piles are set aside and not used for the rest of the round.
- The first round's first player is chosen randomly. In subsequent rounds, the first player is the one who won (went out) the previous round. Play proceeds clockwise.
- Going-out edge cases:
    - if your last cards trigger a swoop or play a 10, technically, you've earned another turn, but have nothing to play so the round ends and you score 0
    - if your last card is a face-down that flips too high, you pick up and don't go out.

The round ends when one player has no cards left in their hand, face-up cards, or face-down cards. At that point, the other players tally up the points from all cards remaining in their hands, face-up cards, and face-down cards. Scoring rules are as follows:
- Aces are worth 1 point each.
- Number cards (2-9) are worth their face value in points.
- Face cards (J, Q, K) are worth 10 points each.
- 10s are worth 25 points each, though this is configurable.
- The person who has no cards left in their hand, face-up cards, or face-down cards scores 0 points for that round.

The game ends when some player reaches or exceeds a predetermined point threshold, such as 200 or 500 points (configurable). The player with the lowest score at the end of the game is the winner. It is possible to tie for the lowest score.

Given that each player requires 19 cards, the game is played with as many decks of cards as necessary to accommodate the number of players. For example, if there are 3 players, a standard 52-card deck is insufficient, so two decks would be used. Concretely, you need ceil(players × 19 / 52) decks. The game requires a minimum of 2 players and can be scaled without bound. Extra cards are set aside and not used for the round. The cards are reshuffled and dealt again for each round.

Initially, the other players should be bots, but it would be good to be able to scale their degree of skill. This isn't currently "defined". It's defined in a reinforcement learning sense, where fewer points implies better play. We don't have to develop an RL engine now. You're free to define a list of heuristics (e.g., play high to low cards, favor playing face-down cards as early as possible, form sets from all playable cards, etc.) for starters, which can define the bot's skill level. One bot can also be defined by taking random legal actions.

Odds and ends:
- No pre-round swap between hand and face-up cards.
- No Jokers, though this is configurable, and they can play the same role as 10s if desired. If Jokers are used, then there are 2 per deck and the ceil rule becomes ceil(players × 19 / 54) decks. Jokers are worth the same as 10s from a point scoring perspective.
- Opponents' face-ups are visible. Hand counts are visible but their contents are hidden. The discard pile shows the contiguous same-rank run on top, not just the top card.
- The total value of the discard pile is visible to all players.
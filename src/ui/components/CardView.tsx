import type { Card } from '../../core/types.js'
import { SUIT_SYMBOL, rankLabel } from '../../core/cards.js'

interface Props {
  card: Card | null
  /** null card + faceDown renders a back; otherwise an empty slot. */
  faceDown?: boolean
  selected?: boolean
  playable?: boolean
  dimmed?: boolean
  onClick?: () => void
  title?: string
}

export function CardView({ card, faceDown, selected, playable, dimmed, onClick, title }: Props) {
  const classes = ['card']
  if (!card && faceDown) classes.push('back')
  if (!card && !faceDown) classes.push('empty')
  if (card && (card.suit === 'H' || card.suit === 'D')) classes.push('red')
  if (onClick) classes.push('selectable')
  if (selected) classes.push('selected')
  if (playable) classes.push('playable')
  if (dimmed) classes.push('dimmed')

  const content = card ? (
    <>
      <span className="rank">{rankLabel(card.rank)}</span>
      <span className="suit">{card.suit ? SUIT_SYMBOL[card.suit] : '★'}</span>
    </>
  ) : faceDown ? (
    <span className="rank">?</span>
  ) : null

  if (onClick) {
    return (
      <button type="button" className={classes.join(' ')} onClick={onClick} title={title}>
        {content}
      </button>
    )
  }
  return (
    <div className={classes.join(' ')} title={title}>
      {content}
    </div>
  )
}

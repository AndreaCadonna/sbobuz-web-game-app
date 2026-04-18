/**
 * Card — Sketchy hand-drawn playing card.
 *
 * Matches wireframe `.card`: 2px ink border, 7px radius, 2px soft shadow,
 * Caveat bold rank. Red suits (hearts/diamonds) use --accent. Face-down
 * cards use a diagonal-stripe pattern with an "S" watermark.
 *
 * Sizes: xs (28x40), sm (44x62), md (62x88), lg (74x104).
 * States: default, selected (raised, blue border), playable (green border),
 * disabled (0.4 opacity).
 */
'use client';

import { useCallback, useMemo, useState } from 'react';

import type { Suit } from '@sbobuz/shared';

import type { Card as CardType } from '@/types/client';

// ── Suit Rendering ───────────────────────────────────────────────

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

// ── Props ────────────────────────────────────────────────────────

interface CardProps {
  card: CardType;
  isFaceDown?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isDisabled?: boolean;
  isDraggable?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  onClick?: (cardId: string) => void;
  onDragStart?: (e: React.DragEvent, cardId: string) => void;
}

interface SizeConfig {
  /** Outer box class (w, h, padding, radius). */
  box: string;
  /** Top-corner rank font size. */
  rank: string;
  /** Small suit next to rank. */
  suit: string;
  /** Watermark on card backs. */
  back: string;
}

const SIZE_XS: SizeConfig = {
  box: 'w-7 h-10 rounded px-0.5 py-0.5',
  rank: 'text-[10px]',
  suit: 'text-[8px]',
  back: 'text-sm',
};
const SIZE_SM: SizeConfig = {
  box: 'w-11 h-[3.875rem] rounded-[6px] px-1 py-0.5',
  rank: 'text-[15px]',
  suit: 'text-[11px]',
  back: 'text-[22px]',
};
const SIZE_MD: SizeConfig = {
  box: 'w-[3.875rem] h-[5.5rem] rounded-[7px] px-1.5 py-1',
  rank: 'text-xl',
  suit: 'text-sm',
  back: 'text-[32px]',
};
const SIZE_LG: SizeConfig = {
  box: 'w-[4.625rem] h-[6.5rem] rounded-[7px] px-1.5 py-1',
  rank: 'text-2xl',
  suit: 'text-base',
  back: 'text-[40px]',
};

function getSizeConfig(size: 'xs' | 'sm' | 'md' | 'lg'): SizeConfig {
  switch (size) {
    case 'xs':
      return SIZE_XS;
    case 'sm':
      return SIZE_SM;
    case 'md':
      return SIZE_MD;
    case 'lg':
      return SIZE_LG;
  }
}

// ── Shared styles ────────────────────────────────────────────────

// Pattern for face-down cards: diagonal stripe + S watermark
const BACK_STRIPE_BG =
  'bg-[repeating-linear-gradient(45deg,var(--paper)_0_4px,var(--paper-2)_4px_8px)]';

function getBorderAndShadow(
  isSelected: boolean,
  isPlayable: boolean,
): string {
  if (isSelected) {
    return 'border-accent-3 shadow-sketch-blue -translate-y-2 motion-reduce:translate-y-0';
  }
  if (isPlayable) {
    return 'border-accent-2 shadow-sketch-green';
  }
  return 'border-ink shadow-[2px_2px_0_rgba(0,0,0,0.15)]';
}

// ── Component ────────────────────────────────────────────────────

export function Card({
  card,
  isFaceDown = false,
  isSelected = false,
  isPlayable = false,
  isDisabled = false,
  isDraggable = false,
  size = 'md',
  onClick,
  onDragStart,
}: CardProps): React.JSX.Element {
  const sizeClass = getSizeConfig(size);
  const [isDragging, setIsDragging] = useState(false);
  const cardId = card.id;

  const handleClick = useCallback(() => {
    if (!isDisabled && !isFaceDown && onClick) {
      onClick(cardId);
    }
  }, [cardId, isDisabled, isFaceDown, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !isDisabled && !isFaceDown && onClick) {
        e.preventDefault();
        onClick(cardId);
      }
    },
    [cardId, isDisabled, isFaceDown, onClick],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setIsDragging(true);
      onDragStart?.(e, cardId);
    },
    [cardId, onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const canDrag = isDraggable && !isDisabled && !isFaceDown;

  const cardLabel = useMemo(() => {
    if (isFaceDown) return 'Face-down card';
    if (card.type === 'joker') return 'Joker';
    const suitName = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
    return `${card.rank} of ${suitName}`;
  }, [card, isFaceDown]);

  // Face-down card
  if (isFaceDown) {
    return (
      <div
        className={`
          ${sizeClass.box}
          relative inline-flex items-center justify-center
          border-2 border-ink
          ${BACK_STRIPE_BG}
          shadow-[2px_2px_0_rgba(0,0,0,0.15)] select-none
          ${isDisabled ? 'opacity-40' : ''}
        `}
        aria-label={cardLabel}
        role="img"
      >
        <span
          className={`font-display font-bold text-ink/25 ${sizeClass.back} -rotate-[15deg]`}
          aria-hidden="true"
        >
          S
        </span>
      </div>
    );
  }

  const borderAndShadow = getBorderAndShadow(isSelected, isPlayable && !isDisabled);
  const draggingClass = isDragging ? 'opacity-50' : '';
  const disabledClass = isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer';

  // Joker card — no suit symbol, "JKR" or star rank
  if (card.type === 'joker') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        draggable={canDrag}
        onDragStart={canDrag ? handleDragStart : undefined}
        onDragEnd={canDrag ? handleDragEnd : undefined}
        disabled={isDisabled}
        aria-label={cardLabel}
        aria-pressed={isSelected}
        className={`
          ${sizeClass.box}
          relative inline-flex flex-col
          border-2 bg-paper-2
          font-display font-bold
          transition-transform duration-150 motion-reduce:transition-none
          ${borderAndShadow}
          ${draggingClass}
          ${disabledClass}
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3 focus-visible:ring-offset-2
        `}
      >
        <span className={`${sizeClass.rank} leading-none`}>{'\u2605'}</span>
        <span className={`flex flex-1 items-center justify-center ${sizeClass.back} text-ink`} aria-hidden="true">
          {'\u2605'}
        </span>
        <span className={`${sizeClass.rank} self-end rotate-180 leading-none`}>{'\u2605'}</span>
      </button>
    );
  }

  // Standard card
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const colorClass = isRedSuit(card.suit) ? 'text-accent' : 'text-ink';

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      draggable={canDrag}
      onDragStart={canDrag ? handleDragStart : undefined}
      onDragEnd={canDrag ? handleDragEnd : undefined}
      disabled={isDisabled}
      aria-label={cardLabel}
      aria-pressed={isSelected}
      className={`
        ${sizeClass.box}
        relative inline-flex flex-col
        border-2 bg-paper
        font-display font-bold
        ${colorClass}
        transition-transform duration-150 motion-reduce:transition-none
        ${borderAndShadow}
        ${draggingClass}
        ${disabledClass}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-3 focus-visible:ring-offset-2
      `}
    >
      {/* Top-left rank + suit */}
      <div className="flex items-start gap-0.5 leading-none">
        <span className={sizeClass.rank}>{card.rank}</span>
        <span className={sizeClass.suit} aria-hidden="true">
          {suitSymbol}
        </span>
      </div>
      {/* Center suit (hidden on xs) */}
      {size !== 'xs' && (
        <div className="flex flex-1 items-center justify-center leading-none" aria-hidden="true">
          <span className={sizeClass.rank}>{suitSymbol}</span>
        </div>
      )}
      {/* Bottom-right inverted rank (hidden on xs) */}
      {size !== 'xs' && (
        <div className="mt-auto flex items-end justify-end self-end rotate-180 leading-none">
          <span className={sizeClass.suit}>{card.rank}</span>
        </div>
      )}
    </button>
  );
}

// ── Card Back (for opponent hands / draw pile) ───────────────────

interface CardBackProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function CardBack({ size = 'md' }: CardBackProps): React.JSX.Element {
  const sizeClass = getSizeConfig(size);

  return (
    <div
      className={`
        ${sizeClass.box}
        relative inline-flex items-center justify-center
        border-2 border-ink
        ${BACK_STRIPE_BG}
        shadow-[2px_2px_0_rgba(0,0,0,0.15)] select-none
      `}
      aria-label="Face-down card"
      role="img"
    >
      <span
        className={`font-display font-bold text-ink/25 ${sizeClass.back} -rotate-[15deg]`}
        aria-hidden="true"
      >
        S
      </span>
    </div>
  );
}

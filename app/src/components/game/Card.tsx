/**
 * Card — Renders a single playing card with visual states.
 *
 * Displays suit symbols, rank values, and handles states:
 * default, hover, selected, playable, unplayable, face-down.
 * Respects prefers-reduced-motion for animations.
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

const SUIT_COLORS: Record<Suit, string> = {
  hearts: 'text-red-600 dark:text-red-400',
  diamonds: 'text-red-600 dark:text-red-400',
  clubs: 'text-brand-950 dark:text-cream-200',
  spades: 'text-brand-950 dark:text-cream-200',
};

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
  card: string;
  rank: string;
  suit: string;
  center: string;
}

const SIZE_XS: SizeConfig = { card: 'w-10 h-[3.75rem] rounded-md text-[10px]', rank: 'text-[8px]', suit: 'text-[10px]', center: 'text-base' };
const SIZE_SM: SizeConfig = { card: 'w-12 h-[4.5rem] rounded-lg text-xs', rank: 'text-[10px]', suit: 'text-xs', center: 'text-lg' };
const SIZE_MD: SizeConfig = { card: 'w-16 h-24 rounded-xl text-sm', rank: 'text-xs', suit: 'text-sm', center: 'text-2xl' };
const SIZE_LG: SizeConfig = { card: 'w-20 h-[7.5rem] rounded-xl text-base', rank: 'text-sm', suit: 'text-base', center: 'text-3xl' };

function getSizeConfig(size: 'xs' | 'sm' | 'md' | 'lg'): SizeConfig {
  switch (size) {
    case 'xs': return SIZE_XS;
    case 'sm': return SIZE_SM;
    case 'md': return SIZE_MD;
    case 'lg': return SIZE_LG;
  }
}

export function Card({
  card,
  isFaceDown = false,
  isSelected = false,
  isPlayable = true,
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
          ${sizeClass.card}
          relative inline-flex flex-col items-center justify-center
          border-2 border-brand-700/60 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950
          shadow-card select-none
        `}
        aria-label={cardLabel}
        role="img"
      >
        <div className="absolute inset-1 rounded-md border border-gold-400/20" />
        <span className="text-gold-400/40 font-bold" aria-hidden="true">?</span>
      </div>
    );
  }

  // Joker card
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
          ${sizeClass.card}
          relative inline-flex flex-col items-center justify-center
          border-2 bg-cream-50 dark:bg-[#2a2035]
          transition-all duration-200 motion-reduce:transition-none
          opacity-100 disabled:opacity-100
          ${isDragging ? 'opacity-50' : ''}
          ${isSelected
            ? 'border-brand-500 -translate-y-2 shadow-card-selected motion-reduce:translate-y-0'
            : 'border-cream-300 dark:border-cream-700 shadow-card'}
          ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-card-hover motion-reduce:hover:translate-y-0'}
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2
        `}
      >
        <span className="text-lg font-bold bg-gradient-to-r from-red-500 via-gold-500 to-purple-500 bg-clip-text text-transparent">
          JKR
        </span>
      </button>
    );
  }

  // Standard card
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];

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
        ${sizeClass.card}
        relative inline-flex flex-col
        border-2 bg-cream-50 dark:bg-[#1e2a38]
        transition-all duration-200 motion-reduce:transition-none
        opacity-100 disabled:opacity-100
        ${isDragging ? 'opacity-50' : ''}
        ${isSelected
          ? 'border-brand-500 -translate-y-2 shadow-card-selected motion-reduce:translate-y-0'
          : 'border-cream-300 dark:border-cream-700 shadow-card'}
        ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer hover:-translate-y-1 hover:shadow-card-hover motion-reduce:hover:translate-y-0'}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2
      `}
    >
      {/* Top-left rank and suit */}
      <div className={`absolute top-0.5 left-1 flex flex-col items-center leading-none ${suitColor}`}>
        <span className={`${sizeClass.rank} font-bold`}>{card.rank}</span>
        <span className={sizeClass.suit} aria-hidden="true">{suitSymbol}</span>
      </div>

      {/* Center suit */}
      <div className={`flex flex-1 items-center justify-center ${suitColor}`}>
        <span className={sizeClass.center} aria-hidden="true">{suitSymbol}</span>
      </div>

      {/* Bottom-right rank and suit (inverted) */}
      <div className={`absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180 ${suitColor}`}>
        <span className={`${sizeClass.rank} font-bold`}>{card.rank}</span>
        <span className={sizeClass.suit} aria-hidden="true">{suitSymbol}</span>
      </div>
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
        ${sizeClass.card}
        relative inline-flex items-center justify-center
        border-2 border-brand-700/60 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950
        shadow-card select-none
      `}
      aria-label="Face-down card"
      role="img"
    >
      <div className="absolute inset-1 rounded-md border border-gold-400/20" />
    </div>
  );
}

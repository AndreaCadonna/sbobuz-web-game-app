/**
 * Card — Renders a single playing card with visual states.
 *
 * Displays suit symbols, rank values, and handles states:
 * default, hover, selected, playable, unplayable, face-down.
 * Respects prefers-reduced-motion for animations.
 */
'use client';

import { useCallback, useMemo } from 'react';

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
  clubs: 'text-gray-900 dark:text-gray-100',
  spades: 'text-gray-900 dark:text-gray-100',
};

// ── Props ────────────────────────────────────────────────────────

interface CardProps {
  card: CardType;
  isFaceDown?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isDisabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: (cardId: string) => void;
}

interface SizeConfig {
  card: string;
  rank: string;
  suit: string;
  center: string;
}

const SIZE_SM: SizeConfig = { card: 'w-12 h-[4.5rem] rounded-md text-xs', rank: 'text-xs', suit: 'text-sm', center: 'text-lg' };
const SIZE_MD: SizeConfig = { card: 'w-16 h-24 rounded-lg text-sm', rank: 'text-sm', suit: 'text-base', center: 'text-2xl' };
const SIZE_LG: SizeConfig = { card: 'w-20 h-[7.5rem] rounded-lg text-base', rank: 'text-base', suit: 'text-lg', center: 'text-3xl' };

function getSizeConfig(size: 'sm' | 'md' | 'lg'): SizeConfig {
  switch (size) {
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
  size = 'md',
  onClick,
}: CardProps): React.JSX.Element {
  const sizeClass = getSizeConfig(size);

  const handleClick = useCallback(() => {
    if (!isDisabled && !isFaceDown && onClick) {
      onClick(card.type === 'joker' ? card.id : card.id);
    }
  }, [card, isDisabled, isFaceDown, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !isDisabled && !isFaceDown && onClick) {
        e.preventDefault();
        onClick(card.type === 'joker' ? card.id : card.id);
      }
    },
    [card, isDisabled, isFaceDown, onClick],
  );

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
          border-2 border-gray-400 bg-gradient-to-br from-brand-700 to-brand-900
          shadow-md
          select-none
        `}
        aria-label={cardLabel}
        role="img"
      >
        <div className="absolute inset-1 rounded-sm border border-brand-500/30" />
        <span className="text-brand-300/50 font-bold" aria-hidden="true">?</span>
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
        disabled={isDisabled}
        aria-label={cardLabel}
        aria-pressed={isSelected}
        className={`
          ${sizeClass.card}
          relative inline-flex flex-col items-center justify-center
          border-2 bg-white dark:bg-gray-800
          shadow-md
          transition-all duration-150 motion-reduce:transition-none
          ${isSelected
            ? 'border-brand-500 -translate-y-2 ring-2 ring-brand-400 motion-reduce:translate-y-0'
            : 'border-gray-300 dark:border-gray-600'}
          ${!isPlayable && !isDisabled ? 'opacity-50' : ''}
          ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:-translate-y-1 motion-reduce:hover:translate-y-0'}
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
        `}
      >
        <span className="text-lg font-bold bg-gradient-to-r from-red-500 to-purple-500 bg-clip-text text-transparent">
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
      disabled={isDisabled}
      aria-label={cardLabel}
      aria-pressed={isSelected}
      className={`
        ${sizeClass.card}
        relative inline-flex flex-col
        border-2 bg-white dark:bg-gray-800
        shadow-md
        transition-all duration-150 motion-reduce:transition-none
        ${isSelected
          ? 'border-brand-500 -translate-y-2 ring-2 ring-brand-400 motion-reduce:translate-y-0'
          : 'border-gray-300 dark:border-gray-600'}
        ${!isPlayable && !isDisabled ? 'opacity-50' : ''}
        ${isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:-translate-y-1 motion-reduce:hover:translate-y-0'}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
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
  size?: 'sm' | 'md' | 'lg';
}

export function CardBack({ size = 'md' }: CardBackProps): React.JSX.Element {
  const sizeClass = getSizeConfig(size);

  return (
    <div
      className={`
        ${sizeClass.card}
        relative inline-flex items-center justify-center
        border-2 border-gray-400 bg-gradient-to-br from-brand-700 to-brand-900
        shadow-md select-none
      `}
      aria-label="Face-down card"
      role="img"
    >
      <div className="absolute inset-1 rounded-sm border border-brand-500/30" />
    </div>
  );
}

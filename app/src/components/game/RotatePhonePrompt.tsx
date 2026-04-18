/**
 * RotatePhonePrompt — Full-screen overlay shown on mobile portrait
 * while the game board is active. Mirrors the design wireframe's
 * `.rotate-hint`: dashed ink border, paper-2 bg, Caveat copy, small
 * tilted phone icon.
 */
'use client';

export function RotatePhonePrompt(): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-paper px-6"
      role="alertdialog"
      aria-label="Rotate your phone"
    >
      <div className="sk sk-wobble flex max-w-sm flex-col items-center gap-4 bg-paper-2 p-6 text-center">
        <span
          className="inline-block h-6 w-10 rounded border-2 border-ink bg-paper"
          style={{ transform: 'rotate(-20deg)' }}
          aria-hidden="true"
        />
        <h2 className="font-display text-3xl font-bold leading-tight">Rotate to landscape</h2>
        <p className="font-body text-[15px] text-ink-soft">
          The card table works best with your phone sideways {'\u2014'} turn the device to keep all four seats in view.
        </p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-line-soft">
          auto-locks when in game
        </p>
      </div>
    </div>
  );
}

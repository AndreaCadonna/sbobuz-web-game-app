import Link from 'next/link';

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="sk p-6">
      <h2 className="mb-3 font-display text-3xl font-bold">{title}</h2>
      <div className="font-body text-[15px] text-ink-soft">{children}</div>
    </section>
  );
}

function SpecialCardRow({
  name,
  symbol,
  color,
  description,
}: {
  name: string;
  symbol: string;
  color: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-4">
      <div className={`flex h-[5.5rem] w-[3.875rem] flex-shrink-0 items-center justify-center rounded-[7px] border-2 border-ink bg-paper font-display text-2xl font-bold shadow-[2px_2px_0_rgba(0,0,0,0.15)] ${color}`}>
        {symbol}
      </div>
      <div>
        <p className="font-body font-semibold text-ink">{name}</p>
        <p className="font-body text-sm text-ink-soft">{description}</p>
      </div>
    </div>
  );
}

export default function HowToPlayPage(): React.JSX.Element {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">How to play</h1>
          <p className="mt-1 font-body text-lg text-ink-soft">Learn the rules of Sbobuz in a few minutes</p>
        </div>

        <div className="space-y-5">
          <SectionCard title="Overview">
            <p>
              Sbobuz is a turn-based card game for <strong className="text-ink">2&ndash;5 players</strong>{' '}
              using a standard 54-card deck (52 cards + 2 jokers). The goal is simple:{' '}
              <strong className="text-ink">be the first player to get rid of all your cards</strong>. Play
              cards from your hand, then your face-up cards, then your face-down cards. Empty all three zones
              and you win!
            </p>
          </SectionCard>

          <SectionCard title="Setup">
            <p>
              Each player receives <strong className="text-ink">9 cards</strong> dealt in three zones:
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="sk sk-alt text-center">
                <p className="font-display text-3xl">3</p>
                <p className="mt-1 font-body text-sm font-semibold text-ink">Face-Down</p>
                <p className="text-xs text-ink-soft">Hidden from everyone</p>
              </div>
              <div className="sk sk-alt text-center">
                <p className="font-display text-3xl">3</p>
                <p className="mt-1 font-body text-sm font-semibold text-ink">Face-Up</p>
                <p className="text-xs text-ink-soft">Visible to all</p>
              </div>
              <div className="sk sk-alt text-center">
                <p className="font-display text-3xl">3</p>
                <p className="mt-1 font-body text-sm font-semibold text-ink">In Hand</p>
                <p className="text-xs text-ink-soft">Only you can see</p>
              </div>
            </div>
            <p className="mt-4 text-sm">
              Remaining cards form the <strong className="text-ink">draw pile</strong> in the center. The
              player with the lowest hand cards goes first.
            </p>
          </SectionCard>

          <SectionCard title="On your turn">
            <p className="mb-3">
              Each turn you must do <strong className="text-ink">one</strong> of the following:
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-ink bg-accent font-display text-base font-bold text-white">1</span>
                <p>
                  <strong className="text-ink">Play card(s)</strong> of the same rank that are equal to or
                  higher than the top card on the pile.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-ink bg-accent font-display text-base font-bold text-white">2</span>
                <p>
                  <strong className="text-ink">Pick up the pile</strong> into your hand. You can always pick
                  up, even if you have a legal play.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm">
              After playing, if your hand has fewer than 3 cards and the draw pile is not empty, you draw
              back up to 3.
            </p>
          </SectionCard>

          <SectionCard title="Card zones">
            <p className="mb-3">You play through your cards in strict order:</p>
            <div className="flex flex-wrap items-center justify-center gap-2 font-body text-sm">
              <span className="pill">Hand</span>
              <span className="text-accent">{'\u2192'}</span>
              <span className="pill yellow">Face-Up</span>
              <span className="text-accent">{'\u2192'}</span>
              <span className="pill accent">Face-Down</span>
              <span className="text-accent">{'\u2192'}</span>
              <span className="pill green">Win!</span>
            </div>
            <p className="mt-4 text-sm">
              <strong className="text-ink">Face-down cards</strong> are played blind &mdash; pick a position
              without seeing the card. If it&rsquo;s not a legal play, the card goes on the pile and you
              pick up everything. You&rsquo;re back to playing from your hand!
            </p>
          </SectionCard>

          <SectionCard title="Special cards">
            <p className="mb-4">Four card types have special abilities that break the normal rules:</p>
            <div className="space-y-5">
              <SpecialCardRow
                name="2 — Wild Reset"
                symbol="2"
                color="text-accent-3"
                description="Can be played on any card. The next player can play anything (free play)."
              />
              <SpecialCardRow
                name="Queen — Direction Override"
                symbol="Q"
                color="text-accent-3"
                description="After playing, declare whether the next card must be higher or lower. Normal comparison rules apply to the Queen itself."
              />
              <SpecialCardRow
                name="King — Pile Clear"
                symbol="K"
                color="text-accent-y"
                description="Clears (burns) the entire pile. You must play another card immediately. Kings can chain!"
              />
              <SpecialCardRow
                name="Joker — Wild + Reverse"
                symbol={'\u2605'}
                color="text-accent"
                description="Can be played on any card (free play for the next player). Also reverses the turn order."
              />
            </div>
            <p className="mt-5 text-sm">
              Rank order from lowest to highest:{' '}
              <span className="font-mono text-xs">3 4 5 6 7 8 9 10 J Q K A</span>. The 2 is special &mdash;
              it&rsquo;s the lowest rank but can always be played.
            </p>
          </SectionCard>

          <SectionCard title="Sbobuz!">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="flex h-10 w-7 items-center justify-center rounded border-2 border-ink bg-paper font-display text-lg font-bold"
                  >
                    7
                  </span>
                ))}
              </div>
              <span className="font-display text-2xl font-bold text-accent">= Sbobuz!</span>
            </div>
            <p>
              When the <strong className="text-ink">top 4 cards</strong> on the pile share the same rank
              &mdash; that&rsquo;s a Sbobuz! The entire pile is burned, the turn direction reverses, and
              the player who completed it gets to play again.
            </p>
            <p className="mt-3 text-sm">
              Sbobuz <strong className="text-ink">overrides all other card effects</strong>. Four Queens?
              Sbobuz, not a Queen effect. It can build across multiple turns &mdash; one player plays a 7,
              then another plays a 7, and so on. Jokers cannot contribute to a Sbobuz (they have no rank).
            </p>
          </SectionCard>

          <SectionCard title="Winning">
            <p>
              The first player to <strong className="text-ink">empty all three card zones</strong> (hand,
              face-up, and face-down) wins the game. Plan carefully &mdash; getting stuck picking up a big
              pile when you&rsquo;re down to your last face-down cards can cost you the game!
            </p>
          </SectionCard>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-display text-lg text-ink underline underline-offset-2 hover:text-accent"
          >
            {'\u2190 '}back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

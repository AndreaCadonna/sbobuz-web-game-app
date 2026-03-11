import Link from 'next/link';

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-card-bg)] p-6 sm:p-8">
      <h2 className="font-display mb-4 text-2xl font-bold text-brand-800 dark:text-brand-300">
        {title}
      </h2>
      {children}
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
      <div className={`flex h-12 w-9 flex-shrink-0 items-center justify-center rounded-lg border-2 border-[var(--color-border)] bg-white text-lg font-bold ${color} dark:bg-gray-900`}>
        {symbol}
      </div>
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-sm text-[var(--color-muted)]">{description}</p>
      </div>
    </div>
  );
}

export default function HowToPlayPage(): React.JSX.Element {
  return (
    <main className="min-h-screen px-4 py-12 sm:px-6">
      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-brand-50/40 via-transparent to-gold-50/30 dark:from-brand-950/30 dark:via-transparent dark:to-gold-950/20" aria-hidden="true" />

      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-4 flex items-center justify-center gap-3 text-2xl text-[var(--color-muted)]/40" aria-hidden="true">
            <span className="text-red-400/50">{'\u2665'}</span>
            <span className="text-[var(--color-muted)]/30">{'\u2660'}</span>
            <span className="text-red-400/50">{'\u2666'}</span>
            <span className="text-[var(--color-muted)]/30">{'\u2663'}</span>
          </div>
          <h1 className="font-display mb-3 text-4xl font-bold tracking-tight sm:text-5xl text-brand-800 dark:text-brand-300">
            How to Play
          </h1>
          <p className="text-lg text-[var(--color-muted)]">
            Learn the rules of Sbobuz in a few minutes
          </p>
        </div>

        <div className="space-y-6">
          {/* Overview */}
          <SectionCard title="Overview">
            <p className="text-[var(--color-muted)] leading-relaxed">
              Sbobuz is a turn-based card game for <strong>2 to 5 players</strong> using a standard
              54-card deck (52 cards + 2 jokers). The goal is simple: <strong>be the first player to
              get rid of all your cards</strong>. Play cards from your hand, then your face-up cards,
              then your face-down cards. Empty all three zones and you win!
            </p>
          </SectionCard>

          {/* Setup */}
          <SectionCard title="Setup">
            <p className="mb-4 text-[var(--color-muted)] leading-relaxed">
              Each player receives <strong>9 cards</strong> dealt in three zones:
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center">
                <p className="text-2xl mb-1">&#x1F0CF;</p>
                <p className="font-semibold text-sm">3 Face-Down</p>
                <p className="text-xs text-[var(--color-muted)]">Hidden from everyone</p>
              </div>
              <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center">
                <p className="text-2xl mb-1">&#x1F0A1;</p>
                <p className="font-semibold text-sm">3 Face-Up</p>
                <p className="text-xs text-[var(--color-muted)]">Visible to all</p>
              </div>
              <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-background)] p-4 text-center">
                <p className="text-2xl mb-1">&#x1F0B1;</p>
                <p className="font-semibold text-sm">3 in Hand</p>
                <p className="text-xs text-[var(--color-muted)]">Only you can see</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              Remaining cards form the <strong>draw pile</strong> in the center. The player with the
              lowest hand cards goes first.
            </p>
          </SectionCard>

          {/* Gameplay */}
          <SectionCard title="On Your Turn">
            <p className="mb-4 text-[var(--color-muted)] leading-relaxed">
              Each turn you must do <strong>one</strong> of the following:
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">1</span>
                <p className="text-[var(--color-muted)]">
                  <strong>Play card(s)</strong> of the same rank that are equal to or higher than the
                  top card on the pile.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">2</span>
                <p className="text-[var(--color-muted)]">
                  <strong>Pick up the pile</strong> into your hand. You can always pick up, even if
                  you have a legal play.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              After playing, if your hand has fewer than 3 cards and the draw pile is not empty,
              you draw back up to 3.
            </p>
          </SectionCard>

          {/* Card Zones */}
          <SectionCard title="Card Zones">
            <p className="mb-4 text-[var(--color-muted)] leading-relaxed">
              You play through your cards in strict order:
            </p>
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <span className="rounded-lg bg-brand-100 px-3 py-1.5 text-brand-700 dark:bg-brand-900 dark:text-brand-300">Hand</span>
              <span className="text-[var(--color-muted)]">&rarr;</span>
              <span className="rounded-lg bg-gold-100 px-3 py-1.5 text-gold-800 dark:bg-gold-900 dark:text-gold-200">Face-Up</span>
              <span className="text-[var(--color-muted)]">&rarr;</span>
              <span className="rounded-lg bg-red-100 px-3 py-1.5 text-red-700 dark:bg-red-900 dark:text-red-300">Face-Down</span>
              <span className="text-[var(--color-muted)]">&rarr;</span>
              <span className="rounded-lg bg-green-100 px-3 py-1.5 text-green-700 dark:bg-green-900 dark:text-green-300">Win!</span>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted)]">
              <strong>Face-down cards</strong> are played blind &mdash; pick a position without
              seeing the card. If it&apos;s not a legal play, the card goes on the pile and you pick
              up everything. You&apos;re back to playing from your hand!
            </p>
          </SectionCard>

          {/* Special Cards */}
          <SectionCard title="Special Cards">
            <p className="mb-5 text-[var(--color-muted)] leading-relaxed">
              Four card types have special abilities that break the normal rules:
            </p>
            <div className="space-y-5">
              <SpecialCardRow
                name="2 &mdash; Wild Reset"
                symbol="2"
                color="text-blue-600"
                description="Can be played on any card. The next player can play anything (free play)."
              />
              <SpecialCardRow
                name="Queen &mdash; Direction Override"
                symbol="Q"
                color="text-purple-600"
                description="After playing, declare whether the next card must be higher or lower. Normal comparison rules apply to the Queen itself."
              />
              <SpecialCardRow
                name="King &mdash; Pile Clear"
                symbol="K"
                color="text-gold-600"
                description="Clears (burns) the entire pile. You must play another card immediately. Kings can chain!"
              />
              <SpecialCardRow
                name="Joker &mdash; Wild + Reverse"
                symbol="&#x2605;"
                color="text-red-500"
                description="Can be played on any card (free play for the next player). Also reverses the turn order."
              />
            </div>
            <p className="mt-5 text-sm text-[var(--color-muted)]">
              Rank order from lowest to highest:{' '}
              <span className="font-mono text-xs">3 4 5 6 7 8 9 10 J Q K A</span>.
              The 2 is special &mdash; it&apos;s the lowest rank but can always be played.
            </p>
          </SectionCard>

          {/* Sbobuz */}
          <SectionCard title="Sbobuz!">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex gap-1" aria-hidden="true">
                <span className="flex h-10 w-7 items-center justify-center rounded border-2 border-gold-400 bg-gold-50 text-sm font-bold text-gold-700 dark:bg-gold-950 dark:text-gold-300">7</span>
                <span className="flex h-10 w-7 items-center justify-center rounded border-2 border-gold-400 bg-gold-50 text-sm font-bold text-gold-700 dark:bg-gold-950 dark:text-gold-300">7</span>
                <span className="flex h-10 w-7 items-center justify-center rounded border-2 border-gold-400 bg-gold-50 text-sm font-bold text-gold-700 dark:bg-gold-950 dark:text-gold-300">7</span>
                <span className="flex h-10 w-7 items-center justify-center rounded border-2 border-gold-400 bg-gold-50 text-sm font-bold text-gold-700 dark:bg-gold-950 dark:text-gold-300">7</span>
              </div>
              <span className="font-display text-xl font-bold text-gold-600">=  Sbobuz!</span>
            </div>
            <p className="text-[var(--color-muted)] leading-relaxed">
              When the <strong>top 4 cards</strong> on the pile share the same rank &mdash; that&apos;s a
              Sbobuz! The entire pile is burned, the turn direction reverses, and the player who
              completed it gets to play again.
            </p>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Sbobuz <strong>overrides all other card effects</strong>. Four Queens? Sbobuz, not a
              Queen effect. It can build across multiple turns &mdash; one player plays a 7, then
              another plays a 7, and so on. Jokers cannot contribute to a Sbobuz (they have no rank).
            </p>
          </SectionCard>

          {/* Winning */}
          <SectionCard title="Winning">
            <p className="text-[var(--color-muted)] leading-relaxed">
              The first player to <strong>empty all three card zones</strong> (hand, face-up, and
              face-down) wins the game. Plan carefully &mdash; getting stuck picking up a big pile
              when you&apos;re down to your last face-down cards can cost you the game!
            </p>
          </SectionCard>
        </div>

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted)] hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

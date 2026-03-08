# Frontend Client — React/Next.js Game Renderer & Player Interface

> **Document Type:** Architecture Spec
> **Status:** Draft
> **Last Updated:** March 2026
> **Parent Specs:** [architecture-overview.md](../../architecture-overview.md), [SBOBUZ_ENGINE_SPEC.md](../../SBOBUZ_ENGINE_SPEC.md)

---

## 1. Overview

The frontend client is a Next.js + React single-page application that serves as the visual and interactive layer of the Sbobuz card game platform. It renders game state received from the server, captures player actions, and sends them to the server for authoritative processing. The client never computes game state -- it is a renderer only.

The application uses server-side rendering (SSR) for public-facing pages (landing, auth) to optimize initial load time and SEO, and operates as a client-side SPA for authenticated gameplay flows where real-time interactivity matters more than crawlability. All real-time communication uses Socket.IO over WebSocket, with JWT-based authentication on the socket handshake.

The client connects to the server's modular monolith (see architecture-overview.md Section 3) through two channels: REST API calls for stateless operations (authentication, room CRUD, profile data) and WebSocket events for real-time state synchronization (game state updates, presence, room events). Shared TypeScript types from the `/shared` directory ensure type safety across the client-server boundary.

---

## 2. Data Model

All types defined in this section are client-side representations. Types that originate from the server (such as `Card`, `GamePhase`, `GameAction`) are imported from `shared/types/` and re-exported or extended as needed. The client never defines its own copy of server-authoritative types.

### 2.1 Shared Types (Imported from `/shared`)

These types are defined once in `/shared/types/` and consumed by both client and server. They are documented in SBOBUZ_ENGINE_SPEC.md and listed here for reference only -- the client imports them, it does not own them.

```typescript
// Re-exported from shared/types/card.ts
type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

interface StandardCard {
  type: 'standard';
  rank: Rank;
  suit: Suit;
  id: string;
}

interface JokerCard {
  type: 'joker';
  id: 'joker_1' | 'joker_2';
}

type Card = StandardCard | JokerCard;

// Re-exported from shared/types/game.ts
type GamePhase =
  | 'setup'
  | 'playing'
  | 'awaiting_queen_declaration'
  | 'awaiting_post_clear_play'
  | 'finished'
  | 'cancelled';

type ActiveZone = 'hand' | 'faceUp' | 'faceDown' | 'finished';

// Re-exported from shared/types/actions.ts
type GameAction =
  | PlayCardsAction
  | PlayBlindAction
  | PickUpPileAction
  | DeclareDirectionAction
  | TimeoutForfeitAction
  | CancelGameAction;

interface PlayCardsAction {
  type: 'PLAY_CARDS';
  playerId: string;
  cardIds: string[];
}

interface PlayBlindAction {
  type: 'PLAY_BLIND';
  playerId: string;
  cardIndex: number;
}

interface PickUpPileAction {
  type: 'PICK_UP_PILE';
  playerId: string;
}

interface DeclareDirectionAction {
  type: 'DECLARE_DIRECTION';
  playerId: string;
  direction: 'higher' | 'lower';
}

interface TimeoutForfeitAction {
  type: 'TIMEOUT_FORFEIT';
  playerId: string;
}

interface CancelGameAction {
  type: 'CANCEL_GAME';
  reason: 'disconnect_timeout' | 'admin';
  disconnectedPlayerId?: string;
}

interface GameConfig {
  turnTimerSeconds: number;
  disconnectGraceSeconds: number;
  maxPlayers: 5;
  minPlayers: 2;
}
```

### 2.2 Client-Owned Types

These types exist only on the client. They represent filtered views of server state and UI-specific concerns.

```typescript
// ── Client Game State ──────────────────────────────────────────────
// The visibility-filtered view of GameState that the server sends
// to each individual player. The server strips private information
// (other players' hands, face-down card values, draw pile order)
// before sending.

interface ClientGameState {
  gameId: string;
  phase: GamePhase;
  config: GameConfig;

  // Pile state (visible to all)
  playPileTopCards: Card[];       // top N cards of pile for animation (server decides N)
  playPileSize: number;           // total pile depth
  drawPileSize: number;           // cards remaining in draw pile
  burnPileSize: number;           // cards removed from play

  // Player views
  me: ClientSelfView;             // the authenticated player's full view
  opponents: ClientOpponentView[]; // other players' public-only info

  // Turn state
  currentPlayerId: string;        // whose turn it is
  turnDirection: 1 | -1;          // current turn order direction
  turnOrder: string[];            // ordered player IDs in seating order

  // Flags (visible to all -- needed for UX hints)
  freePlay: boolean;
  nextCardOverride: 'lower' | null;

  // Timing
  turnStartedAt: string;          // ISO 8601 timestamp of current turn start
  turnTimerSeconds: number;       // seconds allowed for this turn

  // Result (populated when phase is 'finished' or 'cancelled')
  result: GameResult | null;
}

interface ClientSelfView {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  hand: Card[];                   // full card data -- only your own hand is visible
  faceUpCards: Card[];            // full card data -- visible to all
  faceDownCount: number;          // count only -- you cannot see your own face-down cards
  activeZone: ActiveZone;         // computed by server, sent for convenience
}

interface ClientOpponentView {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  handCount: number;              // number of cards in hand (values hidden)
  faceUpCards: Card[];            // full card data -- visible to all
  faceDownCount: number;          // number of face-down cards remaining
  activeZone: ActiveZone;
  isConnected: boolean;           // presence status
}

interface GameResult {
  winnerId: string | null;        // null if cancelled
  reason: 'completed' | 'cancelled_disconnect' | 'cancelled_admin';
  finalStandings: PlayerStanding[];
  gameDurationSeconds: number;
  totalTurns: number;
}

interface PlayerStanding {
  playerId: string;
  displayName: string;
  position: number;               // 1 = winner, 2+ = order of remaining cards
  remainingCards: number;          // total cards left when game ended
}

// ── Game Action Event ──────────────────────────────────────────────
// Describes what just happened, for the game log and animations.
// Sent by server alongside every state update.

interface GameActionEvent {
  actionIndex: number;            // monotonic, for ordering
  type: GameActionEventType;
  actorId: string;                // player who performed the action
  actorDisplayName: string;
  timestamp: string;              // ISO 8601
  details: GameActionEventDetails;
}

type GameActionEventType =
  | 'cards_played'
  | 'blind_card_revealed'
  | 'blind_card_failed'
  | 'pile_picked_up'
  | 'direction_declared'
  | 'pile_cleared_king'
  | 'sbobuz_triggered'
  | 'cards_drawn'
  | 'turn_timeout'
  | 'player_won'
  | 'game_cancelled'
  | 'direction_reversed';

interface GameActionEventDetails {
  cards?: Card[];                 // cards involved in the action
  cardCount?: number;             // for draws or pickups (count only)
  direction?: 'higher' | 'lower'; // for direction declarations
  previousDirection?: 1 | -1;    // before reversal
  newDirection?: 1 | -1;         // after reversal
  blindCardIndex?: number;        // position of blind play
  revealedCard?: Card;           // card revealed during blind play
  wasLegal?: boolean;            // whether blind play was legal
}

// ── UI State ───────────────────────────────────────────────────────
// Client-only state that drives the visual layer. Not synchronized
// with the server. Reset on page navigation.

type ScreenName =
  | 'landing'
  | 'login'
  | 'register'
  | 'lobby'
  | 'room'
  | 'game'
  | 'profile'
  | 'leaderboard';

interface UIState {
  currentScreen: ScreenName;
  activeModal: ModalType | null;
  notifications: Notification[];
  isLoading: boolean;             // global loading overlay
  loadingMessage: string | null;  // optional message during loading
}

type ModalType =
  | { type: 'confirm_leave_game' }
  | { type: 'game_over'; result: GameResult }
  | { type: 'player_kicked'; reason: string }
  | { type: 'room_expired' }
  | { type: 'server_unavailable' }
  | { type: 'invite_link'; roomId: string; inviteCode: string }
  | { type: 'settings' };

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  durationMs: number;             // 0 = persistent until dismissed
  createdAt: number;              // Date.now() timestamp
}

// ── Game UI State ──────────────────────────────────────────────────
// UI state specific to the game board. Tracks user interaction
// state and animation queue.

interface GameUIState {
  selectedCardIds: string[];      // cards the player has selected to play
  animationQueue: AnimationItem[];
  lastActionEvent: GameActionEvent | null;
  isSubmittingAction: boolean;    // true while waiting for server to confirm
  showQueenDeclaration: boolean;  // true when awaiting player's direction choice
  showPostClearPlay: boolean;     // true when player must play again after King/Sbobuz
  turnTimerRemainingMs: number;   // client-side countdown (visual only, server enforces)
  highlightedLegalCardIds: string[]; // cards that can legally be played (UX hint)
  showReconnectingOverlay: boolean;
}

interface AnimationItem {
  id: string;                     // unique ID for React keys
  type: AnimationType;
  cards: Card[];                  // cards involved
  fromZone: AnimationZone;
  toZone: AnimationZone;
  actorId: string;
  durationMs: number;
  onComplete?: () => void;        // callback when animation finishes
}

type AnimationType =
  | 'play_to_pile'                // card moves from hand/face-up to pile
  | 'pile_to_hand'                // pile pickup
  | 'draw_to_hand'                // draw from draw pile
  | 'pile_burn'                   // pile clears (King/Sbobuz)
  | 'blind_reveal'                // face-down card flips face-up
  | 'blind_fail_to_hand'          // failed blind card + pile goes to hand
  | 'deal';                       // initial deal animation

type AnimationZone =
  | 'hand'
  | 'face_up'
  | 'face_down'
  | 'play_pile'
  | 'draw_pile'
  | 'burn_pile'
  | 'opponent_hand'
  | 'off_screen';

// ── Auth State ─────────────────────────────────────────────────────

interface AuthState {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;       // derived: user !== null && accessToken !== null
  isRefreshing: boolean;          // true during silent token refresh
  loginError: string | null;
  registerError: string | null;
}

interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;              // ISO 8601
}

// ── Lobby State ────────────────────────────────────────────────────

interface LobbyState {
  rooms: RoomSummary[];
  currentRoom: RoomDetail | null;
  roomFilters: RoomFilters;
  isCreatingRoom: boolean;
  isJoiningRoom: boolean;
  createRoomError: string | null;
  joinRoomError: string | null;
}

interface RoomSummary {
  roomId: string;
  name: string;
  hostDisplayName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  turnTimerSeconds: number;
  isPrivate: boolean;
  createdAt: string;
}

type RoomStatus = 'waiting' | 'ready' | 'in_game' | 'completed' | 'expired';

interface RoomDetail {
  roomId: string;
  name: string;
  hostId: string;
  hostDisplayName: string;
  players: RoomPlayer[];
  maxPlayers: number;
  status: RoomStatus;
  config: RoomConfig;
  inviteCode: string | null;      // null if public room
  createdAt: string;
}

interface RoomPlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: string;
}

interface RoomConfig {
  turnTimerSeconds: number;
  maxPlayers: number;
  isPrivate: boolean;
}

interface RoomFilters {
  showFull: boolean;              // show rooms at max capacity
  showPrivate: boolean;           // show private rooms (won't be joinable without code)
  showInGame: boolean;            // show rooms where a game is in progress
  searchQuery: string;            // room name search
}

// ── Connection State ───────────────────────────────────────────────

type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

interface ConnectionState {
  status: ConnectionStatus;
  lastConnectedAt: string | null;   // ISO 8601
  reconnectAttempt: number;         // current retry count
  maxReconnectAttempts: number;     // from config
  latencyMs: number | null;         // last measured round-trip time
}
```

### 2.3 Derived State (Computed Client-Side, Never Stored)

These values are computed from the client state on every render cycle. They are never stored in the state store, never sent to the server, and never persisted. Each derivation is a pure function.

```typescript
// Is it the current player's turn?
function isMyTurn(game: ClientGameState, myPlayerId: string): boolean {
  return game.currentPlayerId === myPlayerId
    && (game.phase === 'playing'
        || game.phase === 'awaiting_queen_declaration'
        || game.phase === 'awaiting_post_clear_play');
}

// Can the player play a specific card given the current pile state?
// Used for UX hints only (graying out illegal cards). Server is authority.
function canPlayCard(
  card: Card,
  pileTopCard: Card | null,
  freePlay: boolean,
  nextCardOverride: 'lower' | null
): boolean {
  // Empty pile -- anything goes
  if (pileTopCard === null) return true;
  // Free play active -- anything goes
  if (freePlay) return true;
  // Wild cards -- always legal
  if (card.type === 'joker') return true;
  if (card.type === 'standard' && card.rank === '2') return true;
  // Standard comparison
  if (card.type === 'standard' && pileTopCard.type === 'standard') {
    const rankOrder = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const cardIndex = rankOrder.indexOf(card.rank);
    const pileIndex = rankOrder.indexOf(pileTopCard.rank);
    if (nextCardOverride === 'lower') return cardIndex <= pileIndex;
    return cardIndex >= pileIndex;
  }
  // Pile top is joker -- only applies if freePlay was consumed; fallback to any
  return true;
}

// Can the player select multiple cards of the same rank?
function canSelectAdditionalCard(
  card: Card,
  selectedCards: Card[]
): boolean {
  if (selectedCards.length === 0) return true;
  const firstSelected = selectedCards[0];
  if (firstSelected.type === 'joker' || card.type === 'joker') return false;
  if (firstSelected.type === 'standard' && card.type === 'standard') {
    return firstSelected.rank === card.rank;
  }
  return false;
}

// Time remaining on the turn timer
function getTurnTimerRemainingMs(
  turnStartedAt: string,
  turnTimerSeconds: number,
  nowMs: number
): number {
  const elapsed = nowMs - new Date(turnStartedAt).getTime();
  const remaining = (turnTimerSeconds * 1000) - elapsed;
  return Math.max(0, remaining);
}

// Player's active zone label for display
function getActiveZoneLabel(zone: ActiveZone): string {
  switch (zone) {
    case 'hand': return 'Playing from hand';
    case 'faceUp': return 'Playing face-up cards';
    case 'faceDown': return 'Playing blind';
    case 'finished': return 'Finished';
  }
}

// Game phase as human-readable status text
function getPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case 'setup': return 'Setting up...';
    case 'playing': return 'In progress';
    case 'awaiting_queen_declaration': return 'Declaring direction...';
    case 'awaiting_post_clear_play': return 'Must play again';
    case 'finished': return 'Game over';
    case 'cancelled': return 'Game cancelled';
  }
}
```

---

## 3. Page Structure & Routes

```
/                          Landing page (SSR, public)
/auth/login                Login form (SSR, public)
/auth/register             Registration form (SSR, public)
/lobby                     Room browser + create room (authenticated)
/room/:roomId              Room waiting screen (authenticated, WebSocket)
/game/:gameId              Game board (authenticated, SPA, WebSocket)
/profile                   Player profile, stats, match history (authenticated)
/leaderboard               Global rankings (SSR, public, cached)
```

### Route Behavior Table

| Route | Render Mode | Auth Required | WebSocket | Notes |
|---|---|---|---|---|
| `/` | SSR | No | No | Marketing landing page. Links to login/register. |
| `/auth/login` | SSR | No | No | Redirect to `/lobby` if already authenticated. |
| `/auth/register` | SSR | No | No | Redirect to `/lobby` if already authenticated. |
| `/lobby` | CSR (SPA) | Yes | Yes | Room list updates in real-time via WebSocket. REST for CRUD. |
| `/room/:roomId` | CSR (SPA) | Yes | Yes | Joins room's WebSocket channel. Shows player list, ready state. |
| `/game/:gameId` | CSR (SPA) | Yes | Yes | Full game board. No page reloads during gameplay. |
| `/profile` | CSR (SPA) | Yes | No | REST API for stats and match history. |
| `/leaderboard` | SSR + CSR | No | No | SSR for initial load, client-side pagination. Cached. |

### Navigation Guards

```
Unauthenticated user → /lobby, /room/*, /game/*, /profile
    → Redirect to /auth/login with ?redirect= query param

Authenticated user → /auth/login, /auth/register
    → Redirect to /lobby

User in active game → browser back button, URL change away from /game/*
    → Show "confirm leave game" modal. Leaving does NOT forfeit -- the
      server's disconnect grace period applies.

User navigates to /room/:roomId for a room they are not in
    → Attempt to join. If room is full or in-game, show error and redirect to /lobby.

User navigates to /game/:gameId for a game they are not in
    → Show "Game not found" or "Not a participant" error. Redirect to /lobby.
```

---

## 4. Component Architecture

### 4.1 Component Hierarchy

```
App
 +-- Layout
 |    +-- Header (logo, user menu, connection status indicator)
 |    +-- Main (page content -- routed)
 |    +-- NotificationToastContainer
 |
 +-- Pages
 |    +-- LandingPage (SSR)
 |    +-- LoginPage (SSR)
 |    +-- RegisterPage (SSR)
 |    +-- LobbyPage
 |    |    +-- RoomList
 |    |    |    +-- RoomCard (repeating)
 |    |    +-- RoomFiltersBar
 |    |    +-- CreateRoomDialog
 |    +-- RoomPage
 |    |    +-- RoomLobby
 |    |    |    +-- PlayerSlot (repeating, max 5)
 |    |    |    +-- RoomSettingsPanel (host only)
 |    |    |    +-- ReadyButton
 |    |    |    +-- StartGameButton (host only, visible when all ready)
 |    |    |    +-- InviteLinkButton (private rooms)
 |    |    +-- ChatPanel (Phase 2 -- renders empty placeholder)
 |    +-- GamePage
 |    |    +-- GameBoard
 |    |    |    +-- DrawPileZone
 |    |    |    +-- PlayPileZone
 |    |    |    |    +-- CardComponent (top card + stacking visual)
 |    |    |    +-- OpponentZone (repeating, 1-4 opponents)
 |    |    |    |    +-- OpponentCardCountBadge
 |    |    |    |    +-- OpponentFaceUpCards
 |    |    |    |    |    +-- CardComponent (repeating)
 |    |    |    |    +-- OpponentAvatar
 |    |    |    |    +-- ConnectionStatusDot
 |    |    |    +-- PlayerZone (current player's area)
 |    |    |    |    +-- PlayerHand
 |    |    |    |    |    +-- CardComponent (repeating, selectable)
 |    |    |    |    +-- PlayerFaceUpCards
 |    |    |    |    |    +-- CardComponent (repeating, selectable when active)
 |    |    |    |    +-- PlayerFaceDownCards
 |    |    |    |    |    +-- FaceDownCardSlot (repeating, clickable when active)
 |    |    |    +-- ActionBar
 |    |    |    |    +-- PlayButton
 |    |    |    |    +-- PickUpPileButton
 |    |    |    |    +-- QueenDeclarationButtons (higher / lower)
 |    |    |    +-- TurnIndicator
 |    |    |    |    +-- TurnTimerBar
 |    |    |    |    +-- CurrentPlayerLabel
 |    |    +-- GameLog
 |    |    |    +-- GameLogEntry (repeating)
 |    |    +-- GameOverOverlay
 |    |    +-- ReconnectingOverlay
 |    +-- ProfilePage
 |    |    +-- PlayerStats
 |    |    +-- MatchHistory
 |    |    |    +-- MatchHistoryRow (repeating)
 |    +-- LeaderboardPage
 |         +-- LeaderboardTable
 |         +-- LeaderboardPagination
 |
 +-- Shared Components
      +-- CardComponent
      +-- Button
      +-- Modal
      +-- LoadingSpinner
      +-- ErrorBoundary
      +-- ConnectionStatusIndicator
```

### 4.2 Key Component Specifications

#### CardComponent

The atomic visual unit. Renders a single playing card.

```typescript
interface CardComponentProps {
  card: Card | null;              // null = face-down card back
  isFaceDown: boolean;            // true = show card back regardless of card data
  isSelected: boolean;            // visual highlight for selected cards
  isDisabled: boolean;            // grayed out for illegal plays (UX hint)
  isPlayable: boolean;            // subtle glow/border for playable cards
  size: 'sm' | 'md' | 'lg';      // responsive sizing
  onClick?: () => void;           // selection handler
  animationState?: 'idle' | 'entering' | 'exiting' | 'flipping';
}
```

**Visual states:**
- Default: card face with rank and suit.
- Face-down: card back pattern. No rank/suit visible.
- Selected: raised position (translateY -8px), blue border glow.
- Disabled: 50% opacity, no pointer cursor.
- Playable: subtle green border pulse when it is the player's turn.
- Flipping: 3D Y-axis rotation from back to front (blind reveal).

**Accessibility:**
- `role="button"` when clickable.
- `aria-label` describing card (e.g., "7 of hearts", "Joker", "Face-down card").
- `aria-selected` for selected state.
- `aria-disabled` for unplayable state.
- Keyboard: `Enter` or `Space` to select. `Tab` to navigate between cards.

#### PlayerHand

Displays the current player's hand cards in a fan layout.

```typescript
interface PlayerHandProps {
  cards: Card[];
  selectedCardIds: string[];
  highlightedLegalCardIds: string[];
  activeZone: ActiveZone;          // only interactive when zone is 'hand'
  isMyTurn: boolean;
  onCardSelect: (cardId: string) => void;
  onCardDeselect: (cardId: string) => void;
}
```

**Behavior:**
- Cards are arranged in a horizontal fan, overlapping slightly.
- When `activeZone !== 'hand'`, all hand cards are displayed but non-interactive (dimmed).
- When it is the player's turn, legal cards have a playable highlight.
- Clicking a card toggles selection. Only cards of the same rank can be co-selected (enforced by `canSelectAdditionalCard`).
- Clicking a card of a different rank deselects all previously selected cards and selects the new card.
- Card order: sorted by rank ascending, then by suit (hearts, diamonds, clubs, spades).

#### PlayPileZone

The center pile where cards are played.

```typescript
interface PlayPileZoneProps {
  topCards: Card[];                // top N cards for stacked visual
  pileSize: number;
  lastAction: GameActionEvent | null;
  isBurning: boolean;             // true during pile clear animation
}
```

**Visual design:**
- Shows the top card face-up, with 1-3 cards behind it offset diagonally for depth.
- Pile size number displayed as a badge.
- When pile burns (King clear or Sbobuz), cards animate off-screen with a dissolve/scatter effect.
- Empty pile: shows an outlined card placeholder.

#### OpponentZone

Displays a single opponent's visible game state.

```typescript
interface OpponentZoneProps {
  opponent: ClientOpponentView;
  isCurrentTurn: boolean;
  position: 'top' | 'top-left' | 'top-right' | 'left' | 'right'; // layout position
}
```

**Layout:**
- Opponent zones are arranged around the top and sides of the game board, positioned based on player count and seating order.
- Shows: avatar, display name, hand count badge, face-up cards (miniature), face-down count dots, connection status dot (green/red).
- Active turn indicator: glowing border when it is this opponent's turn.
- Disconnected: avatar is dimmed, red dot, "(reconnecting...)" label.

#### ActionBar

The player's action controls, shown at the bottom of the game board.

```typescript
interface ActionBarProps {
  isMyTurn: boolean;
  phase: GamePhase;
  activeZone: ActiveZone;
  selectedCardIds: string[];
  playPileSize: number;           // for enabling/disabling pickup
  isSubmitting: boolean;
  onPlayCards: () => void;
  onPickUpPile: () => void;
  onDeclareDirection: (direction: 'higher' | 'lower') => void;
}
```

**Button states by game phase:**

| Phase | Buttons Shown | Enabled When |
|---|---|---|
| `playing` (my turn, hand/faceUp) | Play, Pick Up | Play: cards selected. Pick Up: pile non-empty. |
| `playing` (my turn, faceDown) | Face-down card slots only | Slots in PlayerFaceDownCards are clickable |
| `playing` (not my turn) | None active | All disabled |
| `awaiting_queen_declaration` (my declaration) | Higher, Lower | Always enabled |
| `awaiting_post_clear_play` (my turn) | Play | Cards selected |
| `finished` / `cancelled` | None | Game over |

**Double-submit prevention:** When `isSubmitting` is true, all buttons are disabled and show a loading spinner. Cleared when server responds (either confirmation or rejection).

#### TurnIndicator

Shows whose turn it is with a visual countdown.

```typescript
interface TurnIndicatorProps {
  currentPlayerName: string;
  isMyTurn: boolean;
  turnTimerRemainingMs: number;
  turnTimerTotalMs: number;
  phase: GamePhase;
}
```

**Visual design:**
- Text: "Your turn" (bold, highlighted) or "{PlayerName}'s turn".
- Timer bar: horizontal progress bar, full width = total time. Shrinks as time passes.
  - Green (>50% remaining), yellow (25-50%), red (<25%).
  - Pulses when <10 seconds remain.
- When phase is `awaiting_queen_declaration`: "Declaring direction...".
- When phase is `awaiting_post_clear_play`: "Must play again!".
- Timer is purely visual. Server enforces the actual timeout and sends a `TIMEOUT_FORFEIT` action.

#### GameLog

Sidebar showing a scrolling log of recent game events.

```typescript
interface GameLogProps {
  events: GameActionEvent[];       // most recent first
  currentPlayerId: string;         // to highlight "you" vs player names
  maxVisible: number;              // default: 20
}
```

**Entry format examples:**
- "**You** played 7 of hearts, 7 of diamonds"
- "**Alice** picked up the pile (12 cards)"
- "**Bob** played a blind card -- 5 of spades (illegal!) -- picked up pile"
- "**SBOBUZ!** Alice completed four 9s -- pile burned, direction reversed!"
- "**You** declared: next card must be lower"
- "**Charlie** timed out"

#### RoomLobby

Pre-game waiting room.

```typescript
interface RoomLobbyProps {
  room: RoomDetail;
  currentPlayerId: string;
  onReady: () => void;
  onUnready: () => void;
  onStartGame: () => void;        // host only
  onLeaveRoom: () => void;
  onUpdateConfig: (config: Partial<RoomConfig>) => void; // host only
  onCopyInviteLink: () => void;
}
```

**Behavior:**
- Shows player slots (up to maxPlayers). Empty slots show "Waiting for player..." placeholder.
- Each player slot shows avatar, name, ready status (green checkmark / gray dot).
- Host has a settings panel to adjust turn timer before the game starts.
- "Start Game" button enabled only when: all players are ready, at least minPlayers present, host is clicking.
- Invite link button copies a URL to clipboard: `{origin}/room/:roomId?invite=:inviteCode`.

#### GameOverOverlay

Full-screen overlay shown when the game ends.

```typescript
interface GameOverOverlayProps {
  result: GameResult;
  currentPlayerId: string;
  onReturnToLobby: () => void;
  onPlayAgain: () => void;        // creates a new room with same players
}
```

**Content:**
- Winner banner: "You won!" or "{PlayerName} wins!".
- Final standings table (position, name, remaining cards).
- Game stats: duration, total turns.
- "Return to Lobby" and "Play Again" buttons.

---

## 5. State Management

### 5.1 Architecture Decision: Zustand

**Choice:** Zustand for client-side state management.

**Rationale:**
- Minimal boilerplate compared to Redux. A solo developer benefits from less ceremony.
- First-class TypeScript support with type inference on stores.
- No provider wrapper needed -- stores are consumed via hooks directly.
- Built-in middleware for devtools, persistence, and subscriptions.
- Supports computed/derived state via selectors without re-render overhead.
- Small bundle size (~1KB gzipped) compared to Redux Toolkit (~11KB) or MobX (~16KB).
- React Context + useReducer was considered but rejected: it causes unnecessary re-renders in large component trees unless memoization is carefully applied everywhere. Zustand uses external stores with shallow comparison, avoiding this class of problems.

### 5.2 Store Structure

Four independent stores, each managing a distinct concern. Stores do not import each other -- they communicate through the component layer or via the WebSocket event handler.

```typescript
// ── Auth Store ─────────────────────────────────────────────────────

interface AuthStore extends AuthState {
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearErrors: () => void;
}

// ── Lobby Store ────────────────────────────────────────────────────

interface LobbyStore extends LobbyState {
  // Actions
  fetchRooms: () => Promise<void>;
  createRoom: (name: string, config: RoomConfig) => Promise<string>; // returns roomId
  joinRoom: (roomId: string, inviteCode?: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  startGame: () => Promise<void>;
  updateRoomConfig: (config: Partial<RoomConfig>) => Promise<void>;
  setFilters: (filters: Partial<RoomFilters>) => void;

  // WebSocket handlers (called by socket event listeners)
  handleRoomUpdate: (room: RoomDetail) => void;
  handleRoomListUpdate: (rooms: RoomSummary[]) => void;
  handlePlayerJoined: (player: RoomPlayer) => void;
  handlePlayerLeft: (playerId: string) => void;
  handlePlayerReadyChanged: (playerId: string, isReady: boolean) => void;
}

// ── Game Store ─────────────────────────────────────────────────────

interface GameStore {
  // Server-synchronized state
  gameState: ClientGameState | null;
  actionLog: GameActionEvent[];

  // Client UI state
  uiState: GameUIState;

  // Actions -- these send events to the server
  playCards: (cardIds: string[]) => void;
  playBlind: (cardIndex: number) => void;
  pickUpPile: () => void;
  declareDirection: (direction: 'higher' | 'lower') => void;

  // UI actions -- local only
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  dismissAnimation: (animationId: string) => void;

  // WebSocket handlers
  handleStateUpdate: (state: ClientGameState, event: GameActionEvent) => void;
  handleFullSync: (state: ClientGameState, log: GameActionEvent[]) => void;
  handleActionRejected: (error: ActionRejectedError) => void;
  handleGameOver: (result: GameResult) => void;

  // Cleanup
  reset: () => void;
}

interface ActionRejectedError {
  actionType: string;
  reason: string;
  serverState: ClientGameState;   // authoritative state to revert to
}

// ── Connection Store ───────────────────────────────────────────────

interface ConnectionStore extends ConnectionState {
  // Actions
  connect: (token: string) => void;
  disconnect: () => void;

  // Internal handlers
  handleConnected: () => void;
  handleDisconnected: (reason: string) => void;
  handleReconnecting: (attempt: number) => void;
  handleReconnected: () => void;
  handleLatencyUpdate: (ms: number) => void;
}
```

### 5.3 State Update Flow

The client follows a strict unidirectional data flow with server as the sole authority:

```
User Interaction (click card, press play)
    |
    v
Store Action (e.g., gameStore.playCards(['hearts_7']))
    |
    v
Send WebSocket Event (game:action { type: 'PLAY_CARDS', cardIds: ['hearts_7'] })
    |
    +-- Set isSubmittingAction = true
    +-- Disable action buttons
    |
    v
[Wait for server response -- no local state mutation]
    |
    +------- Server accepts --------+
    |                               |
    v                               v
game:state_update                 game:action_rejected
    |                               |
    v                               v
handleStateUpdate()               handleActionRejected()
    |                               |
    +-- Update gameState            +-- Show error toast
    +-- Enqueue animations          +-- Revert to serverState
    +-- Append to actionLog         +-- Clear selection
    +-- Clear selection             +-- Set isSubmitting = false
    +-- Set isSubmitting = false
    +-- Recompute derived state
```

**Critical rule: No optimistic updates.** The client never mutates game state before server confirmation. This eliminates an entire class of desync bugs and ensures the server remains the sole authority as specified in the architecture overview (Section 12, Principle 1).

### 5.4 Client-Side Validation for UX

While the server is the authority, the client performs pre-validation for UX responsiveness:

```typescript
// Run on every game state update to highlight playable cards
function computeLegalCards(state: ClientGameState): string[] {
  if (state.phase !== 'playing' && state.phase !== 'awaiting_post_clear_play') return [];
  if (state.currentPlayerId !== state.me.playerId) return [];

  const pileTop = state.playPileTopCards.length > 0
    ? state.playPileTopCards[state.playPileTopCards.length - 1]
    : null;

  const activeCards = state.me.activeZone === 'hand'
    ? state.me.hand
    : state.me.activeZone === 'faceUp'
      ? state.me.faceUpCards
      : [];

  return activeCards
    .filter(card => canPlayCard(card, pileTop, state.freePlay, state.nextCardOverride))
    .map(card => card.id);
}
```

This computation uses the shared `canPlayCard` function (Section 2.3). If the client-side check disagrees with the server, the server wins. The client-side check is purely a visual hint -- illegal cards appear grayed out, but the player can still attempt to play them (the server will reject and the client will show an error toast).

---

## 6. WebSocket Integration

### 6.1 Connection Lifecycle

```
Page Load (authenticated route)
    |
    v
Initialize Socket.IO client
    auth: { token: accessToken }
    transports: ['websocket']      // skip polling, use WS directly
    reconnection: true
    reconnectionDelay: 1000        // initial delay
    reconnectionDelayMax: 30000    // cap after exponential backoff
    reconnectionAttempts: 20       // max retries before giving up
    |
    v
Server validates JWT on handshake
    +-- Valid: socket connected, join appropriate room
    +-- Invalid/Expired: disconnect with error code, trigger token refresh
    |
    v
Connected -- listen for events
    |
    +-- On disconnect: show reconnecting overlay, start retry
    +-- On reconnect: re-authenticate, request full state sync
    +-- On max retries exceeded: show "Server unavailable" modal
```

### 6.2 Event Catalog

#### Events the Client Listens For (Server -> Client)

| Event Name | Payload | Description |
|---|---|---|
| `game:state_update` | `{ state: ClientGameState, event: GameActionEvent }` | Incremental state update after any game action. |
| `game:full_sync` | `{ state: ClientGameState, log: GameActionEvent[] }` | Full state rehydration on connect/reconnect. |
| `game:action_rejected` | `{ actionType: string, reason: string, state: ClientGameState }` | Server rejected a player action. Includes authoritative state. |
| `game:over` | `{ result: GameResult }` | Game has ended (win or cancellation). |
| `room:state_update` | `{ room: RoomDetail }` | Room state changed (player joined, readied, config changed). |
| `room:player_joined` | `{ player: RoomPlayer }` | A new player entered the room. |
| `room:player_left` | `{ playerId: string, reason: 'left' \| 'kicked' \| 'disconnected' }` | A player left the room. |
| `room:game_starting` | `{ gameId: string }` | Game is about to start, navigate to game page. |
| `room:expired` | `{ roomId: string }` | Room TTL expired due to inactivity. |
| `room:kicked` | `{ reason: string }` | Current player was kicked from the room by the host. |
| `room:list_update` | `{ rooms: RoomSummary[] }` | Updated room list for lobby. |
| `presence:player_connected` | `{ playerId: string }` | A player in the current room reconnected. |
| `presence:player_disconnected` | `{ playerId: string }` | A player in the current room disconnected. |
| `error:auth` | `{ message: string, code: string }` | Authentication error (token expired, revoked). |
| `error:generic` | `{ message: string, code: string }` | Unclassified server error. |

#### Events the Client Sends (Client -> Server)

| Event Name | Payload | Description |
|---|---|---|
| `game:action` | `GameAction` (discriminated union) | Any game action: play cards, pick up pile, declare direction, play blind. |
| `room:join` | `{ roomId: string, inviteCode?: string }` | Join a room. |
| `room:leave` | `{ roomId: string }` | Leave a room voluntarily. |
| `room:ready` | `{ roomId: string, ready: boolean }` | Toggle ready state. |
| `room:start_game` | `{ roomId: string }` | Host starts the game (validated server-side). |
| `room:update_config` | `{ roomId: string, config: Partial<RoomConfig> }` | Host updates room settings. |
| `presence:heartbeat` | `{}` | Periodic keepalive (every 15 seconds). |

### 6.3 Socket Manager Implementation

A singleton class wraps the Socket.IO client and dispatches events to the appropriate Zustand stores.

```typescript
class SocketManager {
  private socket: Socket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  connect(token: string): void {
    // Initialize socket with auth token
    // Register all event listeners
    // Start heartbeat interval (15s)
  }

  disconnect(): void {
    // Clear heartbeat interval
    // Remove all listeners
    // Close socket connection
  }

  // Typed emit methods -- one per outbound event
  sendGameAction(action: GameAction): void {
    this.socket?.emit('game:action', action);
  }

  joinRoom(roomId: string, inviteCode?: string): void {
    this.socket?.emit('room:join', { roomId, inviteCode });
  }

  leaveRoom(roomId: string): void {
    this.socket?.emit('room:leave', { roomId });
  }

  setReady(roomId: string, ready: boolean): void {
    this.socket?.emit('room:ready', { roomId, ready });
  }

  startGame(roomId: string): void {
    this.socket?.emit('room:start_game', { roomId });
  }

  updateRoomConfig(roomId: string, config: Partial<RoomConfig>): void {
    this.socket?.emit('room:update_config', { roomId, config });
  }

  // Reconnection handler
  private handleReconnect(): void {
    // Re-authenticate with current token
    // Request full state sync for current game/room
    // Update connection store
  }
}
```

### 6.4 Reconnection Strategy

```
Disconnect detected
    |
    v
Attempt 1: wait 1000ms, reconnect
Attempt 2: wait 2000ms, reconnect
Attempt 3: wait 4000ms, reconnect
Attempt N: wait min(1000 * 2^(N-1), 30000)ms, reconnect
    |
    +-- Each attempt:
    |     1. Socket.IO auto-reconnect fires
    |     2. On connect: emit 'presence:heartbeat' to signal alive
    |     3. Server detects reconnect, sends 'game:full_sync' if in active game
    |     4. Client replaces entire gameState with sync payload
    |     5. Client clears animation queue (stale animations are irrelevant)
    |     6. Client hides reconnecting overlay
    |
    +-- If auth token expired during disconnect:
    |     1. Server rejects socket handshake with error:auth
    |     2. Client calls refreshToken()
    |     3. On new token: reconnect socket with new token
    |     4. If refresh fails: redirect to /auth/login
    |
    +-- After 20 failed attempts:
          1. Show "Server unavailable" modal
          2. Offer manual "Retry" button (resets attempt counter)
          3. Offer "Return to lobby" (navigates away)
```

---

## 7. Behavior Rules

### 7.1 Core Behavioral Invariants

These rules are absolute and apply everywhere in the client:

1. **The client NEVER computes game state.** It renders what the server sends. Period.
2. **The client NEVER sends actions when it is not the player's turn** (except `PICK_UP_PILE` during the player's turn). Action buttons are disabled.
3. **The client NEVER allows double-submit.** Once an action is sent, the action bar is disabled until server responds.
4. **State displayed is always the last server-confirmed state.** No speculative rendering.
5. **If the client-side validation disagrees with the server, the server is correct.** The client reverts.
6. **Connection status is always visible.** The player always knows if they are connected.

### 7.2 Card Selection Rules

```
Player clicks a card:
    |
    +-- Not player's turn → no action
    +-- Card is in inactive zone → no action
    +-- Action is currently submitting → no action
    |
    +-- No cards currently selected:
    |     → Select this card
    |
    +-- Cards already selected:
    |     +-- Same rank as selected cards → toggle this card (add/remove from selection)
    |     +-- Different rank → deselect all, select this card
    |     +-- Card is a Joker and others are selected → deselect all, select Joker
    |     +-- Selected card is a Joker and this is not → deselect all, select this card
```

### 7.3 Action Submission Rules

```
Player clicks "Play":
    +-- selectedCardIds is empty → button disabled, no action
    +-- isSubmittingAction is true → button disabled, no action
    +-- OK:
        1. Set isSubmittingAction = true
        2. Send game:action { type: 'PLAY_CARDS', playerId, cardIds: selectedCardIds }
        3. Disable all action buttons
        4. Wait for server response

Player clicks "Pick Up Pile":
    +-- playPileSize === 0 → button disabled, no action
    +-- isSubmittingAction is true → button disabled, no action
    +-- OK:
        1. Set isSubmittingAction = true
        2. Send game:action { type: 'PICK_UP_PILE', playerId }
        3. Wait for server response

Player clicks face-down card slot (index N):
    +-- activeZone !== 'faceDown' → slots not clickable
    +-- isSubmittingAction is true → no action
    +-- OK:
        1. Set isSubmittingAction = true
        2. Send game:action { type: 'PLAY_BLIND', playerId, cardIndex: N }
        3. Wait for server response

Player clicks "Higher" or "Lower":
    +-- phase !== 'awaiting_queen_declaration' → buttons not shown
    +-- currentPlayerId !== myPlayerId → buttons not shown
    +-- isSubmittingAction is true → no action
    +-- OK:
        1. Set isSubmittingAction = true
        2. Send game:action { type: 'DECLARE_DIRECTION', playerId, direction }
        3. Wait for server response
```

### 7.4 Animation Queueing

Animations are processed sequentially. When a state update arrives with an associated action event, the corresponding animation is enqueued.

```
State update received:
    |
    v
Determine animation type from GameActionEvent:
    +-- cards_played → enqueue 'play_to_pile' animation
    +-- pile_picked_up → enqueue 'pile_to_hand' animation
    +-- blind_card_revealed (legal) → enqueue 'blind_reveal' then 'play_to_pile'
    +-- blind_card_failed → enqueue 'blind_reveal' then 'blind_fail_to_hand'
    +-- pile_cleared_king → enqueue 'pile_burn'
    +-- sbobuz_triggered → enqueue 'pile_burn' with special Sbobuz visual effect
    +-- cards_drawn → enqueue 'draw_to_hand'
    |
    v
Process queue:
    +-- If queue is empty → idle
    +-- If animation in progress → wait for completion
    +-- If queue has items → play next animation
    |
    v
Animation completes:
    +-- Remove from queue
    +-- Process next item (if any)
    +-- If queue empty → update render state to final positions
```

**Rapid action handling:** If multiple state updates arrive faster than animations complete, later animations are shortened (duration halved) to catch up. If the queue exceeds 5 items, intermediate animations are skipped and only the final state is animated.

### 7.5 Turn Timer Behavior

```
State update received with new currentPlayerId:
    |
    v
Start local countdown timer:
    - Initial value: turnTimerSeconds * 1000 ms
    - Decrement every 100ms (visual smoothness)
    - Display: TurnTimerBar component
    |
    v
Timer reaches 0:
    - Client does NOT send timeout action
    - Client shows "Time's up!" briefly
    - Server sends TIMEOUT_FORFEIT action via game:state_update
    - Client processes the state update normally
```

**The client never triggers a timeout.** The server owns the clock. The client timer is a visual aid that may drift slightly from the server's timer -- this is acceptable because the server's decision is authoritative.

---

## 8. Error Handling

### 8.1 Error Classification & Response

| Error Type | Detection | User Experience | Recovery |
|---|---|---|---|
| **Network disconnect** | Socket.IO `disconnect` event | Reconnecting overlay with spinner and attempt counter | Automatic reconnect with exponential backoff |
| **Action rejected** | `game:action_rejected` event | Error toast: "{reason}". UI reverts to server state. | Clear selection, re-enable controls |
| **Auth token expired** | `error:auth` event or 401 on REST | Silent -- no UI change if refresh succeeds | Call `refreshToken()`, retry original action |
| **Auth refresh failed** | `refreshToken()` throws | Redirect to `/auth/login` with message | User re-authenticates |
| **Server unreachable** | Max reconnect attempts exceeded | Full-screen "Server unavailable" modal | Manual "Retry" button or navigate away |
| **Room expired** | `room:expired` event | Modal: "This room has expired" | "Return to Lobby" button |
| **Kicked from room** | `room:kicked` event | Modal: "You were removed from this room" | "Return to Lobby" button |
| **Invalid route** | Navigation to non-existent game/room | "Not found" page | "Return to Lobby" button |
| **Client error** | React ErrorBoundary catches | "Something went wrong" fallback UI | "Reload" button (page refresh) |
| **Stale state** | Client state diverges from server (detected on next sync) | No visible error -- state silently corrected | Full sync replaces client state |

### 8.2 Error Toast System

```typescript
function showErrorToast(message: string, durationMs: number = 5000): void {
  // Add to notifications array in UIState
  // Auto-dismiss after durationMs
  // Stack up to 3 visible toasts, queue the rest
}

function showSuccessToast(message: string, durationMs: number = 3000): void {
  // Same mechanism, green styling
}
```

**Toast behavior:**
- Maximum 3 visible toasts at once. Additional toasts queue and appear as earlier ones dismiss.
- Toasts stack from the bottom-right corner, pushing upward.
- Click to dismiss early.
- Zero-duration toasts persist until explicitly dismissed.

### 8.3 REST API Error Handling

All REST API calls go through a central `apiClient` utility that handles common error patterns:

```typescript
async function apiClient<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // for httpOnly refresh token cookie
  });

  if (response.status === 401) {
    // Token expired -- attempt silent refresh
    await useAuthStore.getState().refreshToken();
    // Retry original request with new token
    return apiClient<T>(method, path, body);
  }

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(response.status, error.message, error.code);
  }

  return response.json();
}
```

---

## 9. Edge Cases

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | **Player refreshes browser mid-game** | Page reloads, Socket.IO reconnects, server sends `game:full_sync` with complete current state and action log. Client renders from scratch with no animation queue. No data loss. |
| 2 | **Multiple tabs open on same account** | Each tab maintains its own WebSocket connection. The server sends state updates to all connections for the same user. Both tabs render identically. Actions sent from either tab are processed. No "authoritative tab" concept -- the server handles duplicates by rejecting out-of-turn actions. |
| 3 | **Slow connection (>2s latency)** | `isSubmittingAction` flag prevents double-submit. Action buttons remain disabled until server responds. If latency exceeds 5 seconds, show a "Waiting for server..." label near the action bar. |
| 4 | **Screen resize during game** | CSS layout reflows. Component positions are relative, not absolute. Card fan re-calculates positions. Opponent zones reposition. Debounce resize handler (250ms) to avoid layout thrashing. |
| 5 | **Browser back button during game** | Navigation guard intercepts with `beforeunload` event + Next.js route change event. Show "Leave game?" confirmation modal. Confirming navigates away (server's disconnect grace period applies). Cancelling stays on the game page. |
| 6 | **Tab backgrounded during player's turn** | Use `document.visibilitychange` API. When tab is hidden and it becomes the player's turn, trigger a browser `Notification` (if permission granted) saying "It's your turn in Sbobuz!". Also set the document title to "(!) Your Turn - Sbobuz" for tab favicon badge behavior. |
| 7 | **Rapid sequential actions (animation queue overflow)** | If the animation queue exceeds 5 items, collapse intermediate animations: jump directly to final positions for all queued items except the last, which plays at normal speed. This prevents the UI from falling behind the game state. |
| 8 | **Displaying face-down cards** | Face-down cards show a card back image. No rank or suit information. The card back is identical for all face-down cards (no distinguishing features). When a blind play occurs, the card animates a 3D Y-axis flip from back to front before moving to the pile. |
| 9 | **Showing whose turn it is** | TurnIndicator component is always visible. Current player's name is highlighted. If it is the local player's turn, the entire player zone has a subtle pulsing border glow. Opponent zones glow only on their turn. |
| 10 | **Game ends -- victory/defeat screen** | GameOverOverlay renders on top of the game board (board remains visible underneath, blurred). Shows winner, final standings, game stats. Buttons: "Play Again" (creates new room with same config, invites same players) and "Return to Lobby". |
| 11 | **Room expired while player is idle** | Server sends `room:expired` event. Client shows modal: "This room has expired due to inactivity." Single button: "Return to Lobby". Client clears room state from LobbyStore. |
| 12 | **Player kicked from room by host** | Server sends `room:kicked` event with reason. Client shows modal: "You were removed from this room." Single button: "Return to Lobby". If player is on the `/room/:roomId` page, navigate to `/lobby` after dismissing modal. |
| 13 | **Simultaneous ready/unready by multiple players** | Not a conflict. Each player's ready state is independent. The server processes each `room:ready` event sequentially and broadcasts updated room state. The client re-renders the player list on each `room:state_update`. The "Start Game" button's enabled state is recomputed: `allPlayersReady && playerCount >= minPlayers && isHost`. |
| 14 | **Invite link opened when already in another room** | When navigating to `/room/:roomId` with an invite code and the player is already in a different room, show a modal: "You are currently in room '{currentRoomName}'. Leave that room and join this one?" Confirming sends `room:leave` for the current room, then `room:join` for the new room. |
| 15 | **Mobile keyboard overlapping game UI** | The game board does not use text inputs during gameplay, so the mobile keyboard should not appear. The chat panel (Phase 2) will need specific handling: when the chat input is focused, the game board scrolls up or the chat panel expands to a full-screen overlay. For Phase 1, this is not applicable since chat is deferred. |
| 16 | **Server sends state update while animation is playing** | The new state is stored immediately in the game store (state is always current). The animation queue receives the new animation. When the current animation finishes, the next plays. The rendered card positions always converge to the latest state, even if animations are skipped. |
| 17 | **Player attempts to play cards during opponent's turn** | Cards are selectable (for planning) but the "Play" button is disabled. Clicking "Play" has no effect. If the player somehow bypasses the UI (e.g., devtools), the server rejects the action with "Not your turn." |
| 18 | **WebSocket connects but game state is stale** | On every reconnect, the client sends a `presence:heartbeat`. The server responds with `game:full_sync` if the client's last known `actionIndex` is behind the server's current state. The client replaces its entire game state with the sync payload. |
| 19 | **Sbobuz animation** | When a Sbobuz triggers, the standard pile-burn animation plays with an additional visual flourish: the text "SBOBUZ!" appears in large, animated text over the pile area, then fades. The direction reversal is indicated by a rotating arrow icon in the TurnIndicator. This animation takes priority over all other queued animations. |
| 20 | **Player has no legal plays and chooses not to pick up** | The client highlights the "Pick Up Pile" button as the only option. The "Play" button remains disabled (no cards selected) or grayed out (no legal cards). The player can still select cards and attempt to play them -- the server will reject. Eventually the turn timer expires and the server forces a timeout. |
| 21 | **Game cancelled due to opponent disconnect** | Server sends `game:over` with `reason: 'cancelled_disconnect'`. GameOverOverlay shows "Game cancelled -- {playerName} disconnected." No winner is declared. "Return to Lobby" button. Cancelled games do not affect stats or ratings. |
| 22 | **Player wins by playing a King as their last card** | Server sends `game:over`. The client shows the King being played to the pile, then the pile-burn animation, then immediately the victory overlay. The "must play again" phase is skipped because the win condition check happens first (per engine spec Section 6.3). |

---

## 10. Integration Points

### 10.1 Inbound (Server -> Client)

```
Server Realtime Module (Socket.IO)
    |
    +-- game:state_update -----> GameStore.handleStateUpdate()
    +-- game:full_sync --------> GameStore.handleFullSync()
    +-- game:action_rejected --> GameStore.handleActionRejected()
    +-- game:over -------------> GameStore.handleGameOver()
    +-- room:state_update -----> LobbyStore.handleRoomUpdate()
    +-- room:player_joined ----> LobbyStore.handlePlayerJoined()
    +-- room:player_left ------> LobbyStore.handlePlayerLeft()
    +-- room:game_starting ----> Router.navigate(`/game/${gameId}`)
    +-- room:expired ----------> Show modal, LobbyStore.clearCurrentRoom()
    +-- room:kicked -----------> Show modal, Router.navigate('/lobby')
    +-- room:list_update ------> LobbyStore.handleRoomListUpdate()
    +-- presence:* ------------> Update opponent.isConnected in GameStore
    +-- error:auth ------------> AuthStore.refreshToken() or redirect to login
    +-- error:generic ---------> Show error toast
```

### 10.2 Outbound (Client -> Server)

```
REST API (HTTPS):
    +-- POST /auth/register -----> Create account
    +-- POST /auth/login --------> Authenticate, receive tokens
    +-- POST /auth/refresh ------> Refresh access token (httpOnly cookie)
    +-- POST /auth/logout -------> Revoke session
    +-- GET  /profile -----------> Fetch player profile and stats
    +-- GET  /profile/history ---> Fetch match history (paginated)
    +-- GET  /leaderboard -------> Fetch global rankings (paginated)

WebSocket (Socket.IO):
    +-- game:action -------------> Send game action (play, pick up, declare, blind)
    +-- room:join ---------------> Join a room
    +-- room:leave --------------> Leave a room
    +-- room:ready --------------> Toggle ready state
    +-- room:start_game ---------> Host starts game
    +-- room:update_config ------> Host updates room settings
    +-- presence:heartbeat ------> Periodic keepalive
```

### 10.3 Shared Types Dependency

```
/shared/types/
    +-- card.ts         Card, StandardCard, JokerCard, Suit, Rank
    +-- game.ts         GamePhase, ActiveZone, GameConfig
    +-- actions.ts      GameAction and all action subtypes
    +-- room.ts         RoomStatus, RoomConfig
    +-- events.ts       All WebSocket event payload types
    +-- errors.ts       Error codes and error response shapes
```

The client imports these types directly. They are published as a shared workspace package (e.g., `@sbobuz/shared`) that both the `app/` and `server/` directories depend on. Any type change requires updating both consumer codebases and is caught by TypeScript compilation before deploy.

---

## 11. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | State management library | **Zustand** | Minimal boilerplate, excellent TypeScript support, external store avoids unnecessary re-renders from React Context propagation, small bundle size. Context + useReducer requires manual memoization across the tree. Redux is more ceremony than a solo developer needs. |
| 2 | Optimistic updates | **No optimistic updates** | Server-authoritative architecture (architecture-overview.md, Principle 1) means client state is always the last server-confirmed state. Optimistic updates create a class of desync bugs that are hard to debug and undermine the authority model. The latency trade-off is acceptable for a turn-based game where actions happen every few seconds, not every frame. |
| 3 | SSR vs SPA boundary | **SSR for public pages (`/`, `/auth/*`, `/leaderboard`), SPA for authenticated pages** | Public pages benefit from SSR for SEO and initial load performance. Authenticated gameplay pages are inherently dynamic and gain nothing from SSR. The SPA model avoids full page reloads during real-time gameplay. |
| 4 | CSS approach | **Tailwind CSS** | Utility-first CSS eliminates context-switching between component files and stylesheets. Co-located styling reads linearly with the component markup. JIT mode produces minimal CSS bundles. The design system (spacing, colors, typography) is configured once in `tailwind.config.ts` and enforced everywhere. CSS Modules were considered but rejected: they still require separate files and naming conventions, adding overhead for a solo developer. |
| 5 | Animation library | **Framer Motion** | First-class React integration via `motion` components. Declarative animation API (animate from/to) maps naturally to card state transitions. AnimatePresence handles mount/unmount animations for cards entering and leaving zones. Layout animations handle re-ordering (hand sort). Spring physics for card movements feel natural. Alternative (react-spring) has a lower-level API requiring more boilerplate. |
| 6 | Chat feature | **Deferred to Phase 2** | Chat adds UI complexity (input handling, message list, notification badges) that is orthogonal to the core game loop. The ChatPanel component placeholder is included in the component hierarchy but renders nothing in Phase 1. The WebSocket event namespace `chat:*` is reserved but not implemented. |
| 7 | Card art / assets | **CSS-rendered cards in Phase 1, custom art in Phase 2** | CSS-rendered cards (rank + suit symbols using Unicode/SVG) ship faster than commissioning card art. The CardComponent abstraction means the rendering implementation can be swapped without changing any parent component. |
| 8 | Drag-and-drop for card play | **Click-to-select, then click Play button** | Drag-and-drop is harder to make accessible (keyboard, screen reader) and unreliable on touch devices. Click-to-select is universally supported and maps cleanly to the multi-card selection model (select multiple same-rank cards, then confirm). Drag-and-drop can be added as an alternative input method in Phase 2 without replacing click-to-select. |
| 9 | Mobile support level | **Desktop-first, tablet-friendly, mobile-aware** | The game board with 5 opponent zones, a hand fan, and action controls requires meaningful screen real estate. Desktop is the primary target. Tablet (landscape) gets a slightly compressed layout. Mobile (portrait) gets a simplified layout with stacked zones and scrolling. Full mobile optimization is Phase 2. |
| 10 | Turn timer authority | **Server is sole timer authority; client timer is visual only** | Client clocks can drift, be manipulated, or freeze when tabs are backgrounded. The server runs the authoritative timer and sends `TIMEOUT_FORFEIT` when time expires. The client countdown is a UX aid that may be off by up to a second -- this is acceptable. |
| 11 | Spectator mode | **Not implemented** | Deferred per architecture-overview.md. The event-sourced game architecture supports spectators naturally (send current state + stream events), but the client UI does not need to handle read-only game views in Phase 1. |
| 12 | Sound effects | **Deferred to Phase 2** | Audio adds complexity (asset loading, user preference storage, mobile autoplay restrictions). The animation system provides sufficient feedback in Phase 1. A `SoundManager` hook point is reserved in the animation completion callbacks. |

---

## 12. Implications for Architecture

### From Decision 1 (Zustand)
- The `app/stores/` directory contains one file per store: `authStore.ts`, `lobbyStore.ts`, `gameStore.ts`, `connectionStore.ts`. No Redux boilerplate (actions, reducers, selectors in separate files).
- Components consume stores via `useAuthStore()`, `useGameStore()`, etc. No `<Provider>` wrappers in the component tree.
- DevTools integration: Zustand's devtools middleware enables Redux DevTools inspection in development.

### From Decision 2 (No Optimistic Updates)
- Every user action that mutates game state must go through the WebSocket and wait for server confirmation. This means the `isSubmittingAction` flag and disabled controls are the normal UX during play, not an edge case.
- The GameStore never has a "pending" state or "rollback" mechanism. State is either "last confirmed by server" or "waiting for update."

### From Decision 3 (SSR/SPA Boundary)
- The Next.js app uses the App Router. Pages under `/auth/` and the root `/` use server components. Pages under `/lobby/`, `/room/`, `/game/`, and `/profile/` are client components with `'use client'` directive.
- The `/leaderboard` page uses SSR with ISR (Incremental Static Regeneration, revalidate every 60 seconds) since rankings don't need real-time updates.

### From Decision 4 (Tailwind CSS)
- `tailwind.config.ts` defines the design system: color palette (brand colors, card suit colors), spacing scale, font families, breakpoints.
- No separate `.css` or `.module.css` files except for one `globals.css` that imports Tailwind's base, components, and utilities layers.

### From Decision 5 (Framer Motion)
- CardComponent uses `motion.div` with `layoutId` for seamless position animations when cards move between zones.
- PlayPileZone uses `AnimatePresence` to animate cards entering and the pile clearing.
- Animation durations are defined in a constants file (`ANIMATION_DURATIONS`) for consistency: play card (300ms), pick up pile (400ms), pile burn (500ms), blind reveal (600ms), deal (200ms per card).

### From Decision 8 (Click-to-Select)
- The ActionBar is always visible during gameplay (not hidden behind a drag target).
- Multi-card selection state (`selectedCardIds`) lives in GameUIState and is cleared on every server state update.
- Keyboard users can Tab through cards and press Enter/Space to toggle selection, then Tab to the Play button.

### From Decision 9 (Desktop-First Responsive)
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px).
- Below `md`: opponents stack vertically above the pile. Hand cards shrink. Action bar becomes full-width fixed at bottom.
- Below `sm`: minimal layout. Face-up cards collapse to count badges. Hand shows 4 cards at a time with horizontal scroll.

---

## 13. File Structure

```
app/
 +-- layout.tsx                     # Root layout (HTML shell, font loading, providers)
 +-- page.tsx                       # Landing page (SSR)
 +-- globals.css                    # Tailwind imports + CSS custom properties
 +--auth/
 |    +-- login/page.tsx            # Login page (SSR)
 |    +-- register/page.tsx         # Register page (SSR)
 +-- lobby/
 |    +-- page.tsx                  # Room browser (CSR)
 +-- room/
 |    +-- [roomId]/page.tsx         # Room waiting screen (CSR)
 +-- game/
 |    +-- [gameId]/page.tsx         # Game board (CSR)
 +-- profile/
 |    +-- page.tsx                  # Player profile (CSR)
 +-- leaderboard/
 |    +-- page.tsx                  # Rankings (SSR + ISR)
 +-- components/
 |    +-- layout/
 |    |    +-- Header.tsx
 |    |    +-- ConnectionStatusIndicator.tsx
 |    |    +-- NotificationToastContainer.tsx
 |    +-- game/
 |    |    +-- GameBoard.tsx
 |    |    +-- CardComponent.tsx
 |    |    +-- PlayerHand.tsx
 |    |    +-- PlayerFaceUpCards.tsx
 |    |    +-- PlayerFaceDownCards.tsx
 |    |    +-- FaceDownCardSlot.tsx
 |    |    +-- PlayPileZone.tsx
 |    |    +-- DrawPileZone.tsx
 |    |    +-- OpponentZone.tsx
 |    |    +-- OpponentCardCountBadge.tsx
 |    |    +-- ActionBar.tsx
 |    |    +-- TurnIndicator.tsx
 |    |    +-- TurnTimerBar.tsx
 |    |    +-- GameLog.tsx
 |    |    +-- GameLogEntry.tsx
 |    |    +-- GameOverOverlay.tsx
 |    |    +-- ReconnectingOverlay.tsx
 |    |    +-- QueenDeclarationButtons.tsx
 |    +-- lobby/
 |    |    +-- RoomList.tsx
 |    |    +-- RoomCard.tsx
 |    |    +-- RoomFiltersBar.tsx
 |    |    +-- CreateRoomDialog.tsx
 |    +-- room/
 |    |    +-- RoomLobby.tsx
 |    |    +-- PlayerSlot.tsx
 |    |    +-- RoomSettingsPanel.tsx
 |    |    +-- ReadyButton.tsx
 |    |    +-- StartGameButton.tsx
 |    |    +-- InviteLinkButton.tsx
 |    +-- shared/
 |         +-- Button.tsx
 |         +-- Modal.tsx
 |         +-- LoadingSpinner.tsx
 |         +-- ErrorBoundary.tsx
 +-- hooks/
 |    +-- useSocket.ts              # Socket.IO connection hook
 |    +-- useTurnTimer.ts           # Client-side turn countdown
 |    +-- useGameActions.ts         # Action dispatch helpers
 |    +-- useCardSelection.ts       # Card selection logic
 |    +-- useLegalCards.ts          # Computed legal card highlights
 |    +-- useTabVisibility.ts       # Tab focus/blur detection for notifications
 |    +-- useBeforeUnload.ts        # Browser close/navigate warning
 |    +-- useResponsiveLayout.ts    # Breakpoint-aware layout calculations
 +-- stores/
 |    +-- authStore.ts
 |    +-- lobbyStore.ts
 |    +-- gameStore.ts
 |    +-- connectionStore.ts
 |    +-- uiStore.ts
 +-- lib/
 |    +-- apiClient.ts              # REST API wrapper with auth retry
 |    +-- socketManager.ts          # Socket.IO singleton manager
 |    +-- constants.ts              # Animation durations, breakpoints, config
 |    +-- cardUtils.ts              # Shared card validation (imported from /shared)
 +-- styles/
      +-- tailwind.config.ts        # Design system configuration
```

---

## 14. Accessibility Requirements

The game must be playable with keyboard and understandable via screen reader. These requirements apply to the game board components.

| Requirement | Implementation |
|---|---|
| **Card keyboard navigation** | Cards in PlayerHand are focusable with `tabindex="0"`. Arrow keys move focus between cards. Enter/Space toggles selection. |
| **Screen reader card announcement** | Each CardComponent has `aria-label`: "7 of hearts, selectable" / "Face-down card, position 2" / "Joker, selected". |
| **Turn announcement** | When it becomes the player's turn, use `aria-live="assertive"` region to announce "Your turn." When an opponent plays, `aria-live="polite"` announces the action. |
| **Game log as live region** | GameLog uses `aria-live="polite"` so new entries are announced to screen readers without stealing focus. |
| **Action bar focus management** | When it becomes the player's turn, focus moves to the first playable card in the hand. When the action bar is used, focus returns to the hand after server confirmation. |
| **Color-independent indicators** | Turn timer uses both color (green/yellow/red) and a progress bar (width shrinks) and text ("12s remaining"). Card legality uses both color (green border vs gray) and icon (checkmark dot vs no indicator). |
| **Skip to game controls** | A visually-hidden "Skip to action bar" link appears on focus for keyboard users, allowing them to jump past the card display to the action buttons. |
| **Reduced motion** | Respect `prefers-reduced-motion` media query. When active, card animations use instant transitions (opacity fade) instead of position/rotation animations. |

---

## 15. Performance Considerations

| Concern | Approach |
|---|---|
| **Re-render minimization** | Zustand's `useStore(selector)` pattern ensures components only re-render when their selected slice of state changes. CardComponent is wrapped in `React.memo` with a shallow comparison on props. |
| **Animation performance** | Framer Motion uses CSS transforms (GPU-accelerated) for all card movements. No layout-triggering properties (width, height, top, left) are animated. |
| **Bundle size** | Next.js code-splitting ensures the game board components are only loaded on the `/game/:gameId` route. Landing and auth pages do not include game-related JavaScript. |
| **WebSocket payload size** | The server sends minimal payloads. `ClientGameState` excludes hidden information (other hands, face-down values, draw pile order), reducing payload size by approximately 60% compared to full `GameState`. |
| **Image assets** | Card art (Phase 2) will use a single sprite sheet, not individual images. In Phase 1, cards are CSS-rendered (zero image assets). |
| **Memory** | The action log in GameStore is capped at 200 entries. Older entries are discarded (they exist on the server if needed for replay). The animation queue is capped at 5 items. |

---

# GameEngineError

## Severity

Critical -- page immediately.

## Description

The game engine reported one or more failed state transitions in the last minute. This alert fires on `sbobuz_game_engine_errors_total`, which tracks cases where the reducer or validator rejects an action that was expected to succeed. Because the game engine is pure and deterministic, any error here indicates either a bug in the engine logic or invalid input bypassing the validation layer.

## Impact

- The affected game session is likely in an inconsistent state.
- The player who triggered the action sees an error and cannot continue their turn.
- If the error is systematic (e.g., a specific action type always fails), all games using that action type are affected.
- Game state stored in memory may diverge from expected event history.

## Investigation Steps

1. **Identify the error type.**

   ```promql
   sum by (error_type) (increase(sbobuz_game_engine_errors_total[5m]))
   ```
   Common error types: `invalid_action`, `illegal_move`, `state_corruption`, `unknown`.

2. **Find the affected game session in logs.**

   ```logql
   {app="sbobuz-server"} | json | module="game-engine" | level="error"
   ```
   Look for fields: `gameId`, `playerId`, `actionType`, `phase`, `errorMessage`.

3. **Check if the error correlates with a specific game action.**

   ```promql
   sum by (action_type) (rate(sbobuz_game_actions_total[5m]))
   ```
   Compare action rates with error rates to identify which action triggers failures.

4. **Check if a recent deployment introduced the issue.**

   ```bash
   kubectl -n sbobuz rollout history deployment/sbobuz-server
   ```
   If a deploy happened recently, check the diff for changes to the game engine module.

5. **Inspect the game state.**

   If you have the `gameId` from logs, check the session manager's in-memory state via the debug endpoint (if available in staging) or reconstruct from the event log in PostgreSQL:
   ```sql
   SELECT * FROM game_events WHERE game_id = '<GAME_ID>' ORDER BY sequence_number;
   ```

6. **Check for related unhandled exceptions.**

   ```promql
   increase(sbobuz_unhandled_exceptions_total{module="game-engine"}[5m])
   ```

## Resolution

- **Known reducer bug:** If the error traces to a specific reducer case, apply a hotfix to the reducer logic. The game engine is pure, so the fix can be unit-tested locally before deploying.

- **Invalid client input:** If the client is sending malformed actions, check the WebSocket validation layer (`server/src/infra/websocket/`) and the action schemas in `shared/types/`. Add missing validation.

- **Stuck game session:** If a specific game is stuck due to corrupted state, the session can be force-cancelled via the admin API (if available) or by restarting the pod (the session manager will detect orphaned sessions on startup).

- **Rollback:** If the error was introduced by a deployment:
  ```bash
  kubectl -n sbobuz rollout undo deployment/sbobuz-server
  ```

## Escalation

- Always involve the game engine engineer for this alert. Game engine errors indicate logic bugs that require domain expertise to fix.
- If the error rate is increasing and affecting multiple games, consider temporarily disabling new game creation while investigating.

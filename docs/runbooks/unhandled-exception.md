# UnhandledException

## Severity

Critical -- page immediately.

## Description

One or more unhandled exceptions were caught by the global error handler in the last minute. This alert fires on `sbobuz_unhandled_exceptions_total`. Unhandled exceptions indicate code paths where errors are not properly caught and handled, which can cause request failures, memory leaks, or process crashes.

## Impact

- The request or WebSocket message that triggered the exception returned an error to the client.
- If the exception occurs in an async context without proper error boundaries, it may crash the Node.js process (triggering a pod restart).
- Repeated unhandled exceptions in the same code path will cause sustained failures for all users hitting that path.

## Investigation Steps

1. **Identify the source module.**

   ```promql
   sum by (module) (increase(sbobuz_unhandled_exceptions_total[5m]))
   ```

2. **Find the exception details in logs.**

   The global error handler logs the full stack trace:
   ```logql
   {app="sbobuz-server"} | json | level="error" | msg=~".*unhandled.*"
   ```
   Or via kubectl:
   ```bash
   kubectl -n sbobuz logs -l app=sbobuz-server --since=10m | grep -i "unhandled" | head -20
   ```

3. **Check for pod restarts.**

   Unhandled promise rejections in Node.js 20 throw by default and can crash the process:
   ```bash
   kubectl -n sbobuz get pods -l app=sbobuz-server -o wide
   kubectl -n sbobuz describe pod <pod-name> | grep -A3 "Restart Count"
   ```

4. **Check if the exception correlates with a recent deployment.**

   ```bash
   kubectl -n sbobuz rollout history deployment/sbobuz-server
   ```

5. **Check if the exception is triggered by specific input.**

   Look at the request context in the error log entry. Fields to examine: `path`, `method`, `userId`, `gameId`, `socketEvent`.

6. **Check memory and CPU for resource exhaustion.**

   ```bash
   kubectl -n sbobuz top pods -l app=sbobuz-server
   ```
   ```promql
   process_memory_bytes{type="heap_used"}
   process_cpu_usage_percent
   ```

## Resolution

- **Missing error handling:** Add try-catch blocks or `.catch()` handlers to the identified code path. Ensure the error is logged with context and an appropriate error response is returned.

- **Null/undefined access:** If the stack trace shows `TypeError: Cannot read properties of undefined`, check for missing null guards on optional data (database results, Redis lookups, WebSocket message fields).

- **Third-party library error:** If the exception originates in a dependency, check for known issues in the library's issue tracker. Pin to a known-good version if needed.

- **Rollback:** If introduced by a recent deployment:
  ```bash
  kubectl -n sbobuz rollout undo deployment/sbobuz-server
  ```

- **Pod crash loop:** If pods are crash-looping due to the exception:
  ```bash
  kubectl -n sbobuz logs -l app=sbobuz-server --previous
  ```
  This shows logs from the crashed container to identify the root cause.

## Escalation

- Escalate to the backend platform engineer for infrastructure-layer exceptions (database, Redis, WebSocket).
- Escalate to the game engine engineer for exceptions in the game engine module.
- If pods are crash-looping and a rollback does not resolve it, escalate to the DevOps/infrastructure engineer.

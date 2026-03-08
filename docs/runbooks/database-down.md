# DatabaseDown

## Severity

Critical -- page immediately.

## Description

The PostgreSQL database appears unreachable. This alert fires when the connection pool reports 0% utilization while queries are waiting for a connection, indicating the database is not accepting connections. The alert condition is `sbobuz_postgres_connections_used_percent == 0 AND db_pool_waiting_count > 0` sustained for 1 minute.

## Impact

- All database-dependent operations fail: user registration, login (user lookup), game history persistence, leaderboard queries.
- Active game sessions in memory continue to function (game state is held in-memory and Redis), but completed games cannot be persisted.
- New user registrations and logins are impossible.
- The application will return 500 errors for any endpoint that requires database access.

## Investigation Steps

1. **Confirm the database is actually unreachable.**

   ```bash
   # Check if the PostgreSQL pod/service is running
   kubectl -n sbobuz get pods -l app=postgresql
   kubectl -n sbobuz get svc postgresql

   # Try connecting directly
   kubectl -n sbobuz exec -it deploy/sbobuz-server -- node -e \
     "const net = require('net'); const s = net.connect(5432, 'postgresql', () => { console.log('connected'); s.end(); }); s.on('error', e => console.log('failed:', e.message))"
   ```

2. **Check PostgreSQL pod logs.**

   ```bash
   kubectl -n sbobuz logs -l app=postgresql --tail=50
   ```
   Look for: `FATAL: too many connections`, `could not open file`, `out of memory`, disk space errors.

3. **Check database disk usage.**

   ```bash
   kubectl -n sbobuz exec -it deploy/postgresql -- df -h /var/lib/postgresql/data
   ```

4. **Check PostgreSQL connection count.**

   ```bash
   kubectl -n sbobuz exec -it deploy/postgresql -- psql -U sbobuz -c "SELECT count(*) FROM pg_stat_activity;"
   kubectl -n sbobuz exec -it deploy/postgresql -- psql -U sbobuz -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
   ```

5. **Check for long-running queries or locks.**

   ```bash
   kubectl -n sbobuz exec -it deploy/postgresql -- psql -U sbobuz -c \
     "SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;"
   ```

6. **Check application connection pool metrics.**

   ```promql
   db_pool_active_connections
   db_pool_waiting_count
   sbobuz_postgres_connections_used_percent
   ```

7. **Check for recent PersistentVolumeClaim issues.**

   ```bash
   kubectl -n sbobuz get pvc
   kubectl -n sbobuz describe pvc postgresql-data
   ```

## Resolution

- **PostgreSQL pod crashed:** Check logs for the crash reason, then restart:
  ```bash
  kubectl -n sbobuz delete pod -l app=postgresql
  ```
  The StatefulSet/Deployment will recreate the pod. Data persists on the PVC.

- **Connection limit exhausted:** Increase `max_connections` in PostgreSQL config or reduce the application pool size. Terminate idle connections:
  ```bash
  kubectl -n sbobuz exec -it deploy/postgresql -- psql -U sbobuz -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';"
  ```

- **Disk full:** Identify and clean up old data, WAL files, or temporary files:
  ```bash
  kubectl -n sbobuz exec -it deploy/postgresql -- psql -U sbobuz -c "VACUUM FULL;"
  ```
  If the PVC is too small, resize it (if the storage class supports expansion).

- **Network issue:** Check NetworkPolicies and DNS resolution:
  ```bash
  kubectl -n sbobuz exec -it deploy/sbobuz-server -- nslookup postgresql
  ```

- **Application pool misconfiguration:** Verify the `DATABASE_POOL_SIZE` environment variable in the application ConfigMap matches the expected value and does not exceed PostgreSQL's `max_connections`.

## Escalation

- If the database cannot be restored within 10 minutes, escalate to the DevOps/infrastructure engineer and the backend platform engineer.
- If data loss is suspected (corrupted WAL, missing files), escalate immediately and initiate the backup restoration procedure.
- Active game sessions are preserved in memory/Redis for up to 30 seconds after the last heartbeat, so there is a brief window to restore before games are lost.

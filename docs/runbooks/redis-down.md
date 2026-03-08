# RedisDown

## Severity

Critical -- page immediately.

## Description

No active Redis connections have been reported for at least 30 seconds. This alert fires on `redis_connections_active == 0`. Redis is a critical dependency for Sbobuz: it backs the Socket.IO adapter (pub/sub for multi-instance communication), stores refresh tokens, manages user sessions, and holds lobby room state.

## Impact

- **WebSocket communication breaks:** The Socket.IO Redis adapter cannot publish or subscribe to events. In a multi-pod deployment, players on different pods cannot interact.
- **Authentication degrades:** Refresh token rotation fails. Users with expired access tokens cannot obtain new ones and are effectively logged out.
- **Session management fails:** Active session tracking and per-user session limits stop working.
- **Lobby state is lost:** Room listings, player presence, and matchmaking state stored in Redis become unavailable.
- **Game sessions in memory continue** but cannot synchronize across pods.

## Investigation Steps

1. **Check if the Redis pod/service is running.**

   ```bash
   kubectl -n sbobuz get pods -l app=redis
   kubectl -n sbobuz get svc redis
   ```

2. **Check Redis pod logs.**

   ```bash
   kubectl -n sbobuz logs -l app=redis --tail=50
   ```
   Look for: `Out of memory`, `Can't save in background`, `maxmemory reached`, connection refused errors.

3. **Check Redis memory usage.**

   ```bash
   kubectl -n sbobuz exec -it deploy/redis -- redis-cli INFO memory
   ```
   Key fields: `used_memory_human`, `used_memory_peak_human`, `maxmemory`, `mem_fragmentation_ratio`.

4. **Check Redis connectivity from the application pod.**

   ```bash
   kubectl -n sbobuz exec -it deploy/sbobuz-server -- node -e \
     "const net = require('net'); const s = net.connect(6379, 'redis', () => { console.log('connected'); s.end(); }); s.on('error', e => console.log('failed:', e.message))"
   ```

5. **Check application-side Redis metrics.**

   ```promql
   redis_connections_active
   sbobuz_redis_memory_used_bytes
   redis_command_duration_ms
   ```

6. **Check for Redis Sentinel/cluster issues (if applicable).**

   ```bash
   kubectl -n sbobuz exec -it deploy/redis -- redis-cli PING
   kubectl -n sbobuz exec -it deploy/redis -- redis-cli INFO replication
   ```

7. **Check recent network policy changes.**

   ```bash
   kubectl -n sbobuz get networkpolicy
   kubectl -n sbobuz describe networkpolicy -l app=redis
   ```

## Resolution

- **Redis pod crashed or OOMKilled:**
  ```bash
  kubectl -n sbobuz describe pod -l app=redis | grep -A5 "Last State"
  kubectl -n sbobuz delete pod -l app=redis
  ```
  The pod will be recreated. If persistence is enabled (AOF/RDB), data will be restored on startup.

- **Memory exhaustion:** If Redis hit `maxmemory`, check the eviction policy and consider increasing the limit:
  ```bash
  kubectl -n sbobuz exec -it deploy/redis -- redis-cli CONFIG GET maxmemory
  kubectl -n sbobuz exec -it deploy/redis -- redis-cli CONFIG GET maxmemory-policy
  ```
  Temporary fix: flush expired keys manually:
  ```bash
  kubectl -n sbobuz exec -it deploy/redis -- redis-cli --scan --pattern "sess:*" | head -20
  ```

- **Network issue:** Verify DNS resolution and service endpoints:
  ```bash
  kubectl -n sbobuz exec -it deploy/sbobuz-server -- nslookup redis
  kubectl -n sbobuz get endpoints redis
  ```

- **Application reconnection:** The application's Redis client (ioredis) has automatic reconnection built in. Once Redis is restored, connections should re-establish within seconds. Monitor:
  ```promql
  redis_connections_active
  ```

- **Socket.IO adapter recovery:** After Redis recovers, the Socket.IO Redis adapter will automatically resubscribe. However, players may need to reconnect their WebSocket to receive missed events. The 30-second disconnect grace period gives Redis time to recover before sessions are torn down.

## Escalation

- If Redis cannot be restored within 5 minutes, escalate to the DevOps/infrastructure engineer.
- If data loss is suspected (no persistence configured, or AOF/RDB corruption), the backend platform engineer must assess the impact on sessions and refresh tokens.
- Note: Game state is held in application memory, not Redis. Games in progress are not lost when Redis goes down, but cross-pod communication is disrupted.

# HighErrorRate

## Severity

Critical -- page immediately.

## Description

The aggregate application error rate across all modules has exceeded 10 errors per second for at least 5 minutes. This alert fires on the `sbobuz_errors_total` counter which tracks all handled application errors by module and error code.

## Impact

- Players may experience failed actions, broken game flows, or inability to log in.
- If the error source is the game engine, active games may become stuck or corrupted.
- If the error source is auth, new logins and token refreshes will fail.
- API responses will return 4xx/5xx status codes, degrading the frontend experience.

## Investigation Steps

1. **Identify the error source module and code.**

   Open the Prometheus UI or Grafana and run:
   ```promql
   topk(5, sum by (module, error_code) (rate(sbobuz_errors_total[5m])))
   ```
   This shows which module and error code contribute the most errors.

2. **Check recent deployments.**

   ```bash
   kubectl -n sbobuz rollout history deployment/sbobuz-server
   kubectl -n sbobuz describe deployment/sbobuz-server | grep Image
   ```
   If a deploy happened in the last 15 minutes, it is the likely cause.

3. **Inspect application logs.**

   Query Grafana Loki for errors from the identified module:
   ```logql
   {app="sbobuz-server"} | json | level="error" | module="<MODULE_NAME>"
   ```
   Or via kubectl:
   ```bash
   kubectl -n sbobuz logs -l app=sbobuz-server --since=10m | grep '"level":"error"' | head -50
   ```

4. **Check downstream dependencies.**

   ```bash
   # Database health
   kubectl -n sbobuz exec -it deploy/sbobuz-server -- node -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(console.log)"

   # Redis connectivity
   kubectl -n sbobuz exec -it deploy/sbobuz-server -- node -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(d=>console.log(d.redis))"
   ```

5. **Check error rate by HTTP route.**

   ```promql
   topk(5, sum by (route, status_code) (rate(http_requests_total{status_code=~"5.."}[5m])))
   ```

6. **Check pod restarts and resource pressure.**

   ```bash
   kubectl -n sbobuz get pods -l app=sbobuz-server
   kubectl -n sbobuz top pods -l app=sbobuz-server
   ```

## Resolution

- **Bad deployment:** Roll back to the previous version.
  ```bash
  kubectl -n sbobuz rollout undo deployment/sbobuz-server
  ```

- **Database issues:** See the [DatabaseDown runbook](./database-down.md).

- **Redis issues:** See the [RedisDown runbook](./redis-down.md).

- **Single error code spiking:** Check the specific module's error handling. A single error code dominating often indicates a specific bug or invalid input pattern. Check if rate limiting is working for the affected endpoint.

- **Memory/CPU pressure:** If pods are OOMKilled or CPU-throttled, adjust resource limits:
  ```bash
  kubectl -n sbobuz describe pod <pod-name> | grep -A5 "Last State"
  ```

## Escalation

- If the error rate does not decrease within 15 minutes of investigation, escalate to the backend engineering team.
- If the error source is the game engine, involve the game engine engineer.
- If the error source is infrastructure (database, Redis), involve the DevOps/infrastructure engineer.

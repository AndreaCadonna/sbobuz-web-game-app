---
name: kubernetes-deployment
description: Kubernetes deployment and orchestration patterns for Node.js/TypeScript applications. Covers deployment manifests, health probes, resource management, scaling strategy, rolling updates, and production hardening. Use this skill whenever writing Kubernetes manifests, configuring deployments, setting up health probes, defining resource requests and limits, implementing horizontal pod autoscaling, or when the user asks about Kubernetes architecture, pod lifecycle, scaling strategy, or zero-downtime deployments. Also activate when debugging pod failures, configuring ingress, or planning Kubernetes resource topology.
origin: ECC
---

# Kubernetes Deployment

Production patterns for deploying Node.js/TypeScript applications on Kubernetes. These conventions prioritize zero-downtime deployments, predictable resource usage, and operational reliability.

## When to Activate

- Writing Kubernetes manifests (Deployments, Services, Ingress)
- Configuring health probes (liveness, readiness)
- Setting resource requests and limits
- Implementing horizontal pod autoscaling
- Planning rolling update strategy
- Debugging pod crashes or scheduling failures

## Deployment Manifest

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sbobuz-server
  labels:
    app: sbobuz-server
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sbobuz-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Add 1 new pod before removing old
      maxUnavailable: 0    # Never have fewer than desired pods
  template:
    metadata:
      labels:
        app: sbobuz-server
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: sbobuz-server
          image: ghcr.io/org/sbobuz-server:COMMIT_SHA
          ports:
            - containerPort: 3000
              name: http
            - containerPort: 9464
              name: metrics
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: sbobuz-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: sbobuz-secrets
                  key: redis-url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: sbobuz-secrets
                  key: jwt-secret

          # Resource management
          resources:
            requests:
              cpu: 250m       # Guaranteed CPU (scheduling)
              memory: 256Mi   # Guaranteed memory
            limits:
              cpu: 1000m      # Burst ceiling
              memory: 512Mi   # OOMKill threshold

          # Health probes
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 2

          startupProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 12   # 12 * 5s = 60s startup window
```

## Health Probes

Three probes serve different purposes. Getting them wrong causes cascading failures.

| Probe | Question | Failure Action | Endpoint |
|-------|----------|----------------|----------|
| **Startup** | Has the app started? | Keep waiting (don't kill) | `/health/live` |
| **Liveness** | Is the process healthy? | Kill and restart the pod | `/health/live` |
| **Readiness** | Can this pod serve traffic? | Remove from load balancer | `/health/ready` |

### Critical Distinction

- **Liveness** should be lightweight — just "is the process running?" Don't check external dependencies. If Postgres is down and liveness checks Postgres, Kubernetes restarts your pod, which doesn't fix Postgres.
- **Readiness** should check external dependencies — "can I actually serve requests?" If Redis is down, the pod shouldn't receive traffic until Redis recovers.

```typescript
// /health/live — always fast, no external calls
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// /health/ready — checks dependencies
app.get('/health/ready', async (_req, res) => {
  try {
    await Promise.all([
      pool.query('SELECT 1'),
      redis.ping(),
    ]);
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});
```

## Resource Management

### Requests vs Limits

| Field | Purpose | Set To |
|-------|---------|--------|
| `requests.cpu` | Guaranteed CPU, used for scheduling | Typical steady-state usage |
| `requests.memory` | Guaranteed memory, used for scheduling | Baseline memory footprint |
| `limits.cpu` | Maximum CPU (throttled beyond this) | 2-4x requests for burst |
| `limits.memory` | Maximum memory (OOMKilled beyond this) | Headroom above peak usage |

### Sizing for Node.js

Node.js is single-threaded. One pod uses at most ~1 CPU core for JavaScript execution (plus some for GC and libuv threads). Scale horizontally, not vertically.

```yaml
# Good starting point for a Node.js app
resources:
  requests:
    cpu: 250m       # Quarter core steady state
    memory: 256Mi   # Base heap + overhead
  limits:
    cpu: 1000m      # Full core burst
    memory: 512Mi   # Headroom for spikes
```

Monitor actual usage with Prometheus and adjust. Over-requesting wastes cluster capacity. Under-requesting causes throttling and eviction.

## Rolling Updates

The `maxSurge: 1, maxUnavailable: 0` strategy means Kubernetes:
1. Starts 1 new pod with the new image
2. Waits for it to pass readiness probe
3. Shifts traffic to the new pod
4. Terminates 1 old pod
5. Repeats until all pods are updated

This guarantees zero downtime — there's never a moment where fewer than `replicas` pods are serving.

### Graceful Shutdown Sequence

When a pod is terminated (deploy, scale-down, node drain):

```
1. Pod receives SIGTERM
2. Pod is removed from Service endpoints (no new traffic)
3. App stops accepting connections
4. App drains in-flight requests and WebSocket connections
5. App snapshots active game state to Redis
6. App closes DB and Redis connections
7. App exits with code 0
8. If still running after terminationGracePeriodSeconds: SIGKILL
```

Set `terminationGracePeriodSeconds` to match your app's shutdown budget (30s is typical).

## Service and Ingress

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: sbobuz-server
spec:
  selector:
    app: sbobuz-server
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: metrics
      port: 9464
      targetPort: metrics
  # For WebSocket: use sticky sessions
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
```

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sbobuz-server
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"   # WebSocket
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"   # WebSocket
    nginx.ingress.kubernetes.io/affinity: cookie              # Sticky sessions
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [api.sbobuz.com]
      secretName: sbobuz-tls
  rules:
    - host: api.sbobuz.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: sbobuz-server
                port:
                  name: http
```

### WebSocket Considerations

WebSocket connections are long-lived and stateful. Without sticky sessions, a reconnecting client might hit a different pod that doesn't have its game state.

- Use `sessionAffinity: ClientIP` or cookie-based affinity on the ingress
- Increase proxy timeouts to match WebSocket idle timeout
- Use Redis pub/sub as a backplane so any pod can broadcast to any room

## Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sbobuz-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: sbobuz-server
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60    # Wait 60s before scaling up
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300   # Wait 5 min before scaling down
      policies:
        - type: Pods
          value: 1
          periodSeconds: 120
```

Scale down slowly — aggressive scale-down during a traffic dip kills active WebSocket connections.

## Pod Disruption Budget

```yaml
# k8s/pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: sbobuz-server
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: sbobuz-server
```

This guarantees at least 1 pod is always running during voluntary disruptions (node drain, cluster upgrade). Without a PDB, a node drain could terminate all pods simultaneously.

## Secrets

```yaml
# k8s/secrets.yaml (never commit actual values — use sealed-secrets or external-secrets)
apiVersion: v1
kind: Secret
metadata:
  name: sbobuz-secrets
type: Opaque
stringData:
  database-url: postgresql://user:pass@host:5432/db
  redis-url: redis://host:6379
  jwt-secret: your-32-char-minimum-secret-here
```

**Rules:**
- Never commit Secret manifests with real values to git
- Use SealedSecrets, external-secrets-operator, or a cloud KMS
- Reference secrets via `secretKeyRef` in pod env, not as files unless needed

## Checklist

Before deploying to Kubernetes:

- [ ] Liveness probe checks only process health (no external deps)
- [ ] Readiness probe checks all dependencies (DB, Redis)
- [ ] Startup probe gives enough time for initialization
- [ ] Resource requests match observed steady-state usage
- [ ] Resource limits provide burst headroom without over-provisioning
- [ ] Rolling update with `maxUnavailable: 0` for zero downtime
- [ ] `terminationGracePeriodSeconds` matches app shutdown budget
- [ ] PodDisruptionBudget prevents all pods from terminating simultaneously
- [ ] Secrets referenced via `secretKeyRef`, not hardcoded
- [ ] WebSocket-aware: sticky sessions, long proxy timeouts
- [ ] HPA configured with conservative scale-down behavior

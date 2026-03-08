/**
 * Redis infrastructure barrel export.
 *
 * @see docs/specs/data-layer.md Section 5.2
 */

export {
  createRedisClients,
  getRedisClient,
  getRedisSubscriber,
  closeRedisClients,
  checkRedisHealth,
  resetRedisClients,
} from './client.js';
export type { RedisHealthResult } from './client.js';

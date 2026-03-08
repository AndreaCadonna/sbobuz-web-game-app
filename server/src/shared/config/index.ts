/**
 * Configuration singleton.
 *
 * Loads, validates, and freezes the server configuration from environment
 * variables. Modules import this singleton -- they never read process.env
 * directly.
 *
 * @see docs/specs/infrastructure-deployment.md Section 2.1-2.2
 */

import { type ServerConfig, serverConfigSchema } from './schema.js';

/**
 * The validated, frozen configuration singleton.
 * Initialized lazily on first access via `loadConfig()` or `getConfig()`.
 */
let configSingleton: ServerConfig | undefined;

/**
 * Load and validate configuration from the given environment record.
 *
 * On success, the result is frozen (deep-freeze of the top-level object)
 * and cached as a singleton. On failure, an error is thrown with all
 * validation issues listed.
 *
 * @param env - The environment variables to validate. Defaults to process.env.
 * @returns The validated, frozen ServerConfig.
 * @throws Error if validation fails (caller should exit the process).
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const result = serverConfigSchema.safeParse(env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid server configuration:\n${issues}`);
  }

  const frozen = Object.freeze(result.data);
  configSingleton = frozen;
  return frozen;
}

/**
 * Get the current configuration singleton.
 *
 * If the config has not been loaded yet, this loads it from process.env.
 * Prefer calling `loadConfig()` explicitly at startup for fail-fast behavior.
 *
 * @returns The validated, frozen ServerConfig.
 */
export function getConfig(): ServerConfig {
  if (!configSingleton) {
    return loadConfig();
  }
  return configSingleton;
}

/**
 * Reset the configuration singleton (for testing only).
 * This allows tests to re-load configuration with different env values.
 */
export function resetConfig(): void {
  configSingleton = undefined;
}

export type { ServerConfig } from './schema.js';
export { serverConfigSchema } from './schema.js';

/**
 * Client-side Pino logger.
 *
 * Configured for browser usage with appropriate log level.
 * All logging in the app MUST go through this module -- never use console.log.
 */
import pino from 'pino';

const logger = pino({
  browser: {
    asObject: true,
  },
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  name: 'sbobuz-client',
});

export { logger };

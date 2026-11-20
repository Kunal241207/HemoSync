import { runExpiryMonitoringJob } from '../services/expiryService.js';
import { logger } from '../utils/logger.js';

let intervalHandle = null;

/**
 * Initializes the automated in-process expiry monitoring scheduler.
 * Runs idempotently on an hourly interval (configurable) and on startup.
 *
 * @param {number} [intervalMs=3600000] Interval in milliseconds (default 1 hour)
 */
export function startExpiryCron(intervalMs = 3600000) {
  logger.info(`⏰ Initializing automated expiry monitoring scheduler (interval: ${intervalMs / 1000}s)...`);

  // Run startup scan after brief delay to allow DB bootstrap
  const initialTimer = setTimeout(async () => {
    try {
      logger.info('⏰ Executing startup expiry monitoring sweep...');
      const summary = await runExpiryMonitoringJob();
      logger.info(
        `⏰ Startup expiry sweep complete: ${summary.expiredUnitsMarked} units expired, ${summary.alertsCreated} alerts created.`
      );
    } catch (err) {
      logger.error('Error during startup expiry sweep:', err);
    }
  }, 3000);

  // Periodic recurring check
  intervalHandle = setInterval(async () => {
    try {
      const summary = await runExpiryMonitoringJob();
      logger.info(
        `⏰ Scheduled expiry sweep complete: ${summary.expiredUnitsMarked} units expired, ${summary.alertsCreated} alerts created.`
      );
    } catch (err) {
      logger.error('Error during scheduled expiry sweep:', err);
    }
  }, intervalMs);

  return { intervalHandle, initialTimer };
}

export function stopExpiryCron() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('⏰ Automated expiry monitoring scheduler stopped.');
  }
}


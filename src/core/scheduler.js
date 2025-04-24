import { CronJob } from 'cron';
import { runPredictions } from './main.js'; // Now a sibling
import { updateAllPendingResults, calculateAccuracyStats } from '../data/predictionTracker.js';
import { logger } from '../utils/logger.js';
import { SCHEDULER_CONFIG } from '../utils/config.js';
import { clientInitializationPromise } from '../services/hltvClient.js';

// Variable to hold the initialized client
let hltvClient = null;

// Function to ensure client is initialized before running jobs
const ensureClientInitialized = async () => {
    if (!hltvClient) {
        logger.info('[Scheduler] Initializing HLTV client for scheduled jobs...');
        hltvClient = await clientInitializationPromise; // Await the promise
        logger.info('[Scheduler] HLTV client initialized.');
    }
    if (!hltvClient) {
        throw new Error("Failed to initialize HLTV Client for scheduler.");
    }
};

// Run predictions at the start of each day
const predictionJob = new CronJob(
    SCHEDULER_CONFIG.predictionsCron, // '0 0 * * *' (midnight)
    async () => {
        logger.info('[Scheduler] Starting daily predictions job...');
        try {
            await ensureClientInitialized();
            // Pass the initialized client and set track=true for scheduled runs
            await runPredictions(hltvClient, { track: true });
            logger.info('[Scheduler] Daily predictions completed.');
        } catch (error) {
            logger.error('[Scheduler] Error in daily predictions job:', error);
        }
    },
    null,
    false,
    SCHEDULER_CONFIG.timezone
);

// Update results and calculate stats at the end of each day
const resultsJob = new CronJob(
    SCHEDULER_CONFIG.resultsCron, // '0 23 * * *' (11 PM)
    async () => {
        logger.info('[Scheduler] Starting daily results update job...');
        try {
            await ensureClientInitialized();
            // Pass the initialized client
            await updateAllPendingResults(hltvClient);
            const stats = await calculateAccuracyStats(); // Accuracy calc doesn't need client
            logger.info('[Scheduler] Prediction accuracy stats:', stats);

            // If accuracy drops below threshold, alert via configured method
            const recentAccuracy = stats.week?.accuracy ?? 0; // Use optional chaining
            if (recentAccuracy < SCHEDULER_CONFIG.accuracyAlertThreshold) {
                logger.warn(`[Scheduler] Recent prediction accuracy (${recentAccuracy.toFixed(1)}%) is below threshold (${SCHEDULER_CONFIG.accuracyAlertThreshold}%)`);
            }
        } catch (error) {
            logger.error('[Scheduler] Error in daily results job:', error);
        }
    },
    null,
    false,
    SCHEDULER_CONFIG.timezone
);

// Retry failed predictions periodically during the day
const retryJob = new CronJob(
    SCHEDULER_CONFIG.retryFailedCron, // '0 */4 * * *' (every 4 hours)
    async () => {
        logger.info('[Scheduler] Starting retry job for failed predictions...');
        try {
            await ensureClientInitialized();
            // Pass the initialized client and set track=true, retryFailedOnly=true
            const failedPredictions = await runPredictions(hltvClient, { retryFailedOnly: true, track: true });
            if (failedPredictions && failedPredictions.length > 0) {
                logger.info(`[Scheduler] Retried ${failedPredictions.length} potentially failed predictions`);
            } else {
                logger.info('[Scheduler] No failed predictions found or processed in retry job.');
            }
        } catch (error) {
            logger.error('[Scheduler] Error in retry job:', error);
        }
    },
    null,
    false,
    SCHEDULER_CONFIG.timezone
);

// Modify startScheduler to ensure client is initialized before starting jobs
export const startScheduler = async () => {
    logger.info('[Scheduler] Initializing...');
    try {
        await ensureClientInitialized(); // Initialize client before starting jobs
        logger.info('[Scheduler] Starting prediction scheduler jobs...');
        predictionJob.start();
        resultsJob.start();
        retryJob.start();
        logger.info('[Scheduler] Scheduler started. Waiting for jobs...');
    } catch (error) {
        logger.error('[Scheduler] Failed to initialize client for scheduler. Scheduler not started.', error);
        // Optionally re-throw or handle the error appropriately
        // process.exit(1); // Exit if scheduler can't start?
    }
};

export const stopScheduler = () => {
    logger.info('Stopping prediction scheduler...');
    predictionJob.stop();
    resultsJob.stop();
    retryJob.stop();
    logger.info('Scheduler stopped.');
}; 
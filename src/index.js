import { startScheduler, stopScheduler } from './core/scheduler.js';
import { logger } from './utils/logger.js';
import { clientInitializationPromise } from './services/hltvClient.js'; // Needed for graceful shutdown save

logger.info('Application starting...');

// Ensure client is initialized before starting scheduler
clientInitializationPromise.then(client => {
    logger.info("HLTV Client initialized, starting scheduler.");
    startScheduler(); // Start the cron jobs
}).catch(err => {
    logger.error("Failed to initialize HLTV client on startup. Scheduler not started.", err);
    process.exit(1); // Exit if essential client fails
});

// Graceful shutdown handling
const shutdown = (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    stopScheduler();
    // Client already handles sync save on exit, but ensure it happens before exit
    // We don't need explicit save here as hltvClient exit handler does it.
    logger.info("Scheduler stopped. Exiting application.");
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Catches Ctrl+C

// Global error handlers (optional but recommended)
process.on('uncaughtException', (err, origin) => {
    logger.error(`Uncaught Exception at: ${origin}\nError: ${err.message}\nStack: ${err.stack}`);
    // Attempt graceful shutdown, but force exit if it fails
    try {
        stopScheduler();
        // hltvClient will attempt sync save via its own exit handler
    } finally {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}\nReason: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : 'N/A'}`);
    // Attempt graceful shutdown, but force exit if it fails
    try {
        stopScheduler();
        // hltvClient will attempt sync save via its own exit handler
    } finally {
        process.exit(1);
    }
}); 
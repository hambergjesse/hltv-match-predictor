import { HLTV } from 'hltv';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import fsSync from 'fs'; // Import sync fs for exit handler
import path from 'path';
import { fileURLToPath } from 'url';
import { subDays, isAfter } from 'date-fns';
import { initializeCache as initCacheManager, loadCache as loadCacheData, saveCacheSync as saveCacheDataSync, getFromCache as getCacheValue, updateCache as updateCacheValue } from './cacheManager.js'; // Now a sibling
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if running in test mode globally
const isTestMode = process.argv.includes('--test');

// --- Module State (initialized later) ---
let config;
let limit;
let delayBetweenCalls;
let hltv;
let isInitialized = false;
let cacheManager; // Hold initialized cache manager instance if needed

// --- Initialization Logic ---
const loadAppConfig = async () => {
    // Adjusted path to config.json (now up two levels)
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    const defaultConfig = {
        api: {
            delayBetweenCallsMs: 15000,
            maxConcurrentRequests: 1,
            requestTimeout: 30000,
            retryAttempts: 3,
            retryDelay: 5000,
            transientErrorCodes: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
            transientStatusCodes: [429, 503],
            transientErrorPatterns: [
                'rate limit',
                'timeout',
                'temporarily unavailable',
                'network error',
                'socket hang up'
            ]
        },
        prediction: { // Prediction defaults are primarily used in strengthCalculator
            defaultPlayerRating: 1.0
        },
        cache: {
            dir: 'cache', // Relative to project root
            playerStatsCacheFile: 'playerStatsCache.json',
            saveDebounceMs: 2000
        }
    };

    try {
        const configData = await fs.readFile(configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        const mergedConfig = {
            api: { ...defaultConfig.api, ...(userConfig.api || {}) },
            prediction: { ...defaultConfig.prediction, ...(userConfig.prediction || {}) },
            cache: { ...defaultConfig.cache, ...(userConfig.cache || {}) }
        };
        logger.info('Loaded configuration from config.json');
        return mergedConfig;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('config.json not found, using default configuration.');
        } else {
            logger.error('Error loading config.json:', error);
        }
        return defaultConfig;
    }
};

// Moved initialization into a dedicated async function
const initialize = async () => {
    if (isInitialized) {
        logger.debug("HLTV Client already initialized.");
        return; // Already initialized
    }
    logger.info("Initializing HLTV Client...");
    try {
        config = await loadAppConfig();
        logger.info('HLTV Client Configuration:', config);

        // Initialize Cache Manager with loaded config
        // Assuming initializeCache returns the manager instance or handles it internally
        // We might need to store the instance if its methods are needed directly later
        cacheManager = initCacheManager({ // Renamed import
            ...config.cache, // Pass cache specific config
            testMode: isTestMode
        });

        // Initialize rate limiter using config
        limit = pLimit(config.api.maxConcurrentRequests);
        delayBetweenCalls = config.api.delayBetweenCallsMs;

        // Initialize HLTV client with timeout
        hltv = HLTV.createInstance({
            timeout: config.api.requestTimeout
        });

        // Load initial cache state via cacheManager AFTER initialization
        await loadCacheData(); // Renamed import

        isInitialized = true;
        logger.info('HLTV Client initialized successfully.');

    } catch (err) {
        logger.error("FATAL: Failed to initialize HLTV Client:", err);
        // Exit if core initialization fails - essential components missing
        // Consider if more graceful handling is needed, but basic operation requires init.
        process.exit(1);
    }
};


// --- Helper Functions (using initialized state) ---

// Helper function to determine if an error is transient
const _isTransientError = (error) => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    if (!error) return false;

    // Check error codes
    if (error.code && config.api.transientErrorCodes.includes(error.code)) {
        return true;
    }

    // Check HTTP status codes
    if (error.status && config.api.transientStatusCodes.includes(error.status)) {
        return true;
    }

    // Check error message patterns
    const errorMessage = (error.message || '').toLowerCase();
    return config.api.transientErrorPatterns.some(pattern =>
        pattern && errorMessage.includes(pattern.toLowerCase())
    );
};

// Retryable request wrapper
const _retryableRequest = async (operation, context = '') => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    let lastError;

    for (let attempt = 1; attempt <= config.api.retryAttempts; attempt++) {
        try {
            // Add delay between attempts (except first attempt)
            if (attempt > 1) {
                const delayMs = config.api.retryDelay * attempt;
                logger.debug(`Retry attempt ${attempt} for ${context}. Waiting ${delayMs}ms...`);
                await delay(delayMs);
            }
            // Enforce delay *before* the operation
            if (delayBetweenCalls > 0) {
                 await delay(delayBetweenCalls);
            }
            // Use module-scoped limit (initialized)
            return await limit(() => operation());
        } catch (error) {
            lastError = error;

            if (!_isTransientError(error)) {
                logger.error(`Non-transient error during ${context} (Attempt ${attempt}/${config.api.retryAttempts}):`, error.message);
                throw error; // Don't retry non-transient errors
            }

            logger.warn(`Transient error on attempt ${attempt}/${config.api.retryAttempts} for ${context}:`, error.message);

            // If this was the last attempt, throw the error
            if (attempt === config.api.retryAttempts) {
                logger.error(`All retry attempts failed for ${context}. Last error: ${error.message}`);
                throw error;
            }
        }
    }

    // Should theoretically not be reached if loop completes or throws
    throw lastError || new Error(`Retryable request failed for ${context} after ${config.api.retryAttempts} attempts.`);
};


// --- API Functions (will be part of the resolved client object) ---

const _validateTeamData = (teamData, context = '') => {
    const errorPrefix = context ? `[${context}] ` : '';
    if (!teamData || typeof teamData !== 'object') {
        throw new Error(`${errorPrefix}Invalid team data: not an object`);
    }

    // Check if required fields exist and have valid values
    if (!teamData.id || typeof teamData.id !== 'number') {
        throw new Error(`${errorPrefix}Invalid team data: missing or invalid id`);
    }

    if (!teamData.name || typeof teamData.name !== 'string') {
        throw new Error(`${errorPrefix}Invalid team data: missing or invalid name for ID ${teamData.id}`);
    }

    // Rank can be undefined/null for unranked teams, but if present must be a number
    if (teamData.rank !== undefined && teamData.rank !== null && typeof teamData.rank !== 'number') {
        throw new Error(`${errorPrefix}Invalid team data: invalid rank format for team ${teamData.name} (${teamData.id})`);
    }

    // Players array must exist and be an array
    if (!Array.isArray(teamData.players)) {
        // Allow empty player list? Let's log a warning but not throw.
        logger.warn(`${errorPrefix}Team data for ${teamData.name} (${teamData.id}) has missing or non-array 'players' field.`);
        teamData.players = []; // Default to empty array if missing/invalid
    }

    // Validate each player in the array
    teamData.players.forEach((player, index) => {
        if (!player || typeof player !== 'object') {
            throw new Error(`${errorPrefix}Invalid player data at index ${index} for team ${teamData.name} (${teamData.id}): not an object`);
        }
        if (!player.name || typeof player.name !== 'string') {
            // Attempt to get ID for context if possible
            const playerId = player.id ? ` (ID: ${player.id})` : '';
            throw new Error(`${errorPrefix}Invalid player data at index ${index} for team ${teamData.name} (${teamData.id}): missing or invalid name${playerId}`);
        }
        if (!player.id || typeof player.id !== 'number') {
            throw new Error(`${errorPrefix}Invalid player data at index ${index} for team ${teamData.name} (${teamData.id}): missing or invalid id for player ${player.name}`);
        }
    });

    return true; // Indicate successful validation
};

const fetchTeamDataByName = async (teamName) => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    const context = `fetchTeamDataByName(${teamName})`;
    logger.debug(`[API] ${context}`);
    return await _retryableRequest(async () => {
        logger.debug(`Fetching data for team: ${teamName}`);

        try {
            const teamData = await hltv.getTeamByName({ name: teamName });

            if (!teamData) {
                logger.warn(`No team data found for name: ${teamName}`);
                return null; // Return null if team not found
            }

            // Validate the structure before returning
            _validateTeamData(teamData, context); // Throws on invalid structure

             // Ensure players array exists, default to empty if not (depends on validation logic)
             if (!teamData.players) teamData.players = [];

            // Defensive access example (though validation should catch most issues)
            return {
                id: teamData.id,
                name: teamData.name,
                rank: teamData.rank ?? null, // Use nullish coalescing for rank
                players: teamData.players.map(p => ({
                    id: p.id,
                    name: p.name
                }))
            };
        } catch (error) {
            logger.error(`Error in ${context}: ${error.message}`);
            // Avoid re-throwing transient errors here if already handled by _retryableRequest
             if (!_isTransientError(error)) {
                  // Log non-transient errors specifically related to this operation
                  logger.error(`Non-transient error fetching team data for ${teamName}:`, error);
             }
             return null; // Return null on error to allow main loop to continue
        }
    }, context);
};

const fetchPlayerStatsById = async (playerId, playerName = 'Unknown') => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    const context = `fetchPlayerStatsById(ID: ${playerId}, Name: ${playerName})`;
    logger.debug(`[API] ${context}`);

    // Check cache first using cacheManager
    const cachedData = getCacheValue(playerId); // Use renamed import/cacheManager instance
    if (cachedData) {
        logger.debug(`[Cache] HIT for player ID ${playerId} (${playerName})`);
        return cachedData;
    }
    logger.debug(`[Cache] MISS for player ID ${playerId} (${playerName})`);

    try {
        const stats = await _retryableRequest(() => hltv.getPlayerStats({ id: playerId }), context);

        if (!stats) {
            logger.warn(`No stats found for player ID ${playerId} (${playerName}). Caching null.`);
            updateCacheValue(playerId, null); // Cache null for known misses
            return null;
        }

        // Basic validation (expand as needed)
        if (typeof stats.rating !== 'number' || isNaN(stats.rating)) {
             logger.warn(`Invalid rating found for player ID ${playerId} (${playerName}). Rating: ${stats.rating}. Caching null.`);
             updateCacheValue(playerId, null); // Cache null for invalid data
             return null;
        }

        logger.debug(`[API] Fetched stats for player ID ${playerId} (${playerName}). Rating: ${stats.rating}`);
        updateCacheValue(playerId, stats); // Update cache with valid stats
        return stats;

    } catch (error) {
        // Log specific error details if helpful
        logger.error(`Error in ${context}: ${error.message}. Returning null.`);
        updateCacheValue(playerId, null); // Cache null on error
        return null; // Return null on error after retries
    }
};

const getTodaysMatches = async () => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    const context = 'getTodaysMatches';
    logger.debug(`[API] ${context}`);
    try {
        // Directly use the initialized hltv instance
        const matches = await _retryableRequest(() => hltv.getMatches(), context);
        logger.debug(`[API] Fetched ${matches?.length ?? 0} matches`);
        // TODO: Add validation if needed
        return matches || [];
    } catch (error) {
        // Error already logged in _retryableRequest on final failure
        logger.error(`Failed to get matches after retries.`);
        return []; // Return empty array on failure
    }
};

const getHeadToHeadResults = async (team1Id, team2Id) => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    const context = `getHeadToHeadResults(T1: ${team1Id}, T2: ${team2Id})`;
    logger.debug(`[API] ${context}`);
    try {
        // Directly use the initialized hltv instance
        const results = await _retryableRequest(() => hltv.getResults({ teamIds: [team1Id, team2Id], count: 20 }), context); // Fetch recent H2H
        logger.debug(`[API] Fetched ${results?.length ?? 0} H2H results for ${team1Id} vs ${team2Id}`);

        // Basic validation
        if (!Array.isArray(results)) {
            logger.warn(`Invalid H2H results format received for ${team1Id} vs ${team2Id}. Expected array.`);
            return { team1Wins: 0, team2Wins: 0, totalMatches: 0, recentMatches: [] };
        }

        // Process H2H results (example)
        let team1Wins = 0;
        let team2Wins = 0;
        results.forEach(match => {
            if (match.winnerTeam?.id === team1Id) {
                team1Wins++;
            } else if (match.winnerTeam?.id === team2Id) {
                team2Wins++;
            }
        });

        return {
            team1Wins,
            team2Wins,
            totalMatches: results.length,
            recentMatches: results // Return raw results too
        };

    } catch (error) {
        logger.error(`Failed to get H2H results for ${team1Id} vs ${team2Id} after retries.`);
        return { team1Wins: 0, team2Wins: 0, totalMatches: 0, recentMatches: [] }; // Return default on failure
    }
};

// Utility delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to fetch specific match details (often used for results)
const getMatchDetails = async (matchId) => {
    if (!isInitialized) throw new Error("HLTV Client not initialized."); // Guard clause
    const context = `getMatchDetails(ID: ${matchId})`;
     logger.debug(`[API] ${context}`);
    try {
        // Directly use the initialized hltv instance
        const matchDetails = await _retryableRequest(() => hltv.getMatch({ id: matchId }), context);
        logger.debug(`[API] Fetched details for match ID ${matchId}`);
        // TODO: Add validation
        return matchDetails;
    } catch (error) {
        logger.error(`Failed to get details for match ID ${matchId} after retries.`);
        return null; // Return null on failure
    }
};

// --- Initialization Promise ---
// Create a promise that initializes the client and resolves with the API functions
const clientInitializationPromise = (async () => {
    await initialize(); // Ensure initialization is complete
    // Return the object containing the API functions
    return {
        fetchTeamDataByName,
        fetchPlayerStatsById,
        getTodaysMatches,
        getHeadToHeadResults,
        getMatchDetails,
        // Add other functions intended for external use here
    };
})();

// --- Exports ---
// Export the promise, not the individual functions directly
export { clientInitializationPromise };

// --- Process Exit Handling ---
// Register process exit handler for sync cache save via cacheManager
process.on('exit', (code) => {
    logger.info(`Process exiting with code: ${code}`);
    // Use renamed import/cacheManager instance
    if (isInitialized) { // Only save if initialized
       saveCacheDataSync();
    } else {
        logger.warn("Client not fully initialized, skipping cache save on exit.");
    }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    if (isInitialized) {
       saveCacheDataSync(); // Ensure cache is saved before exiting
    } else {
         logger.warn("Client not fully initialized, skipping cache save on shutdown.");
    }
    process.exit(0); // Exit after potentially saving
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Catches Ctrl+C

// Keep existing uncaughtException/unhandledRejection handlers, but ensure they call saveCacheDataSync()
process.on('uncaughtException', (err, origin) => {
    logger.error(`Uncaught Exception at: ${origin}\nError: ${err.message}\nStack: ${err.stack}\nAttempting synchronous cache save...`);
    if (isInitialized) saveCacheDataSync();
    process.exit(1); // Exit with error code
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Rejection at: ${promise}\nReason: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : 'N/A'}\nAttempting synchronous cache save...`);
    if (isInitialized) saveCacheDataSync();
    process.exit(1); // Exit with error code
}); 
import fs from 'fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js'; // Path updated
import { isBefore, subHours } from 'date-fns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Module State ---
let playerStatsCache = new Map(); // In-memory cache (PlayerID -> Rating/Stats)
let saveCacheTimeout;
let isTestMode = false;
// Adjusted default paths (will be overridden by initializeCache)
let cacheDir = path.join(__dirname, '..', '..', 'cache');
let cacheFile = path.join(cacheDir, 'playerStatsCache.json');
let saveDebounceMs = 2000; // Default debounce time
let cacheInitialized = false;
let cacheExpirationHours = 24; // Default expiration

// --- Initialization ---

/**
 * Initializes the cache manager with configuration settings.
 * Should be called once at application startup before other cache functions.
 * @param {Object} options - Cache configuration object.
 * @param {string} options.dir - Directory for cache files relative to project root.
 * @param {string} options.playerStatsCacheFile - Filename for player stats cache.
 * @param {number} options.saveDebounceMs - Debounce time for saving.
 * @param {boolean} options.testMode - Whether test mode is enabled.
 * @param {number} options.cacheExpirationHours - Cache entry validity duration.
 */
const initializeCache = (options = {}) => {
    if (cacheInitialized) {
        logger.warn('[CacheManager] Already initialized. Ignoring subsequent initialization.');
        return;
    }
    logger.info('[CacheManager] Initializing...', options);
    isTestMode = options.testMode || false;
    // Base path calculation adjusted for new location
    cacheDir = path.join(__dirname, '..', '..', options.dir || 'cache');
    cacheFile = path.join(cacheDir, options.playerStatsCacheFile || 'playerStatsCache.json');
    saveDebounceMs = options.saveDebounceMs || 2000;
    cacheExpirationHours = options.cacheExpirationHours || 24;

    setTestMode(isTestMode); // Apply test mode logic
    cacheInitialized = true;
    logger.info(`[CacheManager] Initialized. Path: ${cacheFile}, Debounce: ${saveDebounceMs}ms, Expiry: ${cacheExpirationHours}h, TestMode: ${isTestMode}`);
};

// --- Cache Operations ---

// Load cache from file
const loadCache = async () => {
    if (!cacheInitialized) throw new Error('[CacheManager] Cache not initialized. Call initializeCache first.');
    if (isTestMode) {
        logger.info('[CacheManager] Test mode enabled, skipping cache load from file.');
        return;
    }
    logger.info(`[CacheManager] Attempting to load cache from ${cacheFile}...`);
    try {
        const data = await fs.readFile(cacheFile, 'utf8');
        const entries = JSON.parse(data);
        // Basic validation - now expect [playerId, { stats, timestamp }]
        if (!Array.isArray(entries) || !entries.every(e => Array.isArray(e) && e.length === 2 && typeof e[0] === 'number' && typeof e[1] === 'object')) {
             logger.error('[CacheManager] Invalid cache file format. Starting with empty cache.');
             playerStatsCache = new Map();
        } else {
            playerStatsCache = new Map(entries);
            logger.info(`[CacheManager] Loaded ${playerStatsCache.size} player stats entries from cache.`);
            // Optionally: Prune expired entries on load
            pruneExpiredCacheEntries();
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('[CacheManager] No cache file found, starting with empty cache');
            playerStatsCache = new Map();
        } else {
            logger.error('[CacheManager] Error loading cache:', error);
            playerStatsCache = new Map(); // Start fresh on other errors
        }
    }
};

// Prune expired entries
const pruneExpiredCacheEntries = () => {
    if (isTestMode || cacheExpirationHours <= 0) return; // No expiry in test mode or if disabled

    const expirationDate = subHours(new Date(), cacheExpirationHours);
    let prunedCount = 0;
    for (const [playerId, cacheEntry] of playerStatsCache.entries()) {
        if (!cacheEntry || !cacheEntry.timestamp || isBefore(new Date(cacheEntry.timestamp), expirationDate)) {
            playerStatsCache.delete(playerId);
            prunedCount++;
        }
    }
    if (prunedCount > 0) {
        logger.info(`[CacheManager] Pruned ${prunedCount} expired entries from cache.`);
        saveCache(); // Save after pruning
    }
}

// Internal function to save cache to file
const _saveCacheToFile = async () => {
    if (!cacheInitialized) return; // Don't save if not initialized
    // Prune before saving to ensure only valid entries are written
    pruneExpiredCacheEntries();
    await fs.mkdir(cacheDir, { recursive: true });
    const entries = Array.from(playerStatsCache.entries());
    await fs.writeFile(cacheFile, JSON.stringify(entries, null, 2));
    logger.info(`[CacheManager] Saved ${entries.length} player stats entries to cache (${cacheFile})`);
};


// Save cache to file (debounced)
const saveCache = async () => {
    if (!cacheInitialized || isTestMode) return;
    if (saveCacheTimeout) {
        clearTimeout(saveCacheTimeout);
    }
    saveCacheTimeout = setTimeout(async () => {
        try {
            await _saveCacheToFile();
        } catch (error) {
            logger.error('[CacheManager] Error saving cache (debounced): ', error);
        }
    }, saveDebounceMs);
};

// Save cache to file (synchronous version for process exit)
const saveCacheSync = () => {
    if (!cacheInitialized || isTestMode) {
        logger.info(`[CacheManager] Sync save skipped (Initialized: ${cacheInitialized}, TestMode: ${isTestMode})`);
        return;
    }
     if (saveCacheTimeout) {
        clearTimeout(saveCacheTimeout);
        logger.info('[CacheManager] Cleared pending debounced save before sync save.');
    }
    logger.info(`[CacheManager] Attempting synchronous save to ${cacheFile}...`);
    try {
        // Prune before sync save as well
        pruneExpiredCacheEntries();
        if (!existsSync(cacheDir)) {
            mkdirSync(cacheDir, { recursive: true });
        }
        const entries = Array.from(playerStatsCache.entries());
        writeFileSync(cacheFile, JSON.stringify(entries, null, 2));
        logger.info(`[CacheManager] Saved ${entries.length} player stats entries to cache (sync)`);
    } catch (error) {
        logger.error('[CacheManager] Error saving cache synchronously:', error);
    }
};

// Get a value from the cache, checking expiry
const getFromCache = (playerId) => {
    if (!cacheInitialized) logger.warn('[CacheManager] Attempted to get from uninitialized cache.');
    const cacheEntry = playerStatsCache.get(playerId);
    if (!cacheEntry) return undefined; // Not found

    // Check expiry if enabled
    if (!isTestMode && cacheExpirationHours > 0 && cacheEntry.timestamp) {
        const expirationDate = subHours(new Date(), cacheExpirationHours);
        if (isBefore(new Date(cacheEntry.timestamp), expirationDate)) {
            logger.debug(`[CacheManager] Cache expired for player ID ${playerId}.`);
            playerStatsCache.delete(playerId); // Delete expired entry
            saveCache(); // Trigger save after deletion
            return undefined;
        }
    }

    return cacheEntry.stats; // Return the actual stats object
};

// Update the cache with stats and timestamp, and trigger debounced save
const updateCache = (playerId, stats) => {
    if (!cacheInitialized) {
        logger.error('[CacheManager] Cannot update uninitialized cache.');
        return;
    }
    const cacheEntry = {
        stats: stats, // Store the actual stats object (or null)
        timestamp: Date.now()
    };
    playerStatsCache.set(playerId, cacheEntry);
    saveCache(); // Trigger debounced save
};

// Set test mode (internal use, called by initializeCache)
const setTestMode = (enabled) => {
    isTestMode = enabled;
    if (isTestMode) {
        playerStatsCache = new Map(); // Clear cache if switching to test mode
        logger.info('[CacheManager] Test mode set. Cache cleared.');
    }
};

// Export necessary functions
export {
    initializeCache,
    loadCache,
    saveCacheSync,
    getFromCache,
    updateCache,
    // Don't export setTestMode or playerStatsCache directly
}; 
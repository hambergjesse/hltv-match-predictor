import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache configuration
export const CACHE_CONFIG = {
    directory: 'cache',
    playerStatsFile: 'playerStatsCache.json',
    expirationTime: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

// API configuration
export const API_CONFIG = {
    // Retry settings
    retryAttempts: 3,
    retryDelay: 5000, // Base delay in ms, will be multiplied by attempt number

    // Rate limiting
    maxConcurrentRequests: 1,
    delayBetweenCalls: 15000, // 15 seconds between calls

    // Cache settings
    cacheDir: './cache',
    playerStatsCacheFile: 'playerStatsCache.json',
    cacheExpirationHours: 24,

    // Mock data settings
    mockDataDir: './src/mockData',
    mockTeamsFile: 'teams.json',
    mockPlayersFile: 'players.json',

    // Request timeouts
    requestTimeout: 30000, // 30 seconds

    // Error classification
    transientErrorCodes: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED'
    ],
    transientStatusCodes: [429, 503],
    transientErrorPatterns: [
        'rate limit',
        'timeout',
        'temporarily unavailable'
    ]
};

// Logging configuration
export const LOG_CONFIG = {
    level: process.env.LOG_LEVEL || 'info',
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    logToFile: true,
    logFile: './logs/hltv-predictor.log'
};

// Prediction model configuration
export const PREDICTION_CONFIG = {
    // Base player rating settings
    player: {
        defaultRating: 0.9,
        minRating: 0.5,
        maxRating: 2.0,
        // Weights for different stats in player rating calculation
        weights: {
            rating: 0.4,      // HLTV 2.0 Rating
            kpr: 0.2,         // Kills per Round
            dpr: 0.1,         // Deaths per Round
            impact: 0.15,     // Impact Rating
            adr: 0.15,        // Average Damage per Round
        },
        // Thresholds for missing data handling
        missingDataThresholds: {
            maxMissingPlayers: 2,     // Max players allowed to use default rating
            minMapsPlayed: 30,        // Minimum maps for reliable stats
            recentActivityDays: 90,   // Consider player inactive if no matches in X days
        },
        // Adjustments for missing data
        missingDataAdjustments: {
            perMissingPlayer: 0.1,    // Reduce confidence per missing player
            inactivePlayer: 0.2,      // Reduce player weight if inactive
            insufficientMaps: 0.15,   // Reduce weight if below min maps
        }
    },
    // Team strength calculation
    team: {
        ratingThreshold: 0.05,        // Threshold for considering ratings effectively equal
        rankNudgeEffect: 0.02,        // Maximum effect of rank difference
        recentFormWeight: 0.3,        // Weight of recent team performance
        rosterChangeThreshold: 2,     // Number of player changes to consider roster significantly different
    },
    // Head-to-head analysis
    h2h: {
        minMatches: 3,               // Minimum matches for H2H consideration
        maxEffect: 0.1,              // Maximum H2H adjustment
        // Time-based decay for H2H results
        decay: {
            recent: 1.0,             // Matches within 30 days
            medium: 0.7,             // Matches within 90 days
            old: 0.4,                // Matches within 180 days
            ancient: 0.1,            // Older matches
        },
        // Roster change handling
        rosterChange: {
            ignoreThreshold: 3,      // Ignore H2H if more than X players changed
            weightReduction: 0.3,     // Reduce H2H weight per player changed
        }
    },
    // Map-specific adjustments
    maps: {
        minMatchesForStats: 5,       // Minimum matches on a map for consideration (player & H2H)
        maxMapEffect: 0.08,          // Maximum effect of map-specific performance on overall rating diff
        mapWeight: 0.3,              // Weight of map-specific adjustment vs overall (0 to 1)
        h2hWeight: 0.6,              // Weight of map H2H vs map player stats (within map adjustment)
        playerStatsWeight: 0.4,      // Weight of map player stats vs map H2H (within map adjustment)
    },
    // Final probability calculation
    probability: {
        scalingFactor: 10,          // Base scaling factor for logistic function
        minProbability: 0.05,       // Minimum probability to assign (prevent 0%)
        maxProbability: 0.95,       // Maximum probability to assign (prevent 100%)
        confidenceThresholds: {
            high: 0.8,              // High confidence threshold
            medium: 0.6,            // Medium confidence threshold
            low: 0.4                // Low confidence threshold
        }
    },
    // Data validation rules
    validation: {
        required: ['id', 'name', 'rank', 'players'],
        player: ['name', 'id', 'role'],
        stats: ['rating', 'maps', 'kpr', 'dpr', 'adr'],
        h2h: ['winner', 'date', 'map', 'score']
    }
};

// Data Quality Configuration
export const DATA_QUALITY_CONFIG = {
    // Thresholds for confidence levels
    thresholds: {
        high: 0.8,    // 80% of expected data points available
        medium: 0.5,  // 50% of expected data points available
        low: 0.3,     // 30% of expected data points available
    },
    // Minimum requirements for different prediction components
    requirements: {
        playerStats: {
            minPlayersWithStats: 3,     // Minimum players needed with any stats
            minPlayersWithDetailed: 2,  // Minimum players needed with detailed stats
            expectedDataPoints: 6,      // Total possible data points per player
        },
        h2h: {
            minTotalMatches: 2,         // Minimum total H2H matches required
            minRecentMatches: 1,        // Minimum recent (within decay period) matches
            minMatchesForMapStats: 2,   // Minimum matches on a specific map
        },
    },
    // Confidence adjustments & Weights
    adjustments: {
        noPlayerStats: 0.4,            // Penalty multiplier if minPlayersWithStats not met
        insufficientDetailedStats: 0.7, // Penalty multiplier if minPlayersWithDetailed not met
        insufficientH2H: 0.6,          // Penalty multiplier for insufficient total H2H
        insufficientRecentH2H: 0.8,    // Penalty multiplier for insufficient recent H2H
        insufficientMapData: 0.9,      // Penalty multiplier for insufficient map H2H
        defaultConfidence: 0.9,        // Base confidence level (applied before penalties)
        lowQualityCap: 0.4            // Maximum confidence if overall quality is 'low'
    },
    weights: {
        playerStats: 0.40, // Overall weight of player stats quality
        h2h: 0.30,         // Overall weight of H2H quality (total + recent)
        mapStats: 0.15,    // Overall weight of map-specific data quality (H2H for now)
        rank: 0.15         // Overall weight of having valid ranks for both teams
    }
};

// Player Stats Configuration
export const PLAYER_STATS_CONFIG = {
    defaultPlayerRating: 0.90, // Default rating when stats are missing
    cacheExpiryHours: 24, // How long to keep player stats in cache
};

// Player Impact Score Configuration
export const PLAYER_IMPACT_CONFIG = {
    // Normalization values for different statistics
    kpr: {
        baseValue: 0.7, // Base KPR (Kills Per Round) to normalize against
        maxMultiplier: 1.5, // Maximum score multiplier for KPR
    },
    headshots: {
        baseValue: 50, // Base headshot percentage to normalize against
        maxMultiplier: 1.3, // Maximum score multiplier for headshots
    },
    roundContribution: {
        baseValue: 70, // Base round contribution percentage to normalize against
        maxMultiplier: 1.3, // Maximum score multiplier for round contribution
    },
    mapsPlayed: {
        baseValue: 50, // Base number of maps to normalize against
        maxMultiplier: 1.2, // Maximum score multiplier for maps played
    },
    deathsPerRound: {
        baseValue: 0.7, // Base DPR (Deaths Per Round) to normalize against
        minMultiplier: 0.5, // Minimum survival score
    },
    // Weights for different aspects in final rating calculation
    weights: {
        fragging: 0.3,    // Raw fragging ability weight
        consistency: 0.2,  // Consistency in performance weight
        impact: 0.3,      // High-impact plays weight
        survival: 0.2,    // Survival and trading weight
    },
    // Rating bounds
    rating: {
        min: 0.5,  // Minimum possible final rating
        max: 2.0,  // Maximum possible final rating
    },
};

// HLTV API interaction configuration
export const HLTV_CONFIG = {
    delayBetweenCalls: 15000, // 15 seconds
    maxRetries: 3,
    retryDelay: 30000, // 30 seconds
    cacheDir: 'cache',
    playerStatsCacheFile: 'cache/playerStatsCache.json'
};

// Prediction model configuration
export const MODEL_CONFIG = {
    defaultPlayerRating: 0.9,
    ratingThreshold: 0.05,
    rankNudgeEffect: 0.02,
    h2hNudgeMaxEffect: 0.05,
    h2hMinMatches: 3,
    probabilityScalingFactor: 10
};

// Scheduler configuration
export const SCHEDULER_CONFIG = {
    predictionsCron: '0 0 * * *',      // Run at midnight (start of day)
    resultsCron: '0 23 * * *',         // Run at 11 PM (end of day)
    retryFailedCron: '0 */4 * * *',    // Run every 4 hours
    timezone: 'UTC',                    // Use UTC for consistency
    accuracyAlertThreshold: 60,         // Alert if weekly accuracy drops below 60%
    maxRetryAttempts: 3,               // Maximum number of retry attempts for failed predictions
    retryDelay: 15 * 60 * 1000,        // 15 minutes between retries
};

// Result tracking configuration
export const RESULT_TRACKING_CONFIG = {
    // How long to keep detailed prediction history
    retentionPeriods: {
        detailed: 90 * 24 * 60 * 60 * 1000,  // 90 days for detailed records
        summary: 365 * 24 * 60 * 60 * 1000,  // 1 year for summary statistics
    },
    // Thresholds for data aggregation
    aggregation: {
        minMatchesForTeamStats: 10,    // Minimum matches needed for team-specific stats
        minMatchesForMapStats: 5,      // Minimum matches needed for map-specific stats
    },
    // Export settings
    export: {
        format: 'json',                // Export format (json/csv)
        directory: join(__dirname, '..', 'data', 'exports'),
        scheduledExport: '0 0 * * 0',  // Weekly export (Sunday at midnight)
    }
}; 
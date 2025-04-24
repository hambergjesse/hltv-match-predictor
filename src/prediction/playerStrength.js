import {
    PLAYER_STATS_CONFIG,
    PLAYER_IMPACT_CONFIG
} from '../utils/config.js'; // Path updated
import { logger } from '../utils/logger.js'; // Path updated

// --- Player-stat based calculation ---

/**
 * Calculate impact score based on multiple advanced statistics
 * @param {Object} stats - Player statistics object from HLTV API
 * @returns {Object | null} - Impact scores and factors, or null if no stats
 */
const calculatePlayerImpactScores = (stats) => {
    if (!stats) return null;

    // Use values from PLAYER_IMPACT_CONFIG
    const cfg = PLAYER_IMPACT_CONFIG;
    const scores = {
        fragging: 0, consistency: 0, impact: 0, survival: 0,
        factorsUsed: { fragging: 0, consistency: 0, impact: 0, survival: 0 },
        dataQualityPoints: 0
    };

    // 1. Fragging (KPR, HSR)
    if (typeof stats.killsPerRound === 'number') {
        scores.fragging += Math.min(stats.killsPerRound / cfg.kpr.baseValue, cfg.kpr.maxMultiplier);
        scores.factorsUsed.fragging++;
        scores.dataQualityPoints++;
    }
    if (typeof stats.headshots === 'number') {
        scores.fragging += Math.min(stats.headshots / cfg.headshots.baseValue, cfg.headshots.maxMultiplier);
        scores.factorsUsed.fragging++;
        scores.dataQualityPoints++;
    }
    if (scores.factorsUsed.fragging > 0) scores.fragging /= scores.factorsUsed.fragging;

    // 2. Consistency (Round Contribution, Maps Played)
    if (typeof stats.roundsContributed === 'number') {
        scores.consistency += Math.min(stats.roundsContributed / cfg.roundContribution.baseValue, cfg.roundContribution.maxMultiplier);
        scores.factorsUsed.consistency++;
        scores.dataQualityPoints++;
    }
    if (typeof stats.mapsPlayed === 'number') {
        scores.consistency += Math.min(stats.mapsPlayed / cfg.mapsPlayed.baseValue, cfg.mapsPlayed.maxMultiplier);
        scores.factorsUsed.consistency++;
        scores.dataQualityPoints++;
    }
    if (scores.factorsUsed.consistency > 0) scores.consistency /= scores.factorsUsed.consistency;

    // 3. Impact (Rating)
    if (typeof stats.rating === 'number') {
        // Assuming rating is already on a comparable scale (e.g., HLTV 2.0)
        scores.impact = stats.rating;
        scores.factorsUsed.impact++;
        scores.dataQualityPoints++;
    }

    // 4. Survival (DPR)
    if (typeof stats.deathsPerRound === 'number') {
        // Higher DPR is worse, so we invert the logic
        scores.survival = Math.max(1 - (stats.deathsPerRound / cfg.deathsPerRound.baseValue), cfg.deathsPerRound.minMultiplier);
        scores.factorsUsed.survival++;
        scores.dataQualityPoints++;
    }

    logger.debug(`Player Impact Scores: ${JSON.stringify(scores)}`);
    return scores;
};

/**
 * Calculates a single weighted player rating based on multiple statistics.
 * @param {Object} stats - Player statistics object from HLTV API.
 * @returns {number} - The calculated weighted rating.
 */
const calculateWeightedPlayerRating = (stats) => {
    if (!stats) {
        logger.debug('No stats provided, returning default rating.');
        return PLAYER_STATS_CONFIG.defaultPlayerRating;
    }

    const impactScores = calculatePlayerImpactScores(stats);
    if (!impactScores) {
        logger.debug('Could not calculate impact scores, returning default rating.');
        return PLAYER_STATS_CONFIG.defaultPlayerRating;
    }

    // Use weights from PLAYER_IMPACT_CONFIG
    const weights = PLAYER_IMPACT_CONFIG.weights;
    let weightedSum = 0;
    let totalWeight = 0;

    Object.entries(weights).forEach(([aspect, weight]) => {
        // Check if the aspect score was calculated (value > 0 or specific check)
        if (impactScores[aspect] !== undefined && impactScores[aspect] !== 0) { // Ensure score exists and is non-zero? Or just exists?
            weightedSum += impactScores[aspect] * weight;
            totalWeight += weight;
        }
    });

    let finalRating = PLAYER_STATS_CONFIG.defaultPlayerRating; // Default if no weights applied
    if (totalWeight > 0) {
        finalRating = weightedSum / totalWeight;
    }

    // Clamp rating within configured bounds
    finalRating = Math.max(PLAYER_IMPACT_CONFIG.rating.min, Math.min(finalRating, PLAYER_IMPACT_CONFIG.rating.max));

    logger.debug(`Calculated Weighted Rating: ${finalRating.toFixed(3)} (Total Weight: ${totalWeight.toFixed(2)})`);
    return finalRating;
};

/**
 * Calculates the average weighted player stats for a list of players.
 * Fetches missing stats using the provided client function.
 * @param {Array<Object>} players - Array of player objects ({ id, name }).
 * @param {Function} fetchPlayerStatsById - Async function to fetch player stats.
 * @param {string|null} mapName - Optional map name for map-specific stats (currently unused).
 * @param {Object} options - Additional options (unused for now).
 * @returns {Promise<{ averageRating: number, playersAnalyzed: number, playersMissingStats: number }>} - Team stats summary.
 */
const calculateAveragePlayerStats = async (players, fetchPlayerStatsById, mapName = null, options = {}) => {
    if (!players || players.length === 0) {
        logger.warn('Cannot calculate average player stats: No players provided.');
        return { averageRating: PLAYER_STATS_CONFIG.defaultPlayerRating, playersAnalyzed: 0, playersMissingStats: 0 };
    }

    let totalRatingSum = 0;
    let playersWithStatsCount = 0;
    let playersMissingStats = 0;

    // Use Promise.allSettled to fetch stats concurrently and handle individual failures
    const statsPromises = players.map(player =>
        fetchPlayerStatsById(player.id, player.name)
            // FetchPlayerStatsById now returns the full stats object or null
            .catch(error => {
                logger.error(`Error fetching stats for ${player.name} (ID: ${player.id}): ${error.message}`);
                return null; // Treat fetch error as missing stats
            })
    );

    const results = await Promise.allSettled(statsPromises);

    results.forEach((result, index) => {
        const playerName = players[index]?.name || 'Unknown Player';
        if (result.status === 'fulfilled') {
            const stats = result.value; // This is the stats object or null

            if (stats && typeof stats.rating === 'number' && !isNaN(stats.rating)) {
                // If stats are present and valid, calculate weighted rating
                 const weightedRating = calculateWeightedPlayerRating(stats);
                 totalRatingSum += weightedRating;
                 playersWithStatsCount++;
                 logger.debug(`Using calculated weighted rating ${weightedRating.toFixed(3)} for ${playerName}`);
            } else {
                // If stats are null or invalid, use default rating
                 totalRatingSum += PLAYER_STATS_CONFIG.defaultPlayerRating;
                 playersMissingStats++;
                 logger.debug(`Using default rating ${PLAYER_STATS_CONFIG.defaultPlayerRating} for ${playerName} (stats null or invalid)`);
            }
        } else {
            // Promise rejected (error during fetchPlayerStatsById already logged)
            logger.warn(`Promise rejected for ${playerName}, using default rating.`);
            totalRatingSum += PLAYER_STATS_CONFIG.defaultPlayerRating;
            playersMissingStats++;
        }
    });

    const totalPlayers = players.length;
    // Calculate average based on total players, using defaults for missing ones
    const averageRating = totalPlayers > 0 ? totalRatingSum / totalPlayers : PLAYER_STATS_CONFIG.defaultPlayerRating;

    logger.info(`Calculated Average Player Stats: Rating=${averageRating.toFixed(3)}, Analyzed=${totalPlayers}, Missing=${playersMissingStats}`);

    return {
        averageRating: averageRating,
        playersAnalyzed: totalPlayers,
        playersMissingStats: playersMissingStats,
        // playersWithStats: playersWithStatsCount // Can include this if needed
    };
};

export {
    calculatePlayerImpactScores,
    calculateWeightedPlayerRating,
    calculateAveragePlayerStats
}; 
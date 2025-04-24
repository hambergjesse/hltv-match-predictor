// import { config } from './hltvClient.js'; // Likely not needed directly
import {
    PREDICTION_CONFIG,
    // PLAYER_STATS_CONFIG, // Moved to playerStrength.js
    // PLAYER_IMPACT_CONFIG, // Moved to playerStrength.js
    // DATA_QUALITY_CONFIG // Moved to confidenceCalculator.js
} from '../utils/config.js'; // Path updated
import { logger } from '../utils/logger.js'; // Path updated
// Import new modules
import { calculateAveragePlayerStats } from './playerStrength.js'; // Sibling
import { calculateConfidenceLevel } from './confidenceCalculator.js'; // Sibling

// Removed: calculatePlayerImpactScores (moved)
// Removed: calculateWeightedPlayerRating (moved)
// Removed: calculateConfidenceLevel (moved)
// Removed: calculateAveragePlayerStats (moved, now imported)

/**
 * Placeholder for analyzing H2H patterns (e.g., streaks, performance on specific maps within H2H).
 * Currently just returns basic win counts.
 * @param {Object} h2hResults - Results object from hltvClient.getHeadToHeadResults
 * @returns {Object} - Analyzed patterns (currently just echoes input)
 */
const analyzeH2HPatterns = (h2hResults) => {
    // TODO: Implement more sophisticated H2H analysis if needed
    // e.g., check for win streaks, decay based on match dates,
    // filter by map if mapName is provided and results include map info.
    // Consider roster changes between past matches and current lineups.

    // For now, just return the basic win counts provided by hltvClient
    if (!h2hResults) {
        return { team1Wins: 0, team2Wins: 0, totalMatches: 0 };
    }
    return h2hResults; // { team1Wins, team2Wins, totalMatches }
};

/**
 * Calculates the base strength of a team based on its players' average stats.
 * @param {Object} teamData - Team data object including players list.
 * @param {Function} fetchPlayerStatsById - Async function to fetch player stats.
 * @param {string|null} mapName - Optional map name.
 * @param {Object} options - Additional options.
 * @returns {Promise<Object>} - Object containing team strength (rating) and player stat metrics.
 */
const calculateTeamStrengthFromPlayers = async (teamData, fetchPlayerStatsById, mapName = null, options = {}) => {
    if (!teamData || !teamData.players) {
        logger.error('Cannot calculate team strength: Invalid team data provided.');
        // Return a default structure indicating failure/missing data
        // Access default rating via PREDICTION_CONFIG
        const defaultRating = PREDICTION_CONFIG?.player?.defaultRating ?? 0.9; // Use nullish coalescing for safety
        return { strength: defaultRating, playersAnalyzed: 0, playersMissingStats: teamData?.players?.length || 0 };
    }

    // Calculate average stats using the imported function
    const playerStatsSummary = await calculateAveragePlayerStats(
        teamData.players,
        fetchPlayerStatsById,
        mapName,
        options
    );

    // Base strength is the average rating for now
    const teamStrength = playerStatsSummary.averageRating;

    logger.info(`Team Strength for ${teamData.name}: ${teamStrength.toFixed(3)} (Based on ${playerStatsSummary.playersAnalyzed - playerStatsSummary.playersMissingStats}/${playerStatsSummary.playersAnalyzed} players)`);

    return {
        strength: teamStrength,
        playersAnalyzed: playerStatsSummary.playersAnalyzed,
        playersMissingStats: playerStatsSummary.playersMissingStats,
        // Include detailedStatsCount if calculateAveragePlayerStats provides it
    };
};

/**
 * Predicts the win probability between two teams.
 * @param {Object} team1Data - Data object for team 1.
 * @param {Object} team2Data - Data object for team 2.
 * @param {Object} client - The HLTV client (real or mock) with fetch methods.
 * @param {string|null} mapName - Optional: Predict for a specific map.
 * @param {Object} options - Additional prediction options.
 * @returns {Promise<Object|null>} - Prediction result object or null on failure.
 */
export const predictWinProbability = async (team1Data, team2Data, client, mapName = null, options = {}) => {
    logger.info(`Predicting win probability: ${team1Data.name} vs ${team2Data.name}${mapName ? ` on ${mapName}` : ''}`);

    try {
        // 1. Calculate base team strength from average player ratings
        const [team1StrengthData, team2StrengthData] = await Promise.all([
            calculateTeamStrengthFromPlayers(team1Data, client.fetchPlayerStatsById, mapName, options),
            calculateTeamStrengthFromPlayers(team2Data, client.fetchPlayerStatsById, mapName, options)
        ]);

        let baseDifference = team1StrengthData.strength - team2StrengthData.strength;
        let effectiveDifference = baseDifference;
        const adjustments = [];

        // --- Data Quality / Confidence Metrics ---
        const confidenceMetrics = {
            totalPlayers: (team1StrengthData.playersAnalyzed || 0) + (team2StrengthData.playersAnalyzed || 0),
            playersWithStats: (team1StrengthData.playersAnalyzed - team1StrengthData.playersMissingStats) + (team2StrengthData.playersAnalyzed - team2StrengthData.playersMissingStats),
            // detailedStatsCount: team1StrengthData.detailedStatsCount + team2StrengthData.detailedStatsCount, // Add if available
            mapNameProvided: !!mapName,
            hasValidRanks: typeof team1Data.rank === 'number' && typeof team2Data.rank === 'number'
            // H2H metrics will be added below
        };

        // 2. Rank Nudge (Tie-breaker)
        const ratingThreshold = PREDICTION_CONFIG.team.ratingThreshold;
        if (Math.abs(baseDifference) < ratingThreshold && confidenceMetrics.hasValidRanks) {
            const rankDifference = team2Data.rank - team1Data.rank; // Lower rank is better
            // Apply nudge proportional to rank difference, capped by config
            const rankNudge = Math.max(-PREDICTION_CONFIG.team.rankNudgeEffect, Math.min(PREDICTION_CONFIG.team.rankNudgeEffect, rankDifference * 0.001)); // Example scaling
            effectiveDifference += rankNudge;
            adjustments.push(`RankNudge: ${rankNudge.toFixed(3)} (Ranks ${team1Data.rank} vs ${team2Data.rank})`);
        } else if (Math.abs(baseDifference) < ratingThreshold) {
             adjustments.push('RankNudge: Skipped (Missing Ranks)');
        }

        // 3. Head-to-Head Nudge
        const h2hConfig = PREDICTION_CONFIG.h2h;
        let h2hNudge = 0;
        try {
            const h2hResults = await client.getHeadToHeadResults(team1Data.id, team2Data.id);
            confidenceMetrics.h2hMatches = h2hResults?.totalMatches || 0;
            // TODO: Add logic for recent H2H matches count here if h2hResults provides dates
            confidenceMetrics.recentH2HMatches = confidenceMetrics.h2hMatches; // Placeholder

            if (h2hResults && h2hResults.totalMatches >= h2hConfig.minMatches) {
                const { team1Wins, team2Wins, totalMatches } = analyzeH2HPatterns(h2hResults);
                if (totalMatches > 0) {
                    const winRateDiff = (team1Wins / totalMatches) - (team2Wins / totalMatches);
                    // Apply nudge proportional to win rate diff, capped
                    h2hNudge = Math.max(-h2hConfig.maxEffect, Math.min(h2hConfig.maxEffect, winRateDiff * h2hConfig.maxEffect * 2)); // Example scaling
                    effectiveDifference += h2hNudge;
                    adjustments.push(`H2HNudge: ${h2hNudge.toFixed(3)} (${team1Wins}-${team2Wins} in ${totalMatches})`);
                }
            } else {
                 adjustments.push(`H2HNudge: Skipped (Matches < ${h2hConfig.minMatches})`);
            }
        } catch (h2hError) {
            logger.error(`Error fetching or processing H2H: ${h2hError.message}`);
            adjustments.push('H2HNudge: Error');
        }

        // 4. Map-Specific Nudge (Placeholder)
        const mapConfig = PREDICTION_CONFIG.maps;
        let mapNudge = 0;
        if (mapName && mapConfig.maxMapEffect > 0) {
            // TODO: Implement map-specific logic
            // - Fetch map-specific H2H (requires modification to getHeadToHeadResults or separate call)
            // - Fetch map-specific player stats (requires modification to fetchPlayerStatsById)
            // - Combine map H2H and player map stats based on mapConfig weights
            // - Calculate mapNudge, capped by mapConfig.maxMapEffect
            // - Add mapNudge to effectiveDifference
            adjustments.push(`MapNudge (${mapName}): Skipped (Not Implemented)`);
            // confidenceMetrics.mapSpecificMatches = ... // Update if map H2H is fetched
        }

        // 5. Calculate Final Probability using Logistic Function
        const scalingFactor = PREDICTION_CONFIG.probability.scalingFactor;
        const team1Prob = 1 / (1 + Math.exp(-scalingFactor * effectiveDifference));

        // Clamp probabilities
        const minProb = PREDICTION_CONFIG.probability.minProbability;
        const maxProb = PREDICTION_CONFIG.probability.maxProbability;
        const clampedTeam1Prob = Math.max(minProb, Math.min(maxProb, team1Prob));
        const clampedTeam2Prob = 1 - clampedTeam1Prob; // Ensure they sum to 1 after clamping T1

        // 6. Calculate Confidence
        const confidenceResult = calculateConfidenceLevel(confidenceMetrics);

        logger.info(`Prediction Result: ${team1Data.name} ${clampedTeam1Prob.toFixed(3)} vs ${team2Data.name} ${clampedTeam2Prob.toFixed(3)}`);
        logger.debug(`BaseDiff: ${baseDifference.toFixed(3)}, EffectiveDiff: ${effectiveDifference.toFixed(3)}, Adjustments: [${adjustments.join('; ')}]`);

        return {
            team1: {
                ...team1Data,
                probability: clampedTeam1Prob
            },
            team2: {
                ...team2Data,
                probability: clampedTeam2Prob
            },
            confidence: confidenceResult.level,
            confidenceFactors: confidenceResult.factors,
            qualityLevel: confidenceResult.qualityLevel,
            details: {
                 baseDifference: baseDifference,
                 effectiveDifference: effectiveDifference,
                 adjustments: adjustments,
                 confidenceMetrics: confidenceMetrics // Include raw metrics for potential analysis
            }
        };

    } catch (error) {
        logger.error(`Error during win probability prediction for ${team1Data.name} vs ${team2Data.name}:`, error);
        return null;
    }
}; 
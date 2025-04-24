import { DATA_QUALITY_CONFIG } from '../utils/config.js'; // Path updated
import { logger } from '../utils/logger.js'; // Path updated

/**
 * Calculates confidence level based on data quality metrics and weights.
 * @param {Object} metrics - Data quality metrics for a specific prediction
 * @param {number} [metrics.totalPlayers=0] - Total players involved (team1 + team2)
 * @param {number} [metrics.playersWithStats=0] - Players with at least basic stats (rating)
 * @param {number} [metrics.detailedStatsCount=0] - Sum of data quality points from player impact scores
 * @param {number} [metrics.h2hMatches=0] - Total H2H matches found
 * @param {number} [metrics.recentH2HMatches=0] - H2H matches within recent decay period
 * @param {number} [metrics.mapSpecificMatches=0] - H2H matches on the specific map (if applicable)
 * @param {boolean} [metrics.mapNameProvided=false] - Whether a specific map was targeted
 * @param {boolean} [metrics.hasValidRanks=false] - Whether both teams had valid rank data
 * @returns {Object} Confidence score object { level: number (0-1), factors: Array<string>, qualityLevel: string }
 */
const calculateConfidenceLevel = (metrics) => {
    const {
        totalPlayers = 0, playersWithStats = 0, detailedStatsCount = 0,
        h2hMatches = 0, recentH2HMatches = 0, mapSpecificMatches = 0,
        mapNameProvided = false, hasValidRanks = false
    } = metrics;

    const Q_CONFIG = DATA_QUALITY_CONFIG; // Shorthand
    let finalConfidence = 1.0; // Start at 100%
    const factors = [];

    // --- Calculate individual quality scores (0 to 1) ---

    // Player Stats Quality
    let playerStatsQuality = 0;
    if (totalPlayers > 0) {
        // Simple ratio for now, could be more complex
        const basicRatio = playersWithStats / totalPlayers;
        // Detailed ratio assumes detailedStatsCount is sum of points across all players
        const maxPossibleDetailedPoints = totalPlayers * (Q_CONFIG.requirements.playerStats.expectedDataPoints || 6);
        const detailedRatio = maxPossibleDetailedPoints > 0 ? detailedStatsCount / maxPossibleDetailedPoints : 0;

        // Weighted average or simpler logic
        playerStatsQuality = (basicRatio * 0.5 + detailedRatio * 0.5);

        // Apply penalties based on minimum requirements
        if (playersWithStats < Q_CONFIG.requirements.playerStats.minPlayersWithStats * 2) { // *2 because totalPlayers is for both teams
            finalConfidence *= Q_CONFIG.adjustments.noPlayerStats;
            factors.push('insufficient_player_stats');
        }
        // Add detailed stats check if configured
        // if (detailedStatsCount < Q_CONFIG.requirements.playerStats.minPlayersWithDetailed * totalPlayers) { ... }
    }

    // H2H Quality
    let h2hQuality = 0;
    if (Q_CONFIG.requirements.h2h.minTotalMatches > 0) {
        const totalMet = h2hMatches >= Q_CONFIG.requirements.h2h.minTotalMatches;
        const recentMet = recentH2HMatches >= Q_CONFIG.requirements.h2h.minRecentMatches;
        // Simple score: 1 if met, 0 otherwise, could be scaled
        h2hQuality = (totalMet ? 0.6 : 0) + (recentMet ? 0.4 : 0);

        // Apply penalties
        if (!totalMet) {
            finalConfidence *= Q_CONFIG.adjustments.insufficientH2H;
            factors.push('insufficient_h2h_matches');
        }
        if (!recentMet && totalMet) { // Only penalize lack of recent if total was met
            finalConfidence *= Q_CONFIG.adjustments.insufficientRecentH2H;
            factors.push('insufficient_recent_h2h');
        }
    }

    // Map Stats Quality
    let mapStatsQuality = 0;
    if (mapNameProvided && Q_CONFIG.requirements.h2h.minMatchesForMapStats > 0) {
        const mapMet = mapSpecificMatches >= Q_CONFIG.requirements.h2h.minMatchesForMapStats;
        mapStatsQuality = mapMet ? 1.0 : 0;

        if (!mapMet) {
            finalConfidence *= Q_CONFIG.adjustments.insufficientMapData;
            factors.push('insufficient_map_data');
        }
        // Future: Factor in player map stats quality here too
    }

    // Rank Quality
    const rankQuality = hasValidRanks ? 1.0 : 0;
    if (!hasValidRanks) {
        factors.push('missing_team_ranks');
        // Optional penalty multiplier for missing ranks
        finalConfidence *= (Q_CONFIG.adjustments.missingRank || 0.95);
    }

    // --- Combine Quality Scores ---
    const totalWeight = Q_CONFIG.weights.playerStats + Q_CONFIG.weights.h2h + Q_CONFIG.weights.mapStats + Q_CONFIG.weights.rank;
    let weightedQualityScore = 0;
    if (totalWeight > 0) {
        weightedQualityScore = (
            playerStatsQuality * Q_CONFIG.weights.playerStats +
            h2hQuality * Q_CONFIG.weights.h2h +
            mapStatsQuality * Q_CONFIG.weights.mapStats +
            rankQuality * Q_CONFIG.weights.rank
        ) / totalWeight;
    } else {
        logger.warn("Total weight for confidence calculation is zero.");
    }

    // --- Determine Quality Level & Final Confidence ---
    let qualityLevel = 'low';
    if (weightedQualityScore >= Q_CONFIG.thresholds.high) {
        qualityLevel = 'high';
    } else if (weightedQualityScore >= Q_CONFIG.thresholds.medium) {
        qualityLevel = 'medium';
    }

    // Apply base confidence and low quality cap
    finalConfidence *= Q_CONFIG.adjustments.defaultConfidence;
    if (qualityLevel === 'low') {
        finalConfidence = Math.min(finalConfidence, Q_CONFIG.adjustments.lowQualityCap);
        if (!factors.includes('low_overall_data_quality')) factors.push('low_overall_data_quality');
    }

    // Ensure confidence is within [0, 1]
    finalConfidence = Math.max(0, Math.min(1, finalConfidence));

    logger.info(`Confidence Score: ${finalConfidence.toFixed(3)}, Quality Level: ${qualityLevel}, Score: ${weightedQualityScore.toFixed(3)}, Factors: [${factors.join(', ') || 'none'}]`);

    return {
        level: finalConfidence,
        factors: factors,
        qualityLevel: qualityLevel
    };
};

export { calculateConfidenceLevel }; 
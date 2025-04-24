import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js'; // Path updated

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjusted path for data directory (now up two levels)
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PREDICTIONS_DIR = path.join(DATA_DIR, 'predictions');

// Ensure data directory exists (arrow function)
const ensureDataDirectory = async () => {
    // Use PREDICTIONS_DIR now as the primary target
    if (!existsSync(PREDICTIONS_DIR)) {
        logger.info(`Creating predictions directory: ${PREDICTIONS_DIR}`);
        await fs.mkdir(PREDICTIONS_DIR, { recursive: true });
    }
};

// Store a new prediction (arrow function)
export const storePrediction = async (prediction) => {
    await ensureDataDirectory();

    // Ensure IDs are present
    if (!prediction?.matchId || !prediction?.team1?.id || !prediction?.team2?.id) {
        logger.error('Cannot store prediction: Missing required IDs (matchId, team1.id, team2.id)', prediction);
        return;
    }

    const predictionData = {
        timestamp: Date.now(),
        matchId: prediction.matchId,
        team1: {
            id: prediction.team1.id,
            name: prediction.team1.name,
            probability: prediction.team1.probability
        },
        team2: {
            id: prediction.team2.id,
            name: prediction.team2.name,
            probability: prediction.team2.probability
        },
        confidence: prediction.confidence,
        status: 'pending', // Initial status
        result: null, // Placeholder for actual result
        correct: null, // Was prediction correct?
        details: prediction.details || {} // Store calculation details
    };

    // Filename based on match ID and timestamp for uniqueness
    const filename = path.join(PREDICTIONS_DIR, `${prediction.matchId}_${predictionData.timestamp}.json`);

    try {
        await fs.writeFile(filename, JSON.stringify(predictionData, null, 2));
        logger.info(`Prediction for match ${prediction.matchId} stored successfully.`);
    } catch (error) {
        logger.error(`Failed to store prediction for match ${prediction.matchId}:`, error);
    }
};

// Update results for all pending predictions (arrow function)
// Modified to accept the initialized client object
export const updateAllPendingResults = async (client) => {
    if (!client) {
        logger.error("HLTV Client object not provided to updateAllPendingResults.");
        throw new Error("updateAllPendingResults requires an initialized client.");
    }

    await ensureDataDirectory(); // Ensure directory exists before reading
    logger.info('Starting update process for pending predictions...');

    let files;
    try {
        files = await fs.readdir(PREDICTIONS_DIR);
    } catch (error) {
         if (error.code === 'ENOENT') {
            logger.info('Predictions directory does not exist, nothing to update.');
            return;
        }
        logger.error('Error reading predictions directory:', error);
        return;
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    logger.info(`Found ${jsonFiles.length} prediction files to check.`);

    let updatedCount = 0;
    let checkedCount = 0;

    for (const file of jsonFiles) {
        const filePath = path.join(PREDICTIONS_DIR, file);
        let predictionData;
        try {
            const content = await fs.readFile(filePath, 'utf8');
            predictionData = JSON.parse(content);
        } catch (readError) {
            logger.error(`Error reading prediction file ${file}:`, readError);
            continue; // Skip this file
        }

        // Check if prediction is pending
        if (predictionData.status === 'pending') {
             checkedCount++;
             logger.debug(`Checking result for pending match ID: ${predictionData.matchId}`);
            try {
                // Use the passed client object to call getMatchDetails
                const matchDetails = await client.getMatchDetails(predictionData.matchId);

                // Check if the match result is available (has a winner)
                if (matchDetails && matchDetails.winner?.id) {
                     logger.info(`Result found for match ID ${predictionData.matchId}. Winner: ${matchDetails.winner.name}`);
                    predictionData.result = {
                        winnerId: matchDetails.winner.id,
                        winnerName: matchDetails.winner.name,
                        scoreT1: matchDetails.team1?.score ?? null,
                        scoreT2: matchDetails.team2?.score ?? null,
                        dateCompleted: matchDetails.date || Date.now() // Use match date or current time
                    };
                    predictionData.status = 'completed';

                    // Determine correctness
                    const predictedWinnerId = predictionData.team1.probability > predictionData.team2.probability
                        ? predictionData.team1.id
                        : predictionData.team2.id;
                    predictionData.correct = (predictedWinnerId === matchDetails.winner.id);
                    logger.info(`Prediction Correct: ${predictionData.correct}`);

                    // Overwrite the prediction file with updated data
                    await fs.writeFile(filePath, JSON.stringify(predictionData, null, 2));
                    updatedCount++;
                } else if (matchDetails) {
                    logger.debug(`Match ID ${predictionData.matchId} details found, but result not final yet.`);
                    // Potentially check match date to see if it should be final
                    // const matchDate = new Date(matchDetails.date);
                    // if (matchDate < Date.now() - SOME_THRESHOLD) { mark as error? }
                } else {
                    logger.warn(`Could not retrieve match details for ID ${predictionData.matchId}. Match might be cancelled or ID invalid.`);
                    // Option: Mark as 'error_fetching_result' or leave pending?
                    // predictionData.status = 'error_fetching_result';
                    // await fs.writeFile(filePath, JSON.stringify(predictionData, null, 2));
                }
            } catch (fetchError) {
                logger.error(`Error fetching result for match ID ${predictionData.matchId}:`, fetchError);
                // Don't update status, retry next time?
            }
        }
    }
    logger.info(`Finished checking ${checkedCount} pending predictions. Updated ${updatedCount} results.`);
};

// Calculate accuracy statistics (arrow function)
export const calculateAccuracyStats = async () => {
    await ensureDataDirectory();
    logger.info('Calculating prediction accuracy statistics...');

    let files;
    try {
        files = await fs.readdir(PREDICTIONS_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.warn('Predictions directory does not exist, cannot calculate stats.');
        } else {
             logger.error('Failed to read predictions directory for stats calculation:', error);
        }
        // Return zeroed stats on error
        return {
            week: { accuracy: 0, count: 0, correct: 0 },
            month: { accuracy: 0, count: 0, correct: 0 },
            year: { accuracy: 0, count: 0, correct: 0 },
            total: { accuracy: 0, count: 0, correct: 0 }
        };
    }

    const now = Date.now();
    const stats = {
        week: { correct: 0, count: 0 },
        month: { correct: 0, count: 0 },
        year: { correct: 0, count: 0 },
        total: { correct: 0, count: 0 }
    };

    for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(PREDICTIONS_DIR, file);
        let prediction;
        try {
            const content = await fs.readFile(filePath, 'utf8');
            prediction = JSON.parse(content);
        } catch (error) {
            logger.error(`Failed to read or parse prediction file ${file} for stats:`, error);
            continue;
        }

        // Only consider completed predictions with a correctness status
        if (prediction.status !== 'completed' || typeof prediction.correct !== 'boolean') {
            continue;
        }

        const predictionTimestamp = prediction.result?.dateCompleted || prediction.timestamp; // Use result date if available
        const age = now - predictionTimestamp;

        // Update total stats
        stats.total.count++;
        if (prediction.correct) stats.total.correct++;

        // Update time-windowed stats
        if (age <= 7 * 24 * 60 * 60 * 1000) { // Last week
            stats.week.count++;
            if (prediction.correct) stats.week.correct++;
        }
        if (age <= 30 * 24 * 60 * 60 * 1000) { // Last month (approx)
            stats.month.count++;
            if (prediction.correct) stats.month.correct++;
        }
        if (age <= 365 * 24 * 60 * 60 * 1000) { // Last year (approx)
            stats.year.count++;
            if (prediction.correct) stats.year.correct++;
        }
    }

    // Helper to calculate accuracy percentage
    const calcAccuracy = (period) => (
        period.count > 0 ? (period.correct / period.count) * 100 : 0
    );

    const finalStats = {
        week: { accuracy: calcAccuracy(stats.week), ...stats.week },
        month: { accuracy: calcAccuracy(stats.month), ...stats.month },
        year: { accuracy: calcAccuracy(stats.year), ...stats.year },
        total: { accuracy: calcAccuracy(stats.total), ...stats.total }
    };

    logger.info('Accuracy Stats Calculated:', finalStats);
    return finalStats;
}; 
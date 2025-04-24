// Import the initialization promise instead
import { clientInitializationPromise } from '../services/hltvClient.js';
import { predictWinProbability } from '../prediction/strengthCalculator.js';
import { storePrediction, updateAllPendingResults } from '../data/predictionTracker.js';
import { logger } from '../utils/logger.js';
// Import mock data and client
import { mockHltvClient } from '../utils/mockData.js';

// Add necessary imports for isMainModule check
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Runs the prediction process.
 * Fetches matches, calculates probabilities, and logs/stores results.
 * This function is designed to be called by the scheduler or manually for dev/test.
 * @param {object} client - The initialized HLTV client object (real or mock).
 * @param {object} options - Options object.
 * @param {boolean} [options.testMode=false] - Whether to run in test mode using mock data.
 * @param {string|null} [options.mapName=null] - Optional map name to predict for.
 * @param {boolean} [options.track=false] - Whether to store predictions using predictionTracker.
 * @param {boolean} [options.updateResults=false] - If true, run result update task instead of predictions.
 * @param {boolean} [options.retryFailedOnly=false] - If true, attempt to predict only previously failed/pending matches (Not fully implemented).
 * @returns {Promise<Array<Object>>} - Array of prediction output objects made in this run.
 */
// Modified to accept the client as a parameter
export const runPredictions = async (client, options = {}) => {
    // Set defaults using object destructuring
    const {
        testMode = false,
        mapName = null,
        track = false, // Tracking defaults to false unless explicitly set (e.g., by scheduler)
        updateResults = false,
        retryFailedOnly = false // TODO: Implement logic to load pending/failed predictions
    } = options;

    logger.info(`--- Running HLTV Match Predictor ---`);
    logger.info(`Test Mode: ${testMode}`);
    logger.info(`Store Predictions (Tracking): ${track}`);
    logger.info(`Update Past Results Task: ${updateResults}`);
    logger.info(`Retry Failed Only: ${retryFailedOnly}`);
    if (mapName) logger.info(`Map Filter: ${mapName}`);
    logger.info('------------------------------------');

    // --- Task Selection ---
    if (updateResults) {
        logger.info('Starting task: Update results for pending predictions...');
        try {
            // Pass the initialized client to updateAllPendingResults
            if (!client) throw new Error("Client is required for updateResults task.");
            await updateAllPendingResults(client);
            logger.info('Finished task: Update pending results.');
        } catch (error) {
            logger.error('Error during pending result update task:', error);
        }
        logger.info('--- Predictor run finished (Update Task Only) ---');
        return []; // Return empty array as no new predictions were made
    }

    // --- Prediction Task (Client is now passed in) ---
    if (!client) {
        logger.error("Client object was not provided to runPredictions.");
        throw new Error("runPredictions requires an initialized client.");
    }

    // TODO: Implement retryFailedOnly logic
    // if (retryFailedOnly) { /* Load pending/failed match IDs from storage */ }

    logger.info('Fetching matches...');
    let matches;
    try {
        matches = await client.getTodaysMatches();
    } catch (error) {
        logger.error('Failed to fetch matches:', error);
        // Ensure matches remains undefined or null on error
        matches = null; // Explicitly set to null to distinguish from empty array
        // The error is logged, now decide how to proceed.
        // Depending on requirements, could re-throw, return, or continue with matches = null.
        // Current logic proceeds, and the check below handles null/empty.
    }

    // Check *after* the try-catch
    if (matches === null) {
        logger.error('Halting prediction run due to fatal error during match fetching.');
        logger.info('--- Predictor run finished (due to fetch error) --- ');
        return []; // Exit run if fetch failed
    } else if (matches.length === 0) {
        logger.info('No matches found for today.'); // Specific message for no matches
        logger.info('--- Predictor run finished --- ');
        return [];
    }

    logger.info(`Found ${matches.length} matches. Processing predictions...`);
    const predictions = [];
    let successCount = 0;
    let failCount = 0;

    for (const match of matches) {
        const team1Name = match.team1Name;
        const team2Name = match.team2Name;
        const matchId = match.id;
        const matchIdentifier = `MatchID ${matchId} (${team1Name || 'N/A'} vs ${team2Name || 'N/A'})`;

        logger.info(`\nProcessing ${matchIdentifier}`);

        if (!team1Name || !team2Name) {
            logger.warn(`Skipping ${matchIdentifier} due to missing team name(s).`);
            failCount++;
            continue;
        }

        let team1Data, team2Data;
        try {
            // Fetch team data concurrently
            [team1Data, team2Data] = await Promise.all([
                client.fetchTeamDataByName(team1Name),
                client.fetchTeamDataByName(team2Name)
            ]);
        } catch (error) {
            logger.error(`Error fetching team data for ${matchIdentifier}:`, error);
            failCount++;
            continue; // Skip to next match
        }

        // Validate fetched data
        if (!team1Data || !team2Data) {
            logger.warn(`Skipping prediction for ${matchIdentifier}: Could not fetch data for one or both teams.`);
            if (!team1Data) logger.debug(`Reason: Failed to fetch data for ${team1Name}`);
            if (!team2Data) logger.debug(`Reason: Failed to fetch data for ${team2Name}`);
            failCount++;
            continue; // Skip to next match
        }

        // Predict win probability
        try {
            const predictionResult = await predictWinProbability(team1Data, team2Data, client, mapName);

            if (predictionResult) {
                 // Format prediction for logging and potential storage
                 const predictionOutput = {
                    matchId: matchId,
                    team1: {
                        id: team1Data.id,
                        name: team1Data.name,
                        probability: predictionResult.team1.probability
                    },
                    team2: {
                        id: team2Data.id,
                        name: team2Data.name,
                        probability: predictionResult.team2.probability
                    },
                    confidence: predictionResult.confidence,
                    details: predictionResult.details // Include raw details like factors, diffs
                 };

                // Log prediction
                logger.info(`Prediction: ${predictionOutput.team1.name} ${(predictionOutput.team1.probability * 100).toFixed(1)}% vs ${predictionOutput.team2.name} ${(predictionOutput.team2.probability * 100).toFixed(1)}% (Confidence: ${predictionOutput.confidence.toFixed(2)})`);
                logger.debug(`Quality: ${predictionResult.qualityLevel}, Factors: ${predictionResult.confidenceFactors.join(', ')}`);

                predictions.push({
                    'Match': `${team1Name} vs ${team2Name}`,
                    'Prediction': `${(predictionResult.team1.probability * 100).toFixed(1)}% - ${(predictionResult.team2.probability * 100).toFixed(1)}%`,
                    'Confidence': predictionResult.confidence.toFixed(2)
                });

                // Store prediction if tracking enabled
                if (track) {
                    await storePrediction(predictionOutput); // Pass the detailed object
                    logger.info(`Stored prediction for ${matchIdentifier}`);
                }
                successCount++;
            } else {
                 logger.error(`Prediction failed for ${matchIdentifier} (predictWinProbability returned null).`);
                 failCount++;
            }
        } catch (predictionError) {
            logger.error(`Unhandled error during prediction for ${matchIdentifier}:`, predictionError);
            failCount++;
        }
    } // End of match loop

    logger.info(`\n--- Prediction Summary ---`);
    if (predictions.length > 0) {
        console.table(predictions);
    } else {
        logger.info('No predictions were generated in this run.');
    }
    logger.info(`Processed: ${matches.length} matches. Successful Predictions: ${successCount}, Failed/Skipped: ${failCount}`);
    logger.info('--- Predictor run finished --- ');

    return predictions; // Return summary array
};

// --- Main Execution (when run directly) ---

// Helper to check if this script is the main module being run
const isMainModule = () => {
    const currentModulePath = fileURLToPath(import.meta.url);
    const mainScriptPath = process.argv[1];
    return path.resolve(currentModulePath) === path.resolve(mainScriptPath);
};

// Self-invoking async function to handle top-level await for client initialization
(async () => {
    if (isMainModule()) {
        logger.info('Running main.js directly...');
        const args = process.argv.slice(2);
        const testMode = args.includes('--test');

        try {
            // Await the client initialization promise
            logger.info('Initializing client...');
            const hltvClient = testMode ? mockHltvClient : await clientInitializationPromise;
            logger.info('Client initialized. Starting predictions...');

            // Pass the initialized client to runPredictions
            await runPredictions(hltvClient, { testMode: testMode, track: false, updateResults: false });

            logger.info('Direct execution of runPredictions completed.');
            // Graceful exit after direct run completes
            process.exit(0); // Explicitly exit with success code
        } catch (error) {
            logger.error('Direct execution failed:', error);
            process.exit(1); // Exit with error code on failure
        }
    }
})(); 
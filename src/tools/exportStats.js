import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js'; // Adjust path as needed
import { RESULT_TRACKING_CONFIG, CACHE_CONFIG, API_CONFIG } from '../config.js'; // Adjust path and import necessary configs

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine base data directory (assuming config might define it, fallback if not)
// Using RESULT_TRACKING_CONFIG or a specific export path from config
const baseDataDir = path.join(__dirname, '..', '..', 'data'); // Adjust based on actual config/structure
const predictionsFile = path.join(baseDataDir, 'predictions.json'); // Assuming this is where predictions are stored
const exportDir = path.join(baseDataDir, 'exports');

async function exportPredictionHistory() {
    logger.info('Starting prediction history export...');

    try {
        // Ensure export directory exists
        await fs.mkdir(exportDir, { recursive: true });
        logger.debug(`Ensured export directory exists: ${exportDir}`);

        // Read prediction data
        let predictions = [];
        try {
            const data = await fs.readFile(predictionsFile, 'utf8');
            predictions = JSON.parse(data);
            logger.info(`Read ${predictions.length} predictions from ${predictionsFile}`);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                logger.warn(`Prediction file not found: ${predictionsFile}. Nothing to export.`);
                return;
            }
            throw readError; // Rethrow other read errors
        }

        if (predictions.length === 0) {
            logger.info('No prediction data found to export.');
            return;
        }

        // Define export filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const exportFilename = `prediction_export_${timestamp}.json`;
        const exportFilePath = path.join(exportDir, exportFilename);

        // Write data to export file
        await fs.writeFile(exportFilePath, JSON.stringify(predictions, null, 2));
        logger.info(`Successfully exported ${predictions.length} predictions to: ${exportFilePath}`);

    } catch (error) {
        logger.error('Failed to export prediction history:', error);
        process.exitCode = 1; // Indicate failure
    }
}

// --- Main Execution ---
exportPredictionHistory(); 
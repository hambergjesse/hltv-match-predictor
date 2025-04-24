# Application Flow

This document describes the data flow and typical execution process of the HLTV Match Predictor, now driven by a scheduler.

## Execution Trigger

*   The application is typically started via `npm start`, which runs `node src/index.js`.
*   `src/index.js` initializes and starts the scheduler (`src/core/scheduler.js`) and sets up graceful shutdown handlers.
*   Manual prediction runs can be triggered using `npm run start:dev` (`node src/core/main.js`) or `npm run start:test` (`node src/core/main.js --test`).

## Scheduled Tasks (`src/core/scheduler.js`)

The scheduler runs three main cron jobs (times configured in `config.json`/`src/utils/config.js`):

1.  **Daily Predictions Job (e.g., Midnight UTC):**
    *   Calls `runPredictions()` from `src/core/main.js` (without test mode, passes initialized client).
    *   Logs start/completion/errors via `src/utils/logger.js`.
2.  **Daily Results Update Job (e.g., 11 PM UTC):**
    *   Calls `updateAllPendingResults()` from `src/data/predictionTracker.js` (passes initialized client).
    *   Calls `calculateAccuracyStats()` from `src/data/predictionTracker.js`.
    *   Logs the accuracy stats.
    *   Logs a warning if accuracy drops below a configured threshold.
3.  **Retry Failed Predictions Job (e.g., Every 4 hours UTC):**
    *   Calls `runPredictions({ retryFailedOnly: true })` (passes initialized client).
    *   Aims to re-process predictions that failed previously (e.g., due to transient API errors).

## Prediction Run (`src/core/main.js - runPredictions`)

This function orchestrates the core prediction logic for a single run (called by scheduler or manually).

1.  **Initialization:**
    *   Receives initialized client (real or mock) as a parameter.
    *   Logs start messages.
    *   Determines if running in Test Mode.
    *   Checks for `retryFailedOnly` flag.
2.  **Fetch Matches:**
    *   **Live Mode:** Calls `client.getTodaysMatches()` (client from `src/services/hltvClient.js`).
    *   **Test Mode:** Uses mock client from `src/utils/mockData.js`.
    *   If no matches, logs and exits the run.
3.  **Process Each Match (Loop):**
    *   Logs match info.
    *   **Fetch Team Data:** Concurrently calls `client.fetchTeamDataByName()` for both teams.
    *   Skips if team data is missing.
    *   **Calculate Win Probability:** Calls `predictWinProbability()` from `src/prediction/strengthCalculator.js`, passing team data and the active client.
4.  **Prediction Calculation (`src/prediction/strengthCalculator.js - predictWinProbability`):**
    *   **Calculate Base Strength:** Calls internal function (`calculateTeamStrengthFromPlayers`) for each team.
        *   This involves `calculateAveragePlayerStats` (from `src/prediction/playerStrength.js`), which loops through players.
        *   Calls `client.fetchPlayerStatsById()` for each player.
        *   `fetchPlayerStatsById` (in `src/services/hltvClient.js`) checks cache (`src/services/cacheManager.js`), handles retries/delays, calls `HLTV.getPlayerStats` or similar, updates cache, and returns stats.
        *   `calculateAveragePlayerStats` uses `PLAYER_IMPACT_CONFIG` and handles defaults (`PLAYER_STATS_CONFIG`).
    *   **Rank Nudge:** Applies adjustment based on rank difference if strength is close (`PREDICTION_CONFIG`).
    *   **H2H Nudge:** Calls `client.getHeadToHeadResults()`, applies adjustments based on results, time decay, and roster changes (`PREDICTION_CONFIG`).
    *   **Map Nudge (Potential):** May apply map-specific adjustments if `mapName` is provided and configured (`PREDICTION_CONFIG`).
    *   **Confidence Calculation:** Calls `calculateConfidenceLevel` (from `src/prediction/confidenceCalculator.js`) using data quality metrics (`DATA_QUALITY_CONFIG`).
    *   **Final Probability:** Calculates win probability using a logistic function (`PREDICTION_CONFIG`).
    *   Returns probability object, including confidence score.
5.  **Store & Log Results (`src/core/main.js`):**
    *   Logs the prediction percentages and confidence.
    *   If tracking is enabled (`track=true`, typically in scheduled runs), calls `storePrediction()` from `src/data/predictionTracker.js` to save the prediction details to a JSON file in `data/predictions/`.
6.  **Final Output (`src/core/main.js`):**
    *   After loop, prints a summary table of predictions made during this run.
    *   Logs finish message.

## Result Update Process (`src/data/predictionTracker.js - updateAllPendingResults`)

1.  Receives initialized client object.
2.  Reads all prediction files from `data/predictions/`.
3.  For each file marked with `status: 'pending'`: 
    *   Calls `client.getMatchDetails()` using the `matchId`.
    *   If match details include a winner:
        *   Updates the prediction file's status to `completed`.
        *   Stores the actual winner, score, and determines if the prediction was `correct`.
        *   Overwrites the prediction file.
    *   Handles cases where results aren't final or details can't be fetched.

## Accuracy Calculation (`src/data/predictionTracker.js - calculateAccuracyStats`)

1.  Reads all prediction files from `data/predictions/`.
2.  Filters for `status: 'completed'` predictions.
3.  Categorizes predictions based on timestamp (last week, last month, total).
4.  Counts total and correct predictions in each category.
5.  Calculates accuracy percentages.
6.  Returns stats object.

## Caching (`src/services/hltvClient.js` & `src/services/cacheManager.js`)

*   **Load:** `hltvClient` initialization triggers `cacheManager` `loadCache`.
*   **Check:** `hltvClient.fetchPlayerStatsById` calls `cacheManager.getFromCache`.
*   **Update:** `hltvClient.fetchPlayerStatsById` calls `cacheManager.updateCache` on successful fetch or error/miss.
*   **Save:** `cacheManager.updateCache` triggers debounced save. `hltvClient` process exit handlers trigger `cacheManager.saveCacheSync`. 
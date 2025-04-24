# Project Requirements

## Core Features Implemented

*   **Automated Scheduling:** Runs predictions and result updates automatically using cron jobs (`src/core/scheduler.js`).
*   **Match Data Fetching:** Retrieves daily match schedules from HLTV (`src/services/hltvClient.js`).
*   **Team Data Fetching:** Retrieves team details: ID, name, rank, player list (`src/services/hltvClient.js`).
*   **Player Data Fetching:** Fetches player statistics (primarily rating, potentially others based on future config) by ID (`src/services/hltvClient.js`).
*   **H2H Data Fetching:** Retrieves head-to-head match history between teams (`src/services/hltvClient.js`).
*   **Detailed Prediction Model:** (`src/prediction/strengthCalculator.js`, `src/prediction/playerStrength.js`, `src/prediction/confidenceCalculator.js`)
    *   Calculates base team strength using weighted player statistics (`PLAYER_IMPACT_CONFIG` in `src/utils/config.js`).
    *   Handles missing player/stat data using defaults (`PLAYER_STATS_CONFIG` in `src/utils/config.js`).
    *   Applies rank nudge as a tie-breaker (`PREDICTION_CONFIG` in `src/utils/config.js`).
    *   Applies H2H nudge with time decay and roster change adjustments (`PREDICTION_CONFIG` in `src/utils/config.js`).
    *   (Foundation exists for map-specific adjustments, controlled by `PREDICTION_CONFIG`).
    *   Calculates final win probability using a logistic function (`PREDICTION_CONFIG` in `src/utils/config.js`).
    *   Calculates prediction confidence based on data quality (`DATA_QUALITY_CONFIG` in `src/utils/config.js`).
*   **Configuration:** Utilizes external `config.json` and internal `src/utils/config.js` for API settings, prediction model parameters, caching, logging, and scheduling.
*   **API Interaction:**
    *   Uses `hltv` library via `src/services/hltvClient.js`.
    *   Implements configurable rate limiting, delays, request timeouts, and retries for transient errors (`config.json`/`src/utils/config.js`).
*   **Caching:** (`src/services/cacheManager.js`)
    *   Persistent file-based caching for player stats by ID (`cache/playerStatsCache.json`).
    *   Asynchronous saving with debounce and synchronous saving on exit (`src/services/hltvClient.js` triggers `cacheManager`).
*   **Prediction Tracking & Accuracy:** (`src/data/predictionTracker.js`)
    *   Stores individual predictions with details and status (`data/predictions/*.json`).
    *   Updates prediction status by fetching actual match results (`client.getMatchDetails` from `src/services/hltvClient.js`).
    *   Calculates and logs prediction accuracy over different time periods (week, month, total).
*   **Output:** Logs prediction results and accuracy statistics to the console (`src/utils/logger.js`).
*   **Test Mode:** Includes a command-line flag (`--test` via `npm run start:test`) to run `src/core/main.js` with mock data.
*   **Error Handling:** Handles API errors (transient vs. non-transient), file I/O errors, and includes graceful shutdown logic (`src/index.js`).
*   **Logging:** Basic logging implemented (`src/utils/logger.js`).

## Potential Future Enhancements

*   **Refine Prediction Model:**
    *   Tune configuration constants based on accuracy tracking.
    *   Fully implement and test map-specific adjustments.
    *   Explore incorporating more player stats or metrics if available and useful.
    *   Investigate team recent form metrics if reliable data can be sourced.
*   **Configuration:**
    *   Allow overriding config values via environment variables.
*   **Robustness & Error Handling:**
    *   Add more granular error handling and reporting.
    *   Implement validation for API response structures.
*   **Output & Usability:**
    *   Add options for structured output (JSON/CSV) via command-line flags or config.
    *   Enhance logging with different levels and potential file rotation.
*   **Testing:**
    *   Expand unit tests for `src/prediction/*`, `src/data/predictionTracker.js`, etc.
    *   Implement integration tests using mock HLTV data for `src/services/hltvClient.js` and the main flow.
*   **Data Management:**
    *   Consider a more robust data store (e.g., SQLite) if prediction volume grows significantly.
    *   Implement archival or cleanup for old prediction files. 
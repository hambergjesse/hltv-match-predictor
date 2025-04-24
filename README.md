# HLTV Match Predictor

This project is a Node.js command-line application designed to predict the outcome (win probability) of professional Counter-Strike matches listed on HLTV.org. It fetches data from HLTV using an unofficial API library, processes it using a custom prediction model, tracks prediction accuracy over time, and runs automatically on a schedule.

## Features

*   **Daily Match Prediction:** Automatically fetches matches scheduled for the current day from HLTV.
*   **Hybrid Prediction Model:** Calculates win probabilities based on:
    *   Average player Rating 2.0 (with caching).
    *   Official HLTV team rank (as a tie-breaker).
    *   Recent Head-to-Head (H2H) results.
*   **Result Tracking & Accuracy:**
    *   Stores predictions and fetches actual match results after completion.
    *   Calculates prediction accuracy over various timeframes (Week, Month, All Time).
    *   Displays accuracy statistics.
*   **Scheduled Operation:**
    *   Runs predictions automatically at the start of the day (configurable cron schedule).
    *   Updates results and calculates accuracy at the end of the day (configurable cron schedule).
    *   Periodically retries fetching data for any initially failed predictions.
*   **Robust API Interaction:**
    *   Uses the `hltv` library.
    *   Implements configurable rate limiting and delays to avoid API bans.
    *   Persistent file-based caching for player statistics to minimize redundant API calls.
*   **Configuration:** Most operational parameters (API delays, prediction constants, cache settings, cron schedules, logging level) are configurable via `src/utils/config.js`.
*   **Logging:** Configurable logging levels (error, warn, info, debug).
*   **Multiple Run Modes:**
    *   **Production (`npm start`):** Runs the scheduler for automated daily operation.
    *   **Development (`npm run start:dev`):** Runs the prediction process once immediately for development.
    *   **Test (`npm run start:test`):** Runs the prediction process once using mock data, avoiding live API calls.
*   **Graceful Shutdown:** Handles termination signals (SIGINT, SIGTERM) to stop the scheduler cleanly.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd hltv-match-predictor
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Usage

*   **Run in Production Mode (Automated Daily Schedule):**
    ```bash
    npm start
    ```
    This will start the scheduler, which runs prediction and result-checking jobs based on the cron schedules defined in `src/utils/config.js`.

*   **Run Once for Development (Uses Live API):**
    ```bash
    npm run start:dev
    ```
    This runs the prediction process immediately (using `src/core/main.js`) for today's matches and then exits.

*   **Run Once with Mock Data (No Live API Calls for Matches):**
    ```bash
    npm run start:test
    ```
    This runs the prediction process immediately (using `src/core/main.js --test`) with mock data defined in `src/utils/mockData.js` and then exits.

*   **Export Statistics (Future Feature):**
    ```bash
    npm run export
    ```
    *(Note: The script `src/tools/exportStats.js` needs to be implemented)*

## Configuration

Key configuration settings can be modified in `src/utils/config.js`:

*   `CACHE_CONFIG`: Cache directory, filename, expiration.
*   `API_CONFIG`: API call delays, concurrency, retries.
*   `LOG_CONFIG`: Logging level (`error`, `warn`, `info`, `debug`).
*   `PREDICTION_CONFIG`: Model parameters (default rating, thresholds, nudges, scaling), data directories.
*   `SCHEDULER_CONFIG`: Cron patterns for prediction/result jobs, timezone, accuracy alert threshold.
*   `RESULT_TRACKING_CONFIG`: Data retention periods, aggregation thresholds, export settings.

## Technology Stack

*   **Runtime:** Node.js (>= v18.0.0)
*   **Core Libraries:**
    *   `hltv`: For interacting with the HLTV API.
    *   `p-limit`: For API rate limiting.
    *   `cron`: For scheduling tasks.
    *   `date-fns`, `date-fns-tz`: For date/time manipulation.
*   **Development:** npm

## Future Considerations

Potential ideas include:
*   Refining the prediction model with more detailed stats.
*   Adding map-specific prediction logic.
*   Implementing the `exportStats.js` tool.
*   Adding more robust error handling and retries.
*   Implementing unit and integration tests.

## Directory Structure

```
src/
├── index.js                  # Main application entry point (production)
├── core/                     # Core application flow and orchestration
│   ├── main.js               # Handles a single prediction run
│   └── scheduler.js          # Cron job scheduling
├── services/                 # External services interaction (API, Cache)
│   ├── hltvClient.js         # HLTV API interaction, facade
│   └── cacheManager.js       # Caching implementation details
├── prediction/               # Prediction calculation logic
│   ├── strengthCalculator.js # Orchestrates prediction steps
│   ├── playerStrength.js     # Calculates weighted player stats
│   └── confidenceCalculator.js # Calculates prediction confidence
├── data/                     # Data persistence and management
│   └── predictionTracker.js  # Storing/updating prediction results
├── utils/                    # Shared utilities, helpers, config
│   ├── config.js             # Configuration loading and management
│   ├── logger.js             # Logging utility
│   ├── utils.js              # General utility functions (e.g., delay)
│   └── mockData.js           # Mock client/data for testing
├── tools/                    # Standalone utility scripts
│   └── exportStats.js
└── __tests__/                # Unit/integration tests (Existing)
    └── ...
```

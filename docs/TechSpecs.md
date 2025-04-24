# Technical Specifications

## Runtime Environment

- **Node.js:** Version 18.0.0 or higher (as specified in `package.json`).
- **Module System:** ES Modules (`"type": "module"` in `package.json`).

## Core Dependencies (`package.json`)

- **`hltv` (`^3.5.0`):** Primary library for interacting with the unofficial HLTV API.
- **`p-limit` (`^5.0.0`):** Controls concurrency for API calls.
- **`cron` (`^3.1.0`):** Used for scheduling tasks (`src/scheduler.js`).
- **`date-fns` (`^2.30.0`):** Utility functions for date manipulation (used in `hltvClient.js`).
- **`date-fns-tz` (`^2.0.0`):** Timezone support for date-fns (used in `scheduler.js`).
- **Node.js Built-ins:** `fs/promises`, `path`, `url` (for file system operations, path manipulation).

## Development Dependencies (`package.json`)

- **`jest` (`^29.7.0`):** Testing framework.
- **`@jest/globals` (`^29.7.0`):** Jest global variables.

## Architecture & Key Components

- **Main Entry Point:** `src/index.js` (initializes scheduler and handles shutdown).
- **Scheduler:** `src/scheduler.js` (manages cron jobs for predictions, result updates, retries).
- **Core Prediction Runner:** `src/main.js` (orchestrates fetching and prediction for a single run, used by scheduler and test script).
- **HLTV API Client:** `src/hltvClient.js` (handles all API communication, rate limiting, retries, caching).
- **Prediction Logic:** `src/strengthCalculator.js` (calculates player/team strength, applies nudges, confidence).
- **Prediction Tracking:** `src/predictionTracker.js` (stores predictions, fetches results, calculates accuracy).
- **Configuration:**
  *   `config.json`: User-configurable parameters (API keys if needed, timings, etc.).
  *   `src/config.js`: Default configuration values, structured access to config objects.
- **Logging:** `src/logger.js` (basic console and file logging).
- **Utilities:** `src/utils.js`.
- **Caching:** Filesystem-based cache for player stats (`cache/playerStatsCache.json`).
- **Data Storage:** Filesystem-based storage for individual predictions (`data/predictions/*.json`).

## Coding Standards

- JavaScript with ES Modules.
- Asynchronous operations handled with `async`/`await`.
- Modular design with separation of concerns.
- Configuration driven where appropriate. 
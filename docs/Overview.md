# Project Overview

This project is a Node.js command-line application designed to predict the outcome (win probability) of professional Counter-Strike matches listed on HLTV.org. It operates automatically via a scheduler, fetching data from HLTV using an unofficial API library, applying a configurable prediction model, storing predictions, and tracking accuracy over time.

## Goals

*   To provide automated, scheduled predictions for upcoming or current HLTV matches.
*   To develop and refine a configurable prediction model that considers multiple factors:
    *   Detailed player statistics and impact scores.
    *   Team rankings.
    *   Head-to-Head (H2H) history with time decay and roster change adjustments.
    *   (Potentially) Map-specific performance.
*   To interact with the HLTV API responsibly using rate limiting, delays, and retries.
*   To maintain a structured, configurable, and testable codebase.
*   To track prediction accuracy over time to evaluate and tune the model.

## Problem Solved

Provides automated, data-driven predictions for CS matches listed on HLTV. The application manages data fetching, calculation, result storage, and accuracy tracking, offering insights based on a configurable model using publicly available HLTV data. 
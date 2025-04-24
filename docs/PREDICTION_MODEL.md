# HLTV Match Prediction Model

This document describes the prediction model used to calculate win probabilities for CS:GO matches based on team and player statistics from HLTV.

## Overview

The prediction model combines multiple factors to calculate win probabilities:
1. Player-based team strength
2. Team rankings
3. Head-to-head history
4. Map-specific performance

Each component has associated confidence levels and fallback strategies when data is incomplete or unavailable.

## Components

### 1. Player-Based Team Strength

#### Data Points
For each player, we collect and analyze:
- Kills Per Round (KPR)
- Headshot Percentage
- Round Contribution
- Maps Played
- Overall Rating
- Deaths Per Round (DPR)

#### Impact Score Calculation
Player impact is calculated across four dimensions:
```typescript
{
    fragging: number,     // Raw fragging ability (KPR, HS%)
    consistency: number,  // Performance consistency (Round contribution, Maps)
    impact: number,      // High-impact plays (Rating)
    survival: number,    // Trading potential (DPR)
}
```

Each dimension is normalized using configurable base values and multipliers from `PLAYER_IMPACT_CONFIG`.

#### Data Quality Tracking
- Each available statistic contributes to a `dataQuality` score
- Quality thresholds defined in `DATA_QUALITY_CONFIG`:
  - High: 80% of expected data points
  - Medium: 50% of expected data points
  - Low: 30% of expected data points

#### Fallback Strategy
1. If detailed stats unavailable, use basic rating
2. If no stats available, use `defaultPlayerRating`
3. Confidence adjusted based on data completeness

### 2. Head-to-Head Analysis

#### Recent Form
- Analyzes last N matches (configurable)
- Applies decay factor to older results
- Considers match importance (Major, Premier, etc.)

#### Map-Specific Analysis
- Tracks performance on specific maps
- Combines historical win rate with recent form
- Requires minimum number of matches for consideration

#### Confidence Levels
- Based on:
  - Number of total matches
  - Recency of matches
  - Match importance distribution
  - Data completeness

### 3. Final Probability Calculation

The model combines these factors using a weighted approach:

1. **Base Strength Difference**
   ```
   effectiveDifference = team1Strength - team2Strength
   ```

2. **Rank Adjustment**
   - Applied when strength difference is within `ratingThreshold`
   - Magnitude controlled by `rankNudgeEffect`

3. **H2H Adjustment**
   ```
   h2hNudge = (recentFormNudge * recentWeight + historicalNudge * historicalWeight) * maxEffect
   ```

4. **Map-Specific Adjustment**
   ```
   mapNudge = (recentMapPerformance * mapRecentWeight + mapHistoricalNudge * mapHistoricalWeight) * maxMapEffect
   ```

5. **Final Probability**
   ```
   finalDifference = effectiveDifference + h2hNudge + mapNudge
   team1WinProb = 1 / (1 + Math.exp(-probabilityScalingFactor * finalDifference))
   ```

### 4. Confidence Scoring

Overall prediction confidence is calculated based on:
1. Data quality of player statistics
2. Availability and recency of H2H data
3. Map-specific data quality
4. Team ranking validity

## Configuration

All model parameters are configurable through:
- `PLAYER_IMPACT_CONFIG`: Player statistics normalization
- `PREDICTION_CONFIG`: Core prediction parameters
- `DATA_QUALITY_CONFIG`: Quality thresholds and requirements

## Fallback Strategies

The model implements several fallback strategies when data is incomplete:

1. **Player Stats**
   - Missing detailed stats → Use basic rating
   - No stats → Use default rating
   - Adjust confidence accordingly

2. **H2H Analysis**
   - Insufficient matches → Skip H2H adjustment
   - Missing map data → Skip map-specific adjustment
   - Recent matches only → Higher weight on recent form

3. **Map-Specific**
   - No map history → Use overall H2H
   - Limited map data → Reduce map effect weight
   - Recent map data only → Increase recency weight

4. **Team Ranking**
   - Invalid ranks → Skip rank adjustment
   - Equal ranks → Use pure strength comparison

## Usage Guidelines

1. **Data Quality Assessment**
   - Check `dataQuality` scores in player calculations
   - Monitor confidence levels in final prediction
   - Consider prediction reliability based on available data

2. **Interpretation**
   - Consider confidence scores alongside probabilities
   - Account for data completeness in decision-making
   - Use map-specific predictions when available

3. **Monitoring and Tuning**
   - Track prediction accuracy against actual results
   - Adjust configuration parameters based on performance
   - Monitor fallback strategy effectiveness

## Future Improvements

1. **Enhanced Data Collection**
   - Player role-specific statistics
   - Team playstyle analysis
   - Map pick/ban patterns

2. **Model Refinements**
   - Dynamic weight adjustment
   - Machine learning integration
   - Form trend analysis

3. **Quality Improvements**
   - Additional data validation
   - More sophisticated fallback strategies
   - Confidence calculation refinements 
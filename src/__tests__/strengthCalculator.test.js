import { jest } from '@jest/globals';
import {
    predictWinnerByRank,
    calculatePlayerImpactScores,
    calculateWeightedPlayerRating,
    analyzeH2HPatterns,
    calculateAveragePlayerStats,
    predictWinProbability
} from '../strengthCalculator.js';
import { PLAYER_IMPACT_CONFIG, PLAYER_STATS_CONFIG, PREDICTION_CONFIG } from '../config.js';

// Mock the external dependencies
jest.mock('../hltvClient.js', () => ({
    fetchPlayerStatsByName: jest.fn(),
    getHeadToHeadResults: jest.fn()
}));

describe('strengthCalculator', () => {
    describe('predictWinnerByRank', () => {
        it('should predict winner based on lower rank', () => {
            const team1 = { name: 'Team1', rank: 1 };
            const team2 = { name: 'Team2', rank: 2 };
            expect(predictWinnerByRank(team1, team2)).toBe('Team1');
            expect(predictWinnerByRank(team2, team1)).toBe('Team1');
        });

        it('should return null for equal ranks', () => {
            const team1 = { name: 'Team1', rank: 1 };
            const team2 = { name: 'Team2', rank: 1 };
            expect(predictWinnerByRank(team1, team2)).toBeNull();
        });

        it('should handle missing ranks', () => {
            const team1 = { name: 'Team1', rank: 1 };
            const team2 = { name: 'Team2' };
            expect(predictWinnerByRank(team1, team2)).toBe('Team1');
            expect(predictWinnerByRank(team2, team1)).toBe('Team1');
        });
    });

    describe('calculatePlayerImpactScores', () => {
        it('should calculate impact scores with complete stats', () => {
            const stats = {
                killsPerRound: 0.7,
                headshots: 50,
                roundsContributed: 70,
                mapsPlayed: 50,
                rating: 1.15,
                deathsPerRound: 0.7
            };

            const scores = calculatePlayerImpactScores(stats);
            
            expect(scores).toMatchObject({
                fragging: expect.any(Number),
                consistency: expect.any(Number),
                impact: expect.any(Number),
                survival: expect.any(Number),
                factorsUsed: expect.arrayContaining(['KPR', 'HS%', 'Rating', 'DPR']),
                dataQuality: 6
            });

            // Verify scores are within bounds
            expect(scores.fragging).toBeLessThanOrEqual(PLAYER_IMPACT_CONFIG.kpr.maxMultiplier);
            expect(scores.consistency).toBeLessThanOrEqual(PLAYER_IMPACT_CONFIG.roundContribution.maxMultiplier);
            expect(scores.survival).toBeGreaterThanOrEqual(PLAYER_IMPACT_CONFIG.deathsPerRound.minMultiplier);
        });

        it('should handle missing stats gracefully', () => {
            const stats = {
                rating: 1.15,
                mapsPlayed: 50
            };

            const scores = calculatePlayerImpactScores(stats);
            
            expect(scores.factorsUsed).toEqual(['MapsPlayed', 'Rating']);
            expect(scores.dataQuality).toBe(2);
            expect(scores.fragging).toBe(0);
            expect(scores.survival).toBe(0);
        });

        it('should return null for null input', () => {
            expect(calculatePlayerImpactScores(null)).toBeNull();
        });
    });

    describe('calculateWeightedPlayerRating', () => {
        it('should calculate weighted rating with complete stats', () => {
            const stats = {
                killsPerRound: 0.7,
                headshots: 50,
                roundsContributed: 70,
                mapsPlayed: 50,
                rating: 1.15,
                deathsPerRound: 0.7
            };

            const result = calculateWeightedPlayerRating(stats);
            
            expect(result).toMatchObject({
                rating: expect.any(Number),
                dataQuality: expect.any(Number)
            });

            expect(result.rating).toBeGreaterThanOrEqual(PLAYER_IMPACT_CONFIG.rating.min);
            expect(result.rating).toBeLessThanOrEqual(PLAYER_IMPACT_CONFIG.rating.max);
            expect(result.dataQuality).toBe(6);
        });

        it('should return default rating for null input', () => {
            const result = calculateWeightedPlayerRating(null);
            expect(result).toEqual({
                rating: PLAYER_STATS_CONFIG.defaultPlayerRating,
                dataQuality: 0
            });
        });

        it('should handle partial stats', () => {
            const stats = {
                rating: 1.15,
                mapsPlayed: 50
            };

            const result = calculateWeightedPlayerRating(stats);
            expect(result.rating).toBeGreaterThanOrEqual(PLAYER_IMPACT_CONFIG.rating.min);
            expect(result.dataQuality).toBe(2);
        });
    });

    describe('analyzeH2HPatterns', () => {
        const mockH2HResults = {
            team1Id: 1,
            team2Id: 2,
            matches: [
                {
                    winner: 1,
                    map: 'Inferno',
                    event: 'Major',
                    score: '16-14',
                    date: new Date()
                },
                {
                    winner: 2,
                    map: 'Inferno',
                    event: 'Premier',
                    score: '16-13',
                    date: new Date(Date.now() - 86400000)
                },
                {
                    winner: 1,
                    map: 'Mirage',
                    event: 'ESL Pro League',
                    score: '16-10',
                    date: new Date(Date.now() - 172800000)
                }
            ]
        };

        it('should analyze H2H patterns correctly', () => {
            const analysis = analyzeH2HPatterns(mockH2HResults);
            
            expect(analysis).toMatchObject({
                recentForm: {
                    team1LastThree: expect.any(Number),
                    team2LastThree: expect.any(Number),
                    matchesConsidered: 3
                },
                eventImportance: {
                    bigEvents: 3,
                    totalEvents: 3
                },
                averageScore: {
                    team1: expect.any(Number),
                    team2: expect.any(Number),
                    totalMaps: 3
                }
            });

            // Verify map patterns
            expect(analysis.mapPatterns.get('Inferno')).toMatchObject({
                total: 2,
                team1Wins: 1,
                team2Wins: 1,
                recentMatches: expect.any(Array)
            });
        });

        it('should handle empty results', () => {
            expect(analyzeH2HPatterns(null)).toBeNull();
            expect(analyzeH2HPatterns({ matches: [] })).toBeNull();
        });

        it('should apply correct decay to recent form', () => {
            const analysis = analyzeH2HPatterns(mockH2HResults);
            
            // First match should have highest weight
            expect(analysis.recentForm.team1LastThree).toBeGreaterThan(analysis.recentForm.team2LastThree);
        });
    });

    describe('predictWinProbability', () => {
        const mockTeam1 = {
            id: 1,
            name: 'Team1',
            rank: 1,
            players: [
                { name: 'player1', role: 'AWP' },
                { name: 'player2', role: 'IGL' },
                { name: 'player3', role: 'Rifler' },
                { name: 'player4', role: 'Support' },
                { name: 'player5', role: 'Entry' }
            ]
        };

        const mockTeam2 = {
            id: 2,
            name: 'Team2',
            rank: 2,
            players: [
                { name: 'player6', role: 'AWP' },
                { name: 'player7', role: 'IGL' },
                { name: 'player8', role: 'Rifler' },
                { name: 'player9', role: 'Support' },
                { name: 'player10', role: 'Entry' }
            ]
        };

        const mockPlayerStats = {
            killsPerRound: 0.7,
            headshots: 50,
            roundsContributed: 70,
            mapsPlayed: 50,
            rating: 1.15,
            deathsPerRound: 0.7
        };

        const mockH2HResults = {
            team1Id: 1,
            team2Id: 2,
            totalMatches: 5,
            team1Wins: 3,
            matches: [
                {
                    winner: 1,
                    map: 'Inferno',
                    event: 'Major',
                    score: '16-14',
                    date: new Date()
                },
                {
                    winner: 2,
                    map: 'Inferno',
                    event: 'Premier',
                    score: '16-13',
                    date: new Date(Date.now() - 86400000)
                },
                {
                    winner: 1,
                    map: 'Mirage',
                    event: 'ESL Pro League',
                    score: '16-10',
                    date: new Date(Date.now() - 172800000)
                },
                {
                    winner: 1,
                    map: 'Inferno',
                    event: 'Regular',
                    score: '16-12',
                    date: new Date(Date.now() - 259200000)
                },
                {
                    winner: 2,
                    map: 'Mirage',
                    event: 'Regular',
                    score: '16-11',
                    date: new Date(Date.now() - 345600000)
                }
            ]
        };

        beforeEach(() => {
            // Reset mocks before each test
            jest.clearAllMocks();
            
            // Setup default mock implementations
            const { fetchPlayerStatsByName, getHeadToHeadResults } = jest.requireMock('../hltvClient.js');
            
            fetchPlayerStatsByName.mockImplementation(async () => mockPlayerStats);
            getHeadToHeadResults.mockImplementation(async () => mockH2HResults);
        });

        it('should predict without map consideration', async () => {
            const result = await predictWinProbability(mockTeam1, mockTeam2);
            
            expect(result).toMatchObject({
                team1Name: mockTeam1.name,
                team2Name: mockTeam2.name,
                team1WinProb: expect.any(Number),
                team2WinProb: expect.any(Number),
                analysis: expect.any(Object)
            });

            expect(result.team1WinProb + result.team2WinProb).toBeCloseTo(1, 5);
            expect(result.analysis.comparison.mapEffect).toBe(0);
            expect(result.analysis.comparison.map).toBeNull();
        });

        it('should consider map-specific performance when map is provided', async () => {
            const result = await predictWinProbability(mockTeam1, mockTeam2, 'Inferno');
            
            expect(result.analysis.comparison.map).toBe('Inferno');
            expect(result.analysis.comparison.mapEffect).not.toBe(0);
            
            // Team1 has better recent performance on Inferno (2 wins, 1 loss)
            expect(result.team1WinProb).toBeGreaterThan(0.5);
        });

        it('should handle maps with insufficient data', async () => {
            const result = await predictWinProbability(mockTeam1, mockTeam2, 'Nuke');
            
            expect(result.analysis.comparison.map).toBe('Nuke');
            expect(result.analysis.comparison.mapEffect).toBe(0);
        });

        it('should weigh recent map performance more heavily', async () => {
            // Create a scenario where historical performance is good but recent is bad
            const recentBadH2H = {
                ...mockH2HResults,
                matches: [
                    // Recent losses on Dust2
                    {
                        winner: 2,
                        map: 'Dust2',
                        event: 'Major',
                        score: '16-14',
                        date: new Date()
                    },
                    {
                        winner: 2,
                        map: 'Dust2',
                        event: 'Premier',
                        score: '16-13',
                        date: new Date(Date.now() - 86400000)
                    },
                    // Historical wins on Dust2
                    {
                        winner: 1,
                        map: 'Dust2',
                        event: 'Regular',
                        score: '16-12',
                        date: new Date(Date.now() - 2592000000)
                    },
                    {
                        winner: 1,
                        map: 'Dust2',
                        event: 'Regular',
                        score: '16-11',
                        date: new Date(Date.now() - 3456000000)
                    },
                    {
                        winner: 1,
                        map: 'Dust2',
                        event: 'Regular',
                        score: '16-10',
                        date: new Date(Date.now() - 4320000000)
                    }
                ]
            };

            const { getHeadToHeadResults } = jest.requireMock('../hltvClient.js');
            getHeadToHeadResults.mockImplementation(async () => recentBadH2H);

            const result = await predictWinProbability(mockTeam1, mockTeam2, 'Dust2');
            
            // Despite having more total wins (3-2), recent losses should make team1's probability lower
            expect(result.team1WinProb).toBeLessThan(0.5);
        });
    });

    describe('Data Quality and Confidence', () => {
        describe('calculateConfidenceLevel', () => {
            it('should return high confidence with complete data', async () => {
                const result = await predictWinProbability(mockTeam1, mockTeam2);
                const { confidence } = result.analysis.comparison;

                expect(confidence.qualityLevel).toBe('high');
                expect(confidence.level).toBeCloseTo(PREDICTION_CONFIG.adjustments.defaultConfidence, 2);
                expect(confidence.factors).toHaveLength(0);
            });

            it('should reduce confidence with missing player stats', async () => {
                const { fetchPlayerStatsByName } = jest.requireMock('../hltvClient.js');
                fetchPlayerStatsByName.mockImplementation(async () => null);

                const result = await predictWinProbability(mockTeam1, mockTeam2);
                const { confidence } = result.analysis.comparison;

                expect(confidence.qualityLevel).toBe('low');
                expect(confidence.level).toBeLessThan(PREDICTION_CONFIG.adjustments.defaultConfidence);
                expect(confidence.factors).toContain('insufficient_player_stats');
            });

            it('should reduce confidence with missing H2H data', async () => {
                const { getHeadToHeadResults } = jest.requireMock('../hltvClient.js');
                getHeadToHeadResults.mockImplementation(async () => ({
                    team1Id: 1,
                    team2Id: 2,
                    totalMatches: 1, // Less than minimum required
                    matches: [{
                        winner: 1,
                        map: 'Inferno',
                        event: 'Major',
                        score: '16-14',
                        date: new Date()
                    }]
                }));

                const result = await predictWinProbability(mockTeam1, mockTeam2);
                const { confidence } = result.analysis.comparison;

                expect(confidence.factors).toContain('insufficient_h2h_matches');
                expect(confidence.level).toBeLessThan(PREDICTION_CONFIG.adjustments.defaultConfidence);
            });

            it('should handle missing map data appropriately', async () => {
                const result = await predictWinProbability(mockTeam1, mockTeam2, 'Nuke');
                const { confidence } = result.analysis.comparison;

                expect(confidence.factors).toContain('insufficient_map_data');
                expect(confidence.level).toBeLessThan(PREDICTION_CONFIG.adjustments.defaultConfidence);
            });

            it('should calculate correct quality level based on available data', async () => {
                // Test with partial data
                const { fetchPlayerStatsByName, getHeadToHeadResults } = jest.requireMock('../hltvClient.js');
                
                // Only basic stats available
                fetchPlayerStatsByName.mockImplementation(async () => ({
                    rating: 1.15,
                    mapsPlayed: 50
                }));

                // Limited H2H data
                getHeadToHeadResults.mockImplementation(async () => ({
                    team1Id: 1,
                    team2Id: 2,
                    totalMatches: 2,
                    matches: [
                        {
                            winner: 1,
                            map: 'Inferno',
                            event: 'Regular',
                            score: '16-14',
                            date: new Date()
                        },
                        {
                            winner: 2,
                            map: 'Inferno',
                            event: 'Regular',
                            score: '16-13',
                            date: new Date(Date.now() - 86400000)
                        }
                    ]
                }));

                const result = await predictWinProbability(mockTeam1, mockTeam2);
                const { confidence } = result.analysis.comparison;

                expect(confidence.qualityLevel).toBe('medium');
                expect(confidence.factors).toContain('insufficient_detailed_stats');
                expect(confidence.level).toBeLessThan(PREDICTION_CONFIG.adjustments.defaultConfidence);
            });
        });

        describe('Data Quality Integration', () => {
            it('should adjust prediction weights based on data quality', async () => {
                // First get prediction with complete data
                const fullDataResult = await predictWinProbability(mockTeam1, mockTeam2);

                // Then get prediction with limited data
                const { fetchPlayerStatsByName, getHeadToHeadResults } = jest.requireMock('../hltvClient.js');
                fetchPlayerStatsByName.mockImplementation(async () => ({
                    rating: 1.15 // Only basic rating available
                }));
                getHeadToHeadResults.mockImplementation(async () => null);

                const limitedDataResult = await predictWinProbability(mockTeam1, mockTeam2);

                // The limited data prediction should be closer to 0.5 (less confident)
                const fullDataDelta = Math.abs(fullDataResult.team1WinProb - 0.5);
                const limitedDataDelta = Math.abs(limitedDataResult.team1WinProb - 0.5);

                expect(limitedDataDelta).toBeLessThan(fullDataDelta);
            });

            it('should maintain prediction bounds regardless of data quality', async () => {
                // Test with various data quality scenarios
                const scenarios = [
                    { name: 'complete', stats: mockPlayerStats },
                    { name: 'basic', stats: { rating: 1.15 } },
                    { name: 'minimal', stats: null }
                ];

                for (const scenario of scenarios) {
                    const { fetchPlayerStatsByName } = jest.requireMock('../hltvClient.js');
                    fetchPlayerStatsByName.mockImplementation(async () => scenario.stats);

                    const result = await predictWinProbability(mockTeam1, mockTeam2);

                    expect(result.team1WinProb).toBeGreaterThanOrEqual(0);
                    expect(result.team1WinProb).toBeLessThanOrEqual(1);
                    expect(result.team1WinProb + result.team2WinProb).toBeCloseTo(1, 5);
                }
            });
        });
    });
}); 
// Mock data for --test mode

// Mock Matches
export const MOCK_TEST_MATCHES = [
    { id: 1234, team1Name: 'Natus Vincere', team2Name: 'FaZe' },
    { id: 5678, team1Name: 'Vitality', team2Name: 'G2' },
    { id: 9101, team1Name: 'Heroic', team2Name: 'Astralis' },
    { id: 9102, team1Name: 'MOUZ', team2Name: 'Outsiders' },
    { id: 9999, team1Name: 'MissingDataFC', team2Name: 'FaZe' }, // Test missing team
    { id: 8888, team1Name: 'Natus Vincere', team2Name: 'NoStatsUnited' } // Test missing players
];

// Mock Team Data
export const MOCK_TEAM_DATA = {
    'Natus Vincere': {
        id: 4608, name: 'Natus Vincere', rank: 1,
        players: [
            { name: 's1mple', id: 7998 }, { name: 'electroNic', id: 8918 }, { name: 'b1t', id: 18987 }, { name: 'Perfecto', id: 16947 }, { name: 'sdy', id: 9600 }
        ]
    },
    'FaZe': {
        id: 6667, name: 'FaZe', rank: 2,
        players: [
            { name: 'karrigan', id: 429 }, { name: 'Twistzz', id: 10394 }, { name: 'broky', id: 18053 }, { name: 'ropz', id: 11816 }, { name: 'rain', id: 8183 }
        ]
    },
    'Vitality': {
        id: 9565, name: 'Vitality', rank: 3,
        players: [
            { name: 'ZywOo', id: 11893 }, { name: 'apEX', id: 7322 }, { name: 'Magisk', id: 9032 }, { name: 'Spinx', id: 18228 }, { name: 'dupreeh', id: 7328 }
        ]
     },
    'G2': {
        id: 5995, name: 'G2', rank: 4,
        players: [
            { name: 'NiKo', id: 3741 }, { name: 'huNter-', id: 11847 }, { name: 'm0NESY', id: 20128 }, { name: 'jks', id: 10000 }, { name: 'HooXi', id: 12739 }
        ]
    },
    'Heroic': {
        id: 7175, name: 'Heroic', rank: 5,
        players: [{ name: 'cadiaN', id: 7964 }, { name: 'stavn', id: 10994 }, { name: 'TeSeS', id: 12018 }, { name: 'sjuush', id: 14171 }, { name: 'jabbi', id: 18998 }]
    },
    'Astralis': {
        id: 6665, name: 'Astralis', rank: 6,
        players: [{ name: 'gla1ve', id: 7412 }, { name: 'Xyp9x', id: 4954 }, { name: 'blameF', id: 15165 }, { name: 'k0nfig', id: 8248 }, { name: 'Farlig', id: 11637 }]
    },
    'MOUZ': {
        id: 4494, name: 'MOUZ', rank: 7,
        players: [
            { name: 'frozen', id: 13156 }, { name: 'torzsi', id: 16920 }, { name: 'dexter', id: 10476 }, { name: 'JDC', id: 18222 }, { name: 'xertioN', id: 19193 }
        ]
    },
    'Outsiders': {
        id: 11595, name: 'Outsiders', rank: 8,
        players: [
            { name: 'Jame', id: 13121 }, { name: 'FL1T', id: 14149 }, { name: 'n0rb3r7', id: 14299 }, { name: 'fame', id: 19226 }, { name: 'Qikert', id: 10788 }
        ]
    },
    // Team designed to have missing players for testing
    'NoStatsUnited': {
        id: 1001, name: 'NoStatsUnited', rank: 50,
        players: [
            { name: 'PlayerA', id: 10001 },
            { name: 'PlayerB', id: 10002 },
            { name: 'PlayerC', id: 10003 }, // These IDs won't be in MOCK_PLAYER_RATINGS_CACHE
            { name: 'PlayerD', id: 10004 },
            { name: 'PlayerE', id: 10005 }
        ]
    }
};

// MOCK Player Stats - Keyed by Player ID (maps ID to Rating or null)
export const MOCK_PLAYER_RATINGS_CACHE = new Map([
    // NaVi
    [7998, 1.25], [8918, 1.10], [18987, 1.12], [16947, 1.05], [9600, 0.98],
    // FaZe
    [429, 0.92], [10394, 1.15], [18053, 1.14], [11816, 1.18], [8183, 1.08],
    // Vitality
    [11893, 1.30], [7322, 0.95], [9032, 1.09], [18228, 1.13], [7328, 1.07],
    // G2
    [3741, 1.22], [11847, 1.11], [20128, 1.16], [10000, 1.06], [12739, 0.88],
    // Heroic
    [7964, 1.08], [10994, 1.17], [12018, 1.10], [14171, 1.04], [18998, 1.09],
    // Astralis
    [7412, 0.96], [4954, 1.02], [15165, 1.19], [8248, 1.07], [11637, 1.03],
    // MOUZ
    [13156, 1.16], [16920, 1.11], [10476, 0.93], [18222, 1.00], [19193, 1.05],
    // Outsiders
    [13121, 1.14], [14149, 1.12], [14299, 1.01], [19226, 1.08],
    // Qikert (10788) intentionally missing rating (will get null)
    [10788, null]
]);

// Mock H2H data (Keys: sorted team IDs "ID1-ID2")
export const MOCK_H2H_DATA = {
    // NaVi (4608) vs FaZe (6667)
    '4608-6667': { team1Wins: 5, team2Wins: 3, totalMatches: 8 },
    // Vitality (9565) vs G2 (5995)
    '5995-9565': { team1Wins: 2, team2Wins: 4, totalMatches: 6 },
    // Heroic (7175) vs Astralis (6665)
    '6665-7175': { team1Wins: 6, team2Wins: 6, totalMatches: 12 },
    // MOUZ (4494) vs Outsiders (11595)
    '4494-11595': { team1Wins: 1, team2Wins: 1, totalMatches: 2 }, // Test low match count
    // NaVi (4608) vs NoStatsUnited (1001)
    '1001-4608': { team1Wins: 0, team2Wins: 0, totalMatches: 0 } // Test no H2H
};

// Mock implementations for test mode client
export const mockHltvClient = {
    getTodaysMatches: async () => {
        console.log('[TEST MODE] Using mock match list.');
        return MOCK_TEST_MATCHES;
    },
    fetchTeamDataByName: async (name) => {
        console.log(`[TEST MODE] Fetching mock data for team: ${name}`);
        const teamData = MOCK_TEAM_DATA[name] || null;
        if (!teamData) {
             console.warn(`[TEST MODE] Mock team data not found for: ${name}`);
        }
        return teamData;
    },
    // Simulates fetching player stats (returns stats obj or null)
    fetchPlayerStatsById: async (id, name = 'Unknown') => {
        console.log(`[TEST MODE] Fetching mock stats for player ${name} (ID: ${id})`);
        if (MOCK_PLAYER_RATINGS_CACHE.has(id)) {
            const rating = MOCK_PLAYER_RATINGS_CACHE.get(id);
            console.log(`[TEST MODE] Found mock rating ${rating} for ${name} (ID: ${id})`);
            // Return a basic stats object if rating exists, or null if rating is null
            return rating !== null ? { rating: rating, mapsPlayed: 50 /* other mock stats */ } : null;
        }
        console.log(`[TEST MODE] Mock stats not found for ${name} (ID: ${id}), returning null.`);
        return null; // Return null if not in mock cache
    },
    getHeadToHeadResults: async (id1, id2) => {
        console.log(`[TEST MODE] Fetching mock H2H for ${id1} vs ${id2}`);
        const key = [id1, id2].sort((a, b) => a - b).join('-');
        const h2hData = MOCK_H2H_DATA[key] || { team1Wins: 0, team2Wins: 0, totalMatches: 0 };
        console.log(`[TEST MODE] Mock H2H for ${key}: ${JSON.stringify(h2hData)}`);
        return h2hData;
    }
    // Add mock for getMatchDetails if needed for testing result updates
    // getMatchDetails: async (matchId) => { ... }
}; 
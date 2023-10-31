const { HLTV } = require("hltv");

import("p-limit").then((pLimitModule) => {
  const pLimit = pLimitModule.default;
  const apiLimit = pLimit(1); // Limit API requests to one at a time to avoid overloading
  const delayBetweenCalls = 7500; // 10-second delay

  // Function to calculate the team's strength based on team rank and player stats
  async function calculateTeamStrength(playerStats, players) {
    if (playerStats && typeof playerStats === "object") {
      return (
        (playerStats.killsPerRound +
          playerStats.mapsPlayed +
          playerStats.roundsContributed) *
        playerStats.rating
      );
    } else if (players.length > 0) {
      // Calculate average player statistics
      const averageStats = {
        rating: 0,
        killsPerRound: 0,
        mapsPlayed: 0,
        roundsContributed: 0,
      };

      for (const player of players) {
        if (player && player.playerStats) {
          averageStats.rating += player.playerStats.rating;
          averageStats.killsPerRound += player.playerStats.killsPerRound;
          averageStats.mapsPlayed += player.playerStats.mapsPlayed;
          averageStats.roundsContributed +=
            player.playerStats.roundsContributed;
        }
      }

      // Calculate the team's strength using average values
      return (
        (averageStats.killsPerRound +
          averageStats.mapsPlayed +
          averageStats.roundsContributed) *
        averageStats.rating
      );
    } else {
      console.error("Invalid player statistics format.");
      return NaN;
    }
  }

  // Function to fetch player statistics by name with a delay
  async function fetchPlayerStatsWithDelay(playerName) {
    return new Promise(async (resolve) => {
      if (playerName) {
        await apiLimit(async () => {
          const playerStats = await fetchPlayerStats(playerName);
          if (playerStats && typeof playerStats === "object") {
            resolve(playerStats);
          } else {
            console.error(
              `Player ${playerName} statistics are not in the expected format.`
            );
            resolve(null);
          }
          await delay(delayBetweenCalls);
        });
      } else {
        console.error("Player name is undefined");
        resolve(null);
      }
    });
  }

  // Function to fetch player statistics by name with error handling
  async function fetchPlayerStats(playerName) {
    try {
      const playerData = await HLTV.getPlayerByName({ name: playerName });
      if (playerData) {
        const relevantPlayerStats = playerData.statistics;
        return relevantPlayerStats;
      } else {
        console.error(`Player ${playerName} data is not available.`);
        return null;
      }
    } catch (error) {
      console.error("Error fetching player stats:", error);
      return null;
    }
  }

  // Function to fetch team statistics by team name with a delay
  async function fetchTeamStatsWithDelay(teamName) {
    return new Promise(async (resolve) => {
      await delay(delayBetweenCalls);
      const teamStats = await fetchTeamStats(teamName);
      resolve(teamStats);
    });
  }

  // Function to fetch team statistics by team name
  async function fetchTeamStats(teamName) {
    try {
      const team = await HLTV.getTeamByName({ name: teamName });
      const teamRank = team.rank;

      const players = team.players;
      const teamStats = {
        rating: 0,
        killsPerRound: 0,
        mapsPlayed: 0,
        roundsContributed: 0,
      };

      const playerStatsPromises = players.map(async (player) => {
        const playerStats = await fetchPlayerStatsWithDelay(player.name);
        if (playerStats) {
          teamStats.rating += playerStats.rating;
          teamStats.killsPerRound += playerStats.killsPerRound;
          teamStats.mapsPlayed += playerStats.mapsPlayed;
          teamStats.roundsContributed += playerStats.roundsContributed;
        }
      });

      await Promise.all(playerStatsPromises);

      // Calculate the team's strength
      const teamStrength = calculateTeamStrength(teamStats, players);

      console.log(`Team ${teamName} Strength: ${await teamStrength}`);
      return teamStrength;
    } catch (error) {
      console.error("Error fetching team stats:", error);
      return null;
    }
  }

  // Main function to fetch and process data
  async function fetchData() {
    try {
      // Get the current date
      const currentDate = new Date();
      // Fetch all matches
      const allMatches = await HLTV.getMatches();

      // Filter matches for today
      const filteredMatches = allMatches.filter((match) => {
        // Convert timestamp to Date object
        const matchDate = new Date(match.date);
        // Check if the date matches the current date
        return (
          matchDate.getDate() === currentDate.getDate() &&
          matchDate.getMonth() === currentDate.getMonth() &&
          matchDate.getFullYear() === currentDate.getFullYear()
        );
      });

      console.log("Matches for today:", filteredMatches);

      const [top30Teams] = await Promise.all([HLTV.getTeamRanking()]);

      console.log("Top 30 Teams:", top30Teams);

      const matchesWithTeamStrength = await Promise.all(
        filteredMatches.map(async (match) => {
          const team1 = top30Teams.find(
            (team) => team.team.name === match.team1?.name
          );
          const team2 = top30Teams.find(
            (team) => team.team.name === match.team2?.name
          );

          if (team1 && team2) {
            const [team1Strength, team2Strength] = await Promise.all([
              fetchTeamStatsWithDelay(match.team1.name),
              fetchTeamStatsWithDelay(match.team2.name),
            ]);

            if (team1Strength !== null && team2Strength !== null) {
              const winner =
                team1Strength > team2Strength
                  ? match.team1.name
                  : match.team2.name;
              return { ...match, potentialWinner: winner };
            }
          }

          return null;
        })
      );

      const validMatches = matchesWithTeamStrength.filter(
        (match) => match !== null
      );

      console.log("Valid Matches:", validMatches);
    } catch (error) {
      console.error("An error occurred:", error);
    }
  }

  fetchData();
});

// Helper function to introduce a delay
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

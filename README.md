# HLTV Match Predictor

The HLTV Match Predictor is a Node.js application that predicts the potential winners of Counter-Strike 2 (CS2) matches based on team rankings and player statistics. It utilizes the HLTV API to fetch match data, team rankings, and player statistics to make these predictions. The application calculates a team's strength by considering player statistics and then compares the strengths of two teams to predict the potential winner.

## How It Works

The application consists of the following main components and functions:

1. **Setup**

   - The application imports the necessary modules, including the HLTV API for data retrieval and a rate limiter to avoid overloading the API.

2. **calculateTeamStrength**

   - This function is used to calculate a team's strength based on team rank and player statistics. It takes two parameters: `playerStats` and `players`. If `playerStats` is an object, it uses the player's statistics to calculate the strength. If `playerStats` is not an object, it calculates the average player statistics based on the available player data and then calculates the team's strength using these average values.

3. **fetchPlayerStatsWithDelay**

   - This function fetches a player's statistics by name with a delay to avoid overloading the HLTV API. It returns a Promise and uses the `apiLimit` rate limiter to control the rate of API requests.

4. **fetchPlayerStats**

   - This function fetches a player's statistics by name using the HLTV API. It returns the relevant player statistics if available, or logs an error message if the data is not in the expected format.

5. **fetchTeamStatsWithDelay**

   - This function fetches a team's statistics by team name with a delay to avoid overloading the HLTV API. It returns a Promise and uses the `delay` function to introduce a delay between requests.

6. **fetchTeamStats**

   - This function fetches a team's statistics by team name using the HLTV API. It retrieves the team's players and their statistics and calculates the team's strength using the `calculateTeamStrength` function.

7. **fetchData**

   - This is the main function of the application. It fetches and processes data to predict match outcomes. It fetches today's matches, retrieves the top 30 teams' rankings, and calculates the potential winners for each match based on team strengths.

8. **delay**
   - A helper function that introduces a delay between requests.

## Running the Application

To run the HLTV Match Predictor:

1. Make sure you have Node.js installed on your system.

2. Clone or download the repository.

3. Open your terminal or command prompt and navigate to the project directory.

4. Run the following command to install the required dependencies: `npm install`

5. Edit the code as needed and update any API keys or configuration settings if required.

6. Run the application using the following command: `node hltvMatchPredictor.js`

The application will fetch data from the HLTV API and predict the potential winners of today's matches.

**Note:** Please make sure to review and respect HLTV's API usage policy and terms of service while using this application to fetch data.

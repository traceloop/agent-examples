import { openai } from "@ai-sdk/openai";
import { generateText, tool, generateObject } from "ai";
import { z } from "zod";
import * as Traceloop from "@traceloop/node-server-sdk";

// Initialize Traceloop
Traceloop.initialize({
  appName: "travel-planner-ai-sdk",
  disableBatch: true,
});

// Types and Schemas for structured output

const DayActivitySchema = z.object({
  time: z.string(),
  activity: z.string(),
  location: z.string(),
  notes: z.string(),
});

const DayPlanSchema = z.object({
  day_number: z.number(),
  date: z.string(),
  title: z.string(),
  activities: z.array(DayActivitySchema),
  meals: z.array(z.string()),
  accommodation: z.string(),
});

const TravelItinerarySchema = z.object({
  trip_title: z.string(),
  destination: z.string(),
  duration_days: z.number(),
  total_budget_estimate: z.string(),
  daily_plans: z.array(DayPlanSchema),
  travel_tips: z.array(z.string()),
  packing_suggestions: z.array(z.string()),
});


// Helper function to add delays
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tool Implementations
const searchDestinationsTool = tool({
  description:
    "Search for travel destinations by region or subregion using REST Countries API.",
  parameters: z.object({
    region: z.string().optional().describe("Region to search (e.g., 'Europe', 'Asia', 'Americas')"),
    subregion: z.string().optional().describe("Subregion to search (e.g., 'Southern Europe', 'Southeast Asia')"),
  }),
  execute: async ({ region = "", subregion = "" }) => {
    console.log(`Searching destinations for region: '${region}', subregion: '${subregion}'`);

    try {
      await sleep(500);

      const url = region
        ? `https://restcountries.com/v3.1/region/${region}`
        : "https://restcountries.com/v3.1/all";

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      let countriesData = await response.json();

      // Filter by subregion if provided
      if (subregion) {
        countriesData = countriesData.filter(
          (c: any) => c.subregion?.toLowerCase() === subregion.toLowerCase()
        );
      }

      // Limit to 10 countries
      countriesData = countriesData.slice(0, 10);

      const countries = countriesData.map((country: any) => ({
        name: country.name?.common || "Unknown",
        capital: (country.capital || ["Unknown"]).join(", "),
        region: country.region || "Unknown",
        subregion: country.subregion || "Unknown",
        population: country.population || 0,
        currencies: Object.keys(country.currencies || {}),
        languages: Object.values(country.languages || {}),
        timezones: country.timezones || [],
      }));

      return {
        status: "success",
        message: `Found ${countries.length} destinations in ${region || "all regions"}`,
        countries,
        count: countries.length,
      };
    } catch (error: any) {
      console.error(`Error searching destinations: ${error.message}`);
      return {
        status: "error",
        message: `Failed to search destinations: ${error.message}`,
        count: 0,
      };
    }
  },
});

const getWeatherForecastTool = tool({
  description: "Get current weather and 7-day forecast using Open-Meteo API.",
  parameters: z.object({
    location_name: z.string().describe("Name of the location"),
    latitude: z.number().describe("Latitude coordinate"),
    longitude: z.number().describe("Longitude coordinate"),
  }),
  execute: async ({ location_name, latitude, longitude }) => {
    console.log(`Getting weather forecast for ${location_name} (${latitude}, ${longitude})`);

    try {
      await sleep(500);

      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        current: "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
        daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
        timezone: "auto",
        forecast_days: "7",
      });

      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      const current = data.current || {};
      const daily = data.daily || {};

      // Map weather codes to conditions
      const conditions: Record<number, string> = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Foggy",
        61: "Light rain",
        63: "Moderate rain",
        65: "Heavy rain",
        71: "Light snow",
        95: "Thunderstorm",
      };

      const weatherCode = current.weather_code || 0;
      const currentConditions = conditions[weatherCode] || "Unknown";

      const forecastDays = (daily.time || []).map((date: string, i: number) => ({
        date,
        temp_max: daily.temperature_2m_max?.[i] ?? 0,
        temp_min: daily.temperature_2m_min?.[i] ?? 0,
        precipitation: daily.precipitation_sum?.[i] ?? 0,
      }));

      const forecast = {
        location: location_name,
        latitude,
        longitude,
        current_temperature: current.temperature_2m ?? 0,
        current_conditions: currentConditions,
        forecast_days: forecastDays,
      };

      return {
        status: "success",
        message: `Weather forecast retrieved for ${location_name}`,
        forecast,
      };
    } catch (error: any) {
      console.error(`Error getting weather forecast: ${error.message}`);
      return {
        status: "error",
        message: `Failed to get weather forecast: ${error.message}`,
      };
    }
  },
});

const getLocationCoordinatesTool = tool({
  description: "Get coordinates for a location using Nominatim (OpenStreetMap) API.",
  parameters: z.object({
    location_name: z.string().describe("Name of the city or location"),
  }),
  execute: async ({ location_name }) => {
    console.log(`Getting coordinates for location: ${location_name}`);

    try {
      // Respect rate limits (Nominatim requires max 1 req/sec)
      await sleep(1100);

      const params = new URLSearchParams({
        q: location_name,
        format: "json",
        limit: "1",
      });

      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: {
          "User-Agent": "TravelAgentDemo/1.0 (OpenTelemetry Sample App)",
        },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      if (!data || data.length === 0) {
        return {
          status: "error",
          message: `Location not found: ${location_name}`,
        };
      }

      const locationData = data[0];
      const coordinates = {
        location_name,
        latitude: parseFloat(locationData.lat),
        longitude: parseFloat(locationData.lon),
        country: locationData.display_name.split(",").pop()?.trim() || "",
        display_name: locationData.display_name,
      };

      return {
        status: "success",
        message: `Coordinates found for ${location_name}`,
        coordinates,
      };
    } catch (error: any) {
      console.error(`Error getting coordinates: ${error.message}`);
      return {
        status: "error",
        message: `Failed to get coordinates: ${error.message}`,
      };
    }
  },
});

const getDestinationInfoTool = tool({
  description: "Get information about a destination from Wikipedia API.",
  parameters: z.object({
    destination_name: z.string().describe("Name of the destination"),
  }),
  execute: async ({ destination_name }) => {
    console.log(`Getting destination info for: ${destination_name}`);

    try {
      await sleep(500);

      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(destination_name)}`,
        {
          headers: {
            "User-Agent": "TravelAgentDemo/1.0 (OpenTelemetry Sample App)",
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();

      const info = {
        title: data.title || destination_name,
        summary: data.description || "No description available",
        extract: data.extract || "No information available",
      };

      return {
        status: "success",
        message: `Retrieved information for ${destination_name}`,
        info,
      };
    } catch (error: any) {
      console.error(`Error getting destination info: ${error.message}`);
      return {
        status: "error",
        message: `Failed to get destination info: ${error.message}`,
      };
    }
  },
});

const calculateTravelDistanceTool = tool({
  description:
    "Calculate distance and estimated flight time between two locations using Haversine formula.",
  parameters: z.object({
    from_location: z.string().describe("Starting location name"),
    to_location: z.string().describe("Destination location name"),
    from_lat: z.number().describe("Starting latitude"),
    from_lon: z.number().describe("Starting longitude"),
    to_lat: z.number().describe("Destination latitude"),
    to_lon: z.number().describe("Destination longitude"),
  }),
  execute: async ({ from_location, to_location, from_lat, from_lon, to_lat, to_lon }) => {
    console.log(`Calculating distance from ${from_location} to ${to_location}`);

    try {
      // Haversine formula
      const R = 6371; // Earth's radius in kilometers

      const toRad = (deg: number) => (deg * Math.PI) / 180;

      const lat1 = toRad(from_lat);
      const lon1 = toRad(from_lon);
      const lat2 = toRad(to_lat);
      const lon2 = toRad(to_lon);

      const dlat = lat2 - lat1;
      const dlon = lon2 - lon1;

      const a =
        Math.sin(dlat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
      const c = 2 * Math.asin(Math.sqrt(a));
      const distanceKm = R * c;

      // Estimate flight time (average speed ~800 km/h)
      const flightTimeHours = distanceKm / 800.0;

      const distanceInfo = {
        from_location,
        to_location,
        distance_km: Math.round(distanceKm * 100) / 100,
        flight_time_hours: Math.round(flightTimeHours * 100) / 100,
      };

      return {
        status: "success",
        message: `Distance calculated: ${distanceInfo.distance_km} km, ~${distanceInfo.flight_time_hours} hours flight`,
        distance_info: distanceInfo,
      };
    } catch (error: any) {
      console.error(`Error calculating distance: ${error.message}`);
      return {
        status: "error",
        message: `Failed to calculate distance: ${error.message}`,
      };
    }
  },
});

const createItineraryTool = tool({
  description: "Create a detailed day-by-day travel itinerary using AI.",
  parameters: z.object({
    destination: z.string().describe("Main destination for the trip"),
    duration_days: z.number().describe("Number of days for the trip"),
    budget: z.string().describe("Budget level (budget, moderate, luxury)"),
    interests: z.string().describe("Traveler interests (e.g., food, history, nature)"),
    weather_info: z.string().optional().describe("Weather forecast information"),
    destination_details: z.string().optional().describe("Additional destination details"),
  }),
  execute: async ({
    destination,
    duration_days,
    budget,
    interests,
    weather_info = "",
    destination_details = "",
  }) => {
    console.log(`Creating ${duration_days}-day itinerary for ${destination} (${budget} budget)`);

    try {
      await sleep(500);

      const itineraryPrompt = `
You are an expert travel planner. Create a detailed ${duration_days}-day itinerary for ${destination}.

Trip Details:
- Destination: ${destination}
- Duration: ${duration_days} days
- Budget: ${budget}
- Interests: ${interests}
${weather_info ? `- Weather: ${weather_info}` : ""}
${destination_details ? `- Destination Info: ${destination_details}` : ""}

Create a comprehensive itinerary that includes:
1. A catchy trip title
2. Day-by-day plans with specific activities and timings
3. Meal recommendations for each day
4. Accommodation suggestions
5. Travel tips specific to this destination
6. Packing suggestions based on the weather and activities

Make the itinerary practical, engaging, and tailored to the ${budget} budget level and ${interests} interests.
Each day should have 3-5 activities with specific times, locations, and helpful notes.
`;

      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "system",
            content:
              "You are an expert travel planner who creates detailed, practical itineraries.",
          },
          { role: "user", content: itineraryPrompt },
        ],
        temperature: 0.7,
        maxTokens: 3000,
        schema: TravelItinerarySchema,
      });

      const itinerary = result.object;

      return {
        status: "success",
        message: `Created ${duration_days}-day itinerary for ${destination}`,
        itinerary,
      };
    } catch (error: any) {
      console.error(`Error creating itinerary: ${error.message}`);
      return {
        status: "error",
        message: `Failed to create itinerary: ${error.message}`,
      };
    }
  },
});

// Main Travel Planner Agent
async function runTravelAgency(userQuery: string) {
  console.log("=".repeat(80));
  console.log(`Query: ${userQuery}`);
  console.log("=".repeat(80));
  console.log("\nAgent Response:\n");

  const systemPrompt = `
You are an expert travel planning assistant. Your PRIMARY GOAL is to ALWAYS create a detailed
travel itinerary for the user, no matter how broad or specific their request is.

Your workflow:
1. Gather information based on the user's request (use research tools as needed)
2. Make reasonable assumptions for missing details (budget, duration, interests)
3. ALWAYS end by creating a complete itinerary using the create_itinerary tool

Your 6 tools:
1. search_destinations - Find destinations by region
2. get_location_coordinates - Get lat/long for locations
3. get_weather_forecast - Check weather forecasts
4. get_destination_info - Get details about places
5. calculate_travel_distance - Calculate distances between locations
6. create_itinerary - CREATE THE FINAL ITINERARY (REQUIRED!)

Response patterns based on request specificity:

SPECIFIC REQUESTS (destination, duration, budget mentioned):
- Gather targeted information (weather, details)
- Immediately create itinerary

BROAD REQUESTS (just region or vague preferences):
- Search for destinations in the region
- Pick 1-2 promising destinations
- Get coordinates and weather
- Make reasonable assumptions for duration (default 5-7 days) and budget (default moderate)
- Create itinerary with your recommendations

VERY VAGUE REQUESTS (no clear destination):
- Search popular destinations
- Recommend based on weather/season
- Assume moderate budget, 5-7 days
- Create itinerary

CRITICAL: Every response must end with a complete itinerary. Never skip the create_itinerary step.
If information is missing, make sensible assumptions and explain them in the itinerary.

When creating itineraries, use information from your research tools to make them relevant and practical.
`;

  const toolsUsed: string[] = [];

  try {
    await Traceloop.withAgent(
      { name: "travel_planner_ai_sdk" },
      async () => {
        await generateText({
          model: openai("gpt-4o"),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery },
          ],
          tools: {
            search_destinations: searchDestinationsTool,
            get_location_coordinates: getLocationCoordinatesTool,
            get_weather_forecast: getWeatherForecastTool,
            get_destination_info: getDestinationInfoTool,
            calculate_travel_distance: calculateTravelDistanceTool,
            create_itinerary: createItineraryTool,
          },
          maxSteps: 15,
          temperature: 0.7,
          experimental_telemetry: {
            isEnabled: true,
            metadata: { agent: "travel_agency" },
          },
          onStepFinish: (step) => {
            // Track tool calls
            if (step.toolCalls && step.toolCalls.length > 0) {
              step.toolCalls.forEach((toolCall) => {
                console.log(`\n[Calling tool: ${toolCall.toolName}]`);
                toolsUsed.push(toolCall.toolName);
              });
            }

            // Display tool results
            if (step.toolResults && step.toolResults.length > 0) {
              step.toolResults.forEach((toolResult) => {
                const resultStr = JSON.stringify(toolResult.result).substring(0, 200);
                console.log(`\n[Tool output: ${resultStr}...]\n`);
              });
            }

            // Display assistant response text
            if (step.text) {
              console.log(step.text);
            }
          },
        });
      }
    );

    console.log(`\n${"=".repeat(80)}`);
    console.log(`✅ Query completed! Tools used: ${toolsUsed.join(", ") || "None"}`);
    console.log(`${"=".repeat(80)}\n`);

    return toolsUsed;
  } catch (error: any) {
    console.error(`Error running agent: ${error.message}`);
    throw error;
  }
}

// Query generation
function generateTravelQueries(n: number = 10): string[] {
  const templates = [
    // VERY SPECIFIC REQUESTS
    "Plan a {duration}-day {budget} trip to {city} for {travelers} interested in {interest}. Create a complete itinerary.",
    "I want to visit {city} for {duration} days with a {budget} budget. I love {interest}. Create me an itinerary.",
    "Create a {duration}-day itinerary for {city}. Budget: {budget}, interests: {interest} and {interest2}.",

    // MODERATELY SPECIFIC REQUESTS
    "I want a {duration}-day {budget} {season} vacation in {region}. I'm interested in {interest}. Plan my trip.",
    "Plan a {adjective} trip to {region} for {travelers}. Budget is {budget}, duration {duration} days. Interested in {interest}.",
    "I need a {duration}-day itinerary for {region} focusing on {interest} and {interest2}. Budget: {budget}.",

    // BROAD REQUESTS
    "I want to explore {region} in {season}. Find good destinations and create an itinerary for me.",
    "Plan a {budget} trip to {region}. I love {interest}. Find the best place and create an itinerary.",
    "Help me plan a vacation in {region} for {travelers}. I'm interested in {interest}.",
    "I want to visit {region}. Create a travel plan for me focusing on {interest} and {interest2}.",

    // COMPARISON REQUESTS
    "Should I visit {city1} or {city2} for a {duration}-day {season} trip? Compare them and create an itinerary for the better option.",
    "I'm deciding between {city1} and {city2}. Check weather, compare them, and create a {duration}-day itinerary for your recommendation.",

    // VAGUE/OPEN-ENDED REQUESTS
    "I need a vacation. I like {interest}. Plan something for me.",
    "Plan a {season} getaway for {travelers}. Surprise me with a good destination.",
    "I want to go somewhere {adjective} for {interest}. Create a trip for me.",
    "Find me a great {budget} destination and plan my trip.",

    // RESEARCH-HEAVY REQUESTS
    "Find the best {season} destinations in {region}. Check weather for top 3, then create an itinerary for the best one.",
    "I want a {budget} {interest} trip. Search {region}, compare weather in several places, and create an itinerary for the top pick.",
    "Show me good {adjective} destinations in {region}. Compare a few, then plan a {duration}-day trip to your favorite.",

    // MULTI-CITY REQUESTS
    "Plan a {duration}-day multi-city trip visiting {city1}, {city2}, and {city3}. Create a complete itinerary.",
    "I want to visit multiple cities in {region} over {duration} days. Find the best route and create an itinerary.",
  ];

  const regions = ["Europe", "Asia", "Americas", "Africa", "Oceania"];
  const budgets = ["budget", "moderate", "luxury"];
  const durations = ["3", "5", "7", "10", "14"];
  const travelers = ["solo travelers", "couples", "families", "groups"];
  const seasons = ["spring", "summer", "fall", "winter"];
  const interests = [
    "food",
    "history",
    "nature",
    "beaches",
    "museums",
    "adventure",
    "culture",
    "nightlife",
  ];
  const adjectives = [
    "quick",
    "relaxing",
    "adventurous",
    "cultural",
    "romantic",
    "family-friendly",
    "exciting",
    "peaceful",
  ];
  const cities = [
    "Paris",
    "Tokyo",
    "New York",
    "London",
    "Barcelona",
    "Rome",
    "Bangkok",
    "Dubai",
    "Singapore",
    "Amsterdam",
    "Berlin",
    "Sydney",
    "Istanbul",
    "Prague",
    "Vienna",
    "Lisbon",
    "Cairo",
    "Mumbai",
    "Toronto",
    "Buenos Aires",
  ];

  const queries: string[] = [];

  for (let i = 0; i < n; i++) {
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Pick random values
    const interest1 = interests[Math.floor(Math.random() * interests.length)];
    const interest2 = interests.filter((x) => x !== interest1)[
      Math.floor(Math.random() * (interests.length - 1))
    ];

    const cityChoices = cities
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const query = template
      .replace("{region}", regions[Math.floor(Math.random() * regions.length)])
      .replace("{budget}", budgets[Math.floor(Math.random() * budgets.length)])
      .replace("{duration}", durations[Math.floor(Math.random() * durations.length)])
      .replace("{travelers}", travelers[Math.floor(Math.random() * travelers.length)])
      .replace("{season}", seasons[Math.floor(Math.random() * seasons.length)])
      .replace("{interest}", interest1)
      .replace("{interest2}", interest2)
      .replace("{adjective}", adjectives[Math.floor(Math.random() * adjectives.length)])
      .replace("{city}", cities[Math.floor(Math.random() * cities.length)])
      .replace("{city1}", cityChoices[0])
      .replace("{city2}", cityChoices[1])
      .replace("{city3}", cityChoices[2]);

    queries.push(query);
  }

  return queries;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf("--count");
  const delayIndex = args.indexOf("--delay");

  const count = countIndex >= 0 ? parseInt(args[countIndex + 1]) || 1 : 1;
  const delay = delayIndex >= 0 ? parseFloat(args[delayIndex + 1]) || 2.0 : 2.0;

  console.log("=".repeat(80));
  console.log("Travel Planning Agent with AI SDK");
  console.log("=".repeat(80));
  console.log(`Running ${count} travel planning queries...`);
  console.log("Goal: Create complete itineraries with varying research depth");
  console.log("Using real APIs: REST Countries, Open-Meteo, Nominatim, Wikipedia, OpenAI");
  console.log("6 Tools: search, coordinates, weather, info, distance, itinerary");
  console.log("=".repeat(80));
  console.log();

  const queries = generateTravelQueries(count);

  const allToolCalls: Array<{ query: string; tools_used: string[]; tool_count: number }> = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    console.log(`\n\n${"#".repeat(80)}`);
    console.log(`# Query ${i + 1} of ${count}`);
    console.log(`${"#".repeat(80)}\n`);

    const toolCalls = await runTravelAgency(query);
    allToolCalls.push({
      query,
      tools_used: toolCalls,
      tool_count: toolCalls.length,
    });

    if (i < count - 1) {
      console.log(`\nWaiting ${delay} seconds before next query...`);
      await sleep(delay * 1000);
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(80));
  console.log("EXECUTION SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total queries executed: ${allToolCalls.length}`);

  const toolUsage: Record<string, number> = {};
  for (const result of allToolCalls) {
    for (const tool of result.tools_used) {
      toolUsage[tool] = (toolUsage[tool] || 0) + 1;
    }
  }

  console.log("\nTool usage statistics:");
  Object.entries(toolUsage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tool, count]) => {
      console.log(`  - ${tool}: ${count} times`);
    });

  console.log("\nTrajectory variation:");
  const uniqueTrajectories = new Set(
    allToolCalls.map((r) => JSON.stringify(r.tools_used))
  ).size;
  console.log(`  - Unique tool call sequences: ${uniqueTrajectories}/${allToolCalls.length}`);

  const avgTools =
    allToolCalls.reduce((sum, r) => sum + r.tool_count, 0) / allToolCalls.length;
  console.log(`  - Average tools per query: ${avgTools.toFixed(2)}`);

  console.log("\n" + "=".repeat(80));
  console.log("✅ Travel Agent demo completed successfully!");
  console.log("🔍 All spans captured by OpenTelemetry instrumentation");
  console.log("=".repeat(80));
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

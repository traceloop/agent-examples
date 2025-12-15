import asyncio
import json
import math
import random
from typing import Any

import httpx
from openai import OpenAI
from pydantic import BaseModel
from traceloop.sdk import Traceloop
from traceloop.sdk.decorators import agent, tool as traceloop_tool

Traceloop.init(app_name="travel-planner-ai-sdk", disable_batch=True)

client = OpenAI()


class DayActivity(BaseModel):
    time: str
    activity: str
    location: str
    notes: str


class DayPlan(BaseModel):
    day_number: int
    date: str
    title: str
    activities: list[DayActivity]
    meals: list[str]
    accommodation: str


class TravelItinerary(BaseModel):
    trip_title: str
    destination: str
    duration_days: int
    total_budget_estimate: str
    daily_plans: list[DayPlan]
    travel_tips: list[str]
    packing_suggestions: list[str]


async def sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


@traceloop_tool(name="search_destinations")
async def search_destinations(region: str = "", subregion: str = "") -> dict[str, Any]:
    """Search for travel destinations by region or subregion using REST Countries API."""
    print(f"Searching destinations for region: '{region}', subregion: '{subregion}'")

    try:
        await sleep(0.5)

        url = (
            f"https://restcountries.com/v3.1/region/{region}"
            if region
            else "https://restcountries.com/v3.1/all"
        )

        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(url)
            response.raise_for_status()
            countries_data = response.json()

        if subregion:
            countries_data = [
                c
                for c in countries_data
                if c.get("subregion", "").lower() == subregion.lower()
            ]

        countries_data = countries_data[:10]

        countries = [
            {
                "name": country.get("name", {}).get("common", "Unknown"),
                "capital": ", ".join(country.get("capital", ["Unknown"])),
                "region": country.get("region", "Unknown"),
                "subregion": country.get("subregion", "Unknown"),
                "population": country.get("population", 0),
                "currencies": list(country.get("currencies", {}).keys()),
                "languages": list(country.get("languages", {}).values()),
                "timezones": country.get("timezones", []),
            }
            for country in countries_data
        ]

        return {
            "status": "success",
            "message": f"Found {len(countries)} destinations in {region or 'all regions'}",
            "countries": countries,
            "count": len(countries),
        }
    except Exception as e:
        print(f"Error searching destinations: {e}")
        return {
            "status": "error",
            "message": f"Failed to search destinations: {e}",
            "count": 0,
        }


@traceloop_tool(name="get_weather_forecast")
async def get_weather_forecast(
    location_name: str, latitude: float, longitude: float
) -> dict[str, Any]:
    """Get current weather and 7-day forecast using Open-Meteo API."""
    print(f"Getting weather forecast for {location_name} ({latitude}, {longitude})")

    try:
        await sleep(0.5)

        params = {
            "latitude": str(latitude),
            "longitude": str(longitude),
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "timezone": "auto",
            "forecast_days": "7",
        }

        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                "https://api.open-meteo.com/v1/forecast", params=params
            )
            response.raise_for_status()
            data = response.json()

        current = data.get("current", {})
        daily = data.get("daily", {})

        conditions = {
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
        }

        weather_code = current.get("weather_code", 0)
        current_conditions = conditions.get(weather_code, "Unknown")

        forecast_days = [
            {
                "date": date,
                "temp_max": daily.get("temperature_2m_max", [0])[i],
                "temp_min": daily.get("temperature_2m_min", [0])[i],
                "precipitation": daily.get("precipitation_sum", [0])[i],
            }
            for i, date in enumerate(daily.get("time", []))
        ]

        forecast = {
            "location": location_name,
            "latitude": latitude,
            "longitude": longitude,
            "current_temperature": current.get("temperature_2m", 0),
            "current_conditions": current_conditions,
            "forecast_days": forecast_days,
        }

        return {
            "status": "success",
            "message": f"Weather forecast retrieved for {location_name}",
            "forecast": forecast,
        }
    except Exception as e:
        print(f"Error getting weather forecast: {e}")
        return {
            "status": "error",
            "message": f"Failed to get weather forecast: {e}",
        }


@traceloop_tool(name="get_location_coordinates")
async def get_location_coordinates(location_name: str) -> dict[str, Any]:
    """Get coordinates for a location using Nominatim (OpenStreetMap) API."""
    print(f"Getting coordinates for location: {location_name}")

    try:
        await sleep(1.1)

        params = {
            "q": location_name,
            "format": "json",
            "limit": "1",
        }

        headers = {"User-Agent": "TravelAgentDemo/1.0 (OpenTelemetry Sample App)"}

        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

        if not data:
            return {
                "status": "error",
                "message": f"Location not found: {location_name}",
            }

        location_data = data[0]
        coordinates = {
            "location_name": location_name,
            "latitude": float(location_data["lat"]),
            "longitude": float(location_data["lon"]),
            "country": location_data.get("display_name", "").split(",")[-1].strip(),
            "display_name": location_data.get("display_name", ""),
        }

        return {
            "status": "success",
            "message": f"Coordinates found for {location_name}",
            "coordinates": coordinates,
        }
    except Exception as e:
        print(f"Error getting coordinates: {e}")
        return {
            "status": "error",
            "message": f"Failed to get coordinates: {e}",
        }


@traceloop_tool(name="get_destination_info")
async def get_destination_info(destination_name: str) -> dict[str, Any]:
    """Get information about a destination from Wikipedia API."""
    print(f"Getting destination info for: {destination_name}")

    try:
        await sleep(0.5)

        headers = {"User-Agent": "TravelAgentDemo/1.0 (OpenTelemetry Sample App)"}

        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{destination_name}",
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()

        info = {
            "title": data.get("title", destination_name),
            "summary": data.get("description", "No description available"),
            "extract": data.get("extract", "No information available"),
        }

        return {
            "status": "success",
            "message": f"Retrieved information for {destination_name}",
            "info": info,
        }
    except Exception as e:
        print(f"Error getting destination info: {e}")
        return {
            "status": "error",
            "message": f"Failed to get destination info: {e}",
        }


@traceloop_tool(name="calculate_travel_distance")
async def calculate_travel_distance(
    from_location: str,
    to_location: str,
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
) -> dict[str, Any]:
    """Calculate distance and estimated flight time between two locations using Haversine formula."""
    print(f"Calculating distance from {from_location} to {to_location}")

    try:
        R = 6371

        lat1 = math.radians(from_lat)
        lon1 = math.radians(from_lon)
        lat2 = math.radians(to_lat)
        lon2 = math.radians(to_lon)

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.asin(math.sqrt(a))
        distance_km = R * c

        flight_time_hours = distance_km / 800.0

        distance_info = {
            "from_location": from_location,
            "to_location": to_location,
            "distance_km": round(distance_km, 2),
            "flight_time_hours": round(flight_time_hours, 2),
        }

        return {
            "status": "success",
            "message": f"Distance calculated: {distance_info['distance_km']} km, ~{distance_info['flight_time_hours']} hours flight",
            "distance_info": distance_info,
        }
    except Exception as e:
        print(f"Error calculating distance: {e}")
        return {
            "status": "error",
            "message": f"Failed to calculate distance: {e}",
        }


@traceloop_tool(name="create_itinerary")
async def create_itinerary(
    destination: str,
    duration_days: int,
    budget: str,
    interests: str,
    weather_info: str = "",
    destination_details: str = "",
) -> dict[str, Any]:
    """Create a detailed day-by-day travel itinerary using AI."""
    print(f"Creating {duration_days}-day itinerary for {destination} ({budget} budget)")

    try:
        await sleep(0.5)

        itinerary_prompt = f"""
You are an expert travel planner. Create a detailed {duration_days}-day itinerary for {destination}.

Trip Details:
- Destination: {destination}
- Duration: {duration_days} days
- Budget: {budget}
- Interests: {interests}
{f'- Weather: {weather_info}' if weather_info else ''}
{f'- Destination Info: {destination_details}' if destination_details else ''}

Create a comprehensive itinerary that includes:
1. A catchy trip title
2. Day-by-day plans with specific activities and timings
3. Meal recommendations for each day
4. Accommodation suggestions
5. Travel tips specific to this destination
6. Packing suggestions based on the weather and activities

Make the itinerary practical, engaging, and tailored to the {budget} budget level and {interests} interests.
Each day should have 3-5 activities with specific times, locations, and helpful notes.
"""

        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert travel planner who creates detailed, practical itineraries.",
                },
                {"role": "user", "content": itinerary_prompt},
            ],
            temperature=0.7,
            max_tokens=3000,
            response_format=TravelItinerary,
        )

        itinerary = response.choices[0].message.parsed

        return {
            "status": "success",
            "message": f"Created {duration_days}-day itinerary for {destination}",
            "itinerary": itinerary.model_dump() if itinerary else None,
        }
    except Exception as e:
        print(f"Error creating itinerary: {e}")
        return {
            "status": "error",
            "message": f"Failed to create itinerary: {e}",
        }


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_destinations",
            "description": "Search for travel destinations by region or subregion using REST Countries API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "region": {
                        "type": "string",
                        "description": "Region to search (e.g., 'Europe', 'Asia', 'Americas')",
                    },
                    "subregion": {
                        "type": "string",
                        "description": "Subregion to search (e.g., 'Southern Europe', 'Southeast Asia')",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_location_coordinates",
            "description": "Get coordinates for a location using Nominatim (OpenStreetMap) API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {
                        "type": "string",
                        "description": "Name of the city or location",
                    },
                },
                "required": ["location_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather_forecast",
            "description": "Get current weather and 7-day forecast using Open-Meteo API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location_name": {
                        "type": "string",
                        "description": "Name of the location",
                    },
                    "latitude": {
                        "type": "number",
                        "description": "Latitude coordinate",
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Longitude coordinate",
                    },
                },
                "required": ["location_name", "latitude", "longitude"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_destination_info",
            "description": "Get information about a destination from Wikipedia API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "destination_name": {
                        "type": "string",
                        "description": "Name of the destination",
                    },
                },
                "required": ["destination_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_travel_distance",
            "description": "Calculate distance and estimated flight time between two locations using Haversine formula.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_location": {
                        "type": "string",
                        "description": "Starting location name",
                    },
                    "to_location": {
                        "type": "string",
                        "description": "Destination location name",
                    },
                    "from_lat": {
                        "type": "number",
                        "description": "Starting latitude",
                    },
                    "from_lon": {
                        "type": "number",
                        "description": "Starting longitude",
                    },
                    "to_lat": {
                        "type": "number",
                        "description": "Destination latitude",
                    },
                    "to_lon": {
                        "type": "number",
                        "description": "Destination longitude",
                    },
                },
                "required": ["from_location", "to_location", "from_lat", "from_lon", "to_lat", "to_lon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_itinerary",
            "description": "Create a detailed day-by-day travel itinerary using AI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {
                        "type": "string",
                        "description": "Main destination for the trip",
                    },
                    "duration_days": {
                        "type": "integer",
                        "description": "Number of days for the trip",
                    },
                    "budget": {
                        "type": "string",
                        "description": "Budget level (budget, moderate, luxury)",
                    },
                    "interests": {
                        "type": "string",
                        "description": "Traveler interests (e.g., food, history, nature)",
                    },
                    "weather_info": {
                        "type": "string",
                        "description": "Weather forecast information",
                    },
                    "destination_details": {
                        "type": "string",
                        "description": "Additional destination details",
                    },
                },
                "required": ["destination", "duration_days", "budget", "interests"],
            },
        },
    },
]

TOOL_FUNCTIONS = {
    "search_destinations": search_destinations,
    "get_location_coordinates": get_location_coordinates,
    "get_weather_forecast": get_weather_forecast,
    "get_destination_info": get_destination_info,
    "calculate_travel_distance": calculate_travel_distance,
    "create_itinerary": create_itinerary,
}


async def execute_tool(tool_name: str, arguments: dict[str, Any]) -> Any:
    """Execute a tool by name with given arguments."""
    if tool_name not in TOOL_FUNCTIONS:
        return {"status": "error", "message": f"Unknown tool: {tool_name}"}

    func = TOOL_FUNCTIONS[tool_name]
    return await func(**arguments)


@agent(name="travel_planner_ai_sdk")
async def run_travel_agency(user_query: str) -> list[str]:
    print("=" * 80)
    print(f"Query: {user_query}")
    print("=" * 80)
    print("\nAgent Response:\n")

    system_prompt = """
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
"""

    tools_used: list[str] = []
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_query},
    ]

    try:
        max_steps = 15
        for step in range(max_steps):
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=TOOLS,
                temperature=0.7,
            )

            message = response.choices[0].message

            if message.tool_calls:
                messages.append(message)

                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    print(f"\n[Calling tool: {tool_name}]")
                    tools_used.append(tool_name)

                    arguments = json.loads(tool_call.function.arguments)
                    result = await execute_tool(tool_name, arguments)

                    result_str = json.dumps(result)[:200]
                    print(f"\n[Tool output: {result_str}...]\n")

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result),
                    })
            else:
                if message.content:
                    print(message.content)
                break

        print(f"\n{'=' * 80}")
        print(f"Query completed! Tools used: {', '.join(tools_used) or 'None'}")
        print(f"{'=' * 80}\n")

        return tools_used
    except Exception as e:
        print(f"Error running agent: {e}")
        raise


def generate_travel_queries(n: int = 10) -> list[str]:
    templates = [
        "Plan a {duration}-day {budget} trip to {city} for {travelers} interested in {interest}. Create a complete itinerary.",
        "I want to visit {city} for {duration} days with a {budget} budget. I love {interest}. Create me an itinerary.",
        "Create a {duration}-day itinerary for {city}. Budget: {budget}, interests: {interest} and {interest2}.",
        "I want a {duration}-day {budget} {season} vacation in {region}. I'm interested in {interest}. Plan my trip.",
        "Plan a {adjective} trip to {region} for {travelers}. Budget is {budget}, duration {duration} days. Interested in {interest}.",
        "I need a {duration}-day itinerary for {region} focusing on {interest} and {interest2}. Budget: {budget}.",
        "I want to explore {region} in {season}. Find good destinations and create an itinerary for me.",
        "Plan a {budget} trip to {region}. I love {interest}. Find the best place and create an itinerary.",
        "Help me plan a vacation in {region} for {travelers}. I'm interested in {interest}.",
        "I want to visit {region}. Create a travel plan for me focusing on {interest} and {interest2}.",
        "Should I visit {city1} or {city2} for a {duration}-day {season} trip? Compare them and create an itinerary for the better option.",
        "I'm deciding between {city1} and {city2}. Check weather, compare them, and create a {duration}-day itinerary for your recommendation.",
        "I need a vacation. I like {interest}. Plan something for me.",
        "Plan a {season} getaway for {travelers}. Surprise me with a good destination.",
        "I want to go somewhere {adjective} for {interest}. Create a trip for me.",
        "Find me a great {budget} destination and plan my trip.",
        "Find the best {season} destinations in {region}. Check weather for top 3, then create an itinerary for the best one.",
        "I want a {budget} {interest} trip. Search {region}, compare weather in several places, and create an itinerary for the top pick.",
        "Show me good {adjective} destinations in {region}. Compare a few, then plan a {duration}-day trip to your favorite.",
        "Plan a {duration}-day multi-city trip visiting {city1}, {city2}, and {city3}. Create a complete itinerary.",
        "I want to visit multiple cities in {region} over {duration} days. Find the best route and create an itinerary.",
    ]

    regions = ["Europe", "Asia", "Americas", "Africa", "Oceania"]
    budgets = ["budget", "moderate", "luxury"]
    durations = ["3", "5", "7", "10", "14"]
    travelers = ["solo travelers", "couples", "families", "groups"]
    seasons = ["spring", "summer", "fall", "winter"]
    interests = ["food", "history", "nature", "beaches", "museums", "adventure", "culture", "nightlife"]
    adjectives = ["quick", "relaxing", "adventurous", "cultural", "romantic", "family-friendly", "exciting", "peaceful"]
    cities = [
        "Paris", "Tokyo", "New York", "London", "Barcelona", "Rome", "Bangkok", "Dubai",
        "Singapore", "Amsterdam", "Berlin", "Sydney", "Istanbul", "Prague", "Vienna",
        "Lisbon", "Cairo", "Mumbai", "Toronto", "Buenos Aires",
    ]

    queries: list[str] = []

    for _ in range(n):
        template = random.choice(templates)

        interest1 = random.choice(interests)
        interest2 = random.choice([i for i in interests if i != interest1])

        city_choices = random.sample(cities, 3)

        query = (
            template.replace("{region}", random.choice(regions))
            .replace("{budget}", random.choice(budgets))
            .replace("{duration}", random.choice(durations))
            .replace("{travelers}", random.choice(travelers))
            .replace("{season}", random.choice(seasons))
            .replace("{interest}", interest1)
            .replace("{interest2}", interest2)
            .replace("{adjective}", random.choice(adjectives))
            .replace("{city}", random.choice(cities))
            .replace("{city1}", city_choices[0])
            .replace("{city2}", city_choices[1])
            .replace("{city3}", city_choices[2])
        )

        queries.append(query)

    return queries


async def main():
    import sys

    args = sys.argv[1:]

    count = 1
    delay = 2.0

    if "--count" in args:
        idx = args.index("--count")
        count = int(args[idx + 1]) if idx + 1 < len(args) else 1

    if "--delay" in args:
        idx = args.index("--delay")
        delay = float(args[idx + 1]) if idx + 1 < len(args) else 2.0

    print("=" * 80)
    print("Travel Planning Agent with AI SDK")
    print("=" * 80)
    print(f"Running {count} travel planning queries...")
    print("Goal: Create complete itineraries with varying research depth")
    print("Using real APIs: REST Countries, Open-Meteo, Nominatim, Wikipedia, OpenAI")
    print("6 Tools: search, coordinates, weather, info, distance, itinerary")
    print("=" * 80)
    print()

    queries = generate_travel_queries(count)

    all_tool_calls: list[dict[str, Any]] = []

    for i, query in enumerate(queries):
        print(f"\n\n{'#' * 80}")
        print(f"# Query {i + 1} of {count}")
        print(f"{'#' * 80}\n")

        tool_calls = await run_travel_agency(query)
        all_tool_calls.append({
            "query": query,
            "tools_used": tool_calls,
            "tool_count": len(tool_calls),
        })

        if i < count - 1:
            print(f"\nWaiting {delay} seconds before next query...")
            await sleep(delay)

    print("\n\n" + "=" * 80)
    print("EXECUTION SUMMARY")
    print("=" * 80)
    print(f"Total queries executed: {len(all_tool_calls)}")

    tool_usage: dict[str, int] = {}
    for result in all_tool_calls:
        for tool in result["tools_used"]:
            tool_usage[tool] = tool_usage.get(tool, 0) + 1

    print("\nTool usage statistics:")
    for tool, tool_count in sorted(tool_usage.items(), key=lambda x: -x[1]):
        print(f"  - {tool}: {tool_count} times")

    print("\nTrajectory variation:")
    unique_trajectories = len(set(json.dumps(r["tools_used"]) for r in all_tool_calls))
    print(f"  - Unique tool call sequences: {unique_trajectories}/{len(all_tool_calls)}")

    avg_tools = sum(r["tool_count"] for r in all_tool_calls) / len(all_tool_calls)
    print(f"  - Average tools per query: {avg_tools:.2f}")

    print("\n" + "=" * 80)
    print("Travel Agent demo completed successfully!")
    print("All spans captured by OpenTelemetry instrumentation")
    print("=" * 80)


def run():
    """Entry point for the script."""
    asyncio.run(main())


if __name__ == "__main__":
    run()

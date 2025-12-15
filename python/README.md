# Travel Planning Agent (Python)

A travel planning AI agent built with OpenAI's Python SDK and Traceloop for observability. This agent creates detailed travel itineraries using real-world APIs.

## Features

- **6 Tools** for comprehensive travel planning:
  - `search_destinations` - Find destinations by region using REST Countries API
  - `get_location_coordinates` - Get coordinates via Nominatim/OpenStreetMap
  - `get_weather_forecast` - 7-day forecasts from Open-Meteo API
  - `get_destination_info` - Destination details from Wikipedia
  - `calculate_travel_distance` - Distance and flight time calculations
  - `create_itinerary` - AI-generated day-by-day itineraries

- **OpenTelemetry Integration** via Traceloop SDK for full observability
- **Structured Output** using Pydantic models for type-safe itineraries
- **Async Architecture** for efficient API calls

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) package manager
- OpenAI API key
- Traceloop API key (optional, for observability)

## Setup

```bash
# Install dependencies
uv sync

# Set environment variables
export OPENAI_API_KEY="your-openai-api-key"
export TRACELOOP_API_KEY="your-traceloop-api-key"  # Optional
```

## Usage

```bash
# Run a single query
uv run ai-sdk-agent

# Run multiple queries
uv run ai-sdk-agent --count 5

# Customize delay between queries
uv run ai-sdk-agent --count 3 --delay 3.0

# Or run directly
uv run python ai_sdk_agent.py --count 1
```

## Example Queries

The agent handles various request types:

- **Specific**: "Plan a 7-day luxury trip to Tokyo for couples interested in food"
- **Broad**: "I want to explore Europe in summer. Find good destinations"
- **Vague**: "I need a vacation. I like history. Plan something for me"
- **Comparison**: "Should I visit Paris or Rome? Compare and create an itinerary"

## Output

The agent produces structured itineraries including:

- Trip title and overview
- Day-by-day activities with times and locations
- Meal recommendations
- Accommodation suggestions
- Travel tips
- Packing suggestions

## Architecture

```
User Query → GPT-4o Agent → Tool Calls → External APIs → Structured Itinerary
                  ↓
           Traceloop (OpenTelemetry spans)
```

## License

Apache 2.0

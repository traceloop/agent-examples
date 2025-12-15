# Travel Planning Agent (TypeScript)

A travel planning AI agent built with Vercel AI SDK and Traceloop for observability. This agent creates detailed travel itineraries using real-world APIs.

## Features

- **6 Tools** for comprehensive travel planning:
  - `search_destinations` - Find destinations by region using REST Countries API
  - `get_location_coordinates` - Get coordinates via Nominatim/OpenStreetMap
  - `get_weather_forecast` - 7-day forecasts from Open-Meteo API
  - `get_destination_info` - Destination details from Wikipedia
  - `calculate_travel_distance` - Distance and flight time calculations
  - `create_itinerary` - AI-generated day-by-day itineraries

- **OpenTelemetry Integration** via Traceloop SDK for full observability
- **Structured Output** using Zod schemas for type-safe itineraries
- **Vercel AI SDK** for streamlined tool calling and agent loops

## Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key
- Traceloop API key (optional, for observability)

## Setup

```bash
# Install dependencies
npm install

# Set environment variables
export OPENAI_API_KEY="your-openai-api-key"
export TRACELOOP_API_KEY="your-traceloop-api-key"  # Optional
```

## Usage

```bash
# Development mode (with tsx)
npm run dev

# Build and run
npm run build
npm start

# Run with arguments
npm run dev -- --count 5 --delay 3
```

### Command Line Arguments

- `--count <n>` - Number of travel queries to run (default: 1)
- `--delay <seconds>` - Delay between queries (default: 2.0)

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

## Project Structure

```
typescript/
├── index.ts          # Main agent implementation
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Key Dependencies

- `ai` - Vercel AI SDK for agent orchestration
- `@ai-sdk/openai` - OpenAI provider for Vercel AI SDK
- `@traceloop/node-server-sdk` - OpenTelemetry instrumentation
- `zod` - Schema validation and type inference

## License

Apache 2.0

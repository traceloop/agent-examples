# Agent Examples

Example AI agent implementations demonstrating tool calling, observability, and structured outputs across different languages and frameworks.

## Overview

This repository contains travel planning agents that showcase:

- **Multi-tool orchestration** - Agents that chain multiple API calls
- **Real-world API integration** - REST Countries, Open-Meteo, Nominatim, Wikipedia
- **Structured outputs** - Type-safe itinerary generation
- **OpenTelemetry observability** - Full tracing via Traceloop SDK

## Examples

| Language | Framework | Directory |
|----------|-----------|-----------|
| TypeScript | Vercel AI SDK | [typescript/](typescript/) |
| Python | OpenAI SDK | [python/](python/) |

## Quick Start

### TypeScript

```bash
cd typescript
npm install
export OPENAI_API_KEY="your-key"
npm run dev
```

### Python

```bash
cd python
uv sync
export OPENAI_API_KEY="your-key"
uv run ai-sdk-agent
```

## Agent Architecture

Both implementations follow the same pattern:

```
User Query → LLM Agent → Tool Calls → External APIs → Structured Response
                 ↓
          OpenTelemetry Traces
```

### Available Tools

| Tool | Description | API |
|------|-------------|-----|
| `search_destinations` | Find countries by region | REST Countries |
| `get_location_coordinates` | Geocode locations | Nominatim/OSM |
| `get_weather_forecast` | 7-day weather forecast | Open-Meteo |
| `get_destination_info` | Destination summaries | Wikipedia |
| `calculate_travel_distance` | Distance & flight time | Haversine formula |
| `create_itinerary` | Generate day-by-day plans | OpenAI |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o |
| `TRACELOOP_API_KEY` | No | Traceloop API key for observability |

## Example Output

The agents produce structured itineraries including:

- Trip title and destination overview
- Day-by-day activities with times and locations
- Restaurant and meal recommendations
- Accommodation suggestions
- Destination-specific travel tips
- Weather-appropriate packing lists

## License

Apache 2.0

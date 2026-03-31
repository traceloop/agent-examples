# Agent Examples

Example AI agent implementations demonstrating tool calling, observability, and structured outputs across different languages and frameworks.

## Overview

This repository contains AI agent examples demonstrating:

- **Multi-agent orchestration** - Sequential agent handoffs and hierarchical workflows
- **Tool selection diversity** - 40+ tools with overlapping capabilities for training evaluation
- **Real-world API integration** - News, Wikipedia, arXiv, Serper, REST Countries, Open-Meteo
- **Structured outputs** - Type-safe data contracts using Zod/Pydantic schemas
- **OpenTelemetry observability** - Complete span hierarchy via Traceloop SDK
- **Agent reasoning analysis** - Capture tool selection decisions and LLM reasoning

## Examples

| Example | Language | Framework | Tools | Agents | Directory |
|---------|----------|-----------|-------|---------|-----------|
| Travel Planning | TypeScript | Vercel AI SDK | 6 | 1 | [typescript/ai_sdk_agent.ts](typescript/ai_sdk_agent.ts) |
| **Content Creation Pipeline** | **TypeScript** | **Vercel AI SDK** | **40** | **5** | **[typescript/content_pipeline_agent.ts](typescript/content_pipeline_agent.ts)** |
| Travel Planning | Python | OpenAI Agents SDK | 6 | 1 | [python/travel_agent.py](python/travel_agent.py) |
| Research Assistant | Python | LangGraph | 5 | 1 | [python/research_assistant.py](python/research_assistant.py) |

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

## Agent Architectures

### Single Agent (Travel Planning)

```
User Query → LLM Agent → Tool Calls → External APIs → Structured Response
                 ↓
          OpenTelemetry Traces
```

### Multi-Agent Pipeline (Content Creation)

```
Topic Request → Orchestrator Agent (6 tools)
                      ↓
                Research Agent (8 tools) → News/Wikipedia/arXiv APIs
                      ↓
                Writer Agent (7 tools) → GPT-4o Article Draft
                      ↓
                Editor Agent (9 tools) → Readability/Grammar Checks
                      ↓
                SEO Agent (10 tools) → Keywords/Meta Tags
                      ↓
                Final Article (Publication-Ready)

All phases instrumented with OpenTelemetry for span hierarchy analysis
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
| `NEWS_API_KEY` | No | NewsAPI.org key (Content Pipeline only) |
| `SERPER_API_KEY` | No | Serper API key for SEO tools (Content Pipeline only) |

## Example Outputs

### Travel Planning Agents

Structured itineraries including:
- Trip title and destination overview
- Day-by-day activities with times and locations
- Restaurant and meal recommendations
- Accommodation suggestions
- Destination-specific travel tips
- Weather-appropriate packing lists

### Content Creation Pipeline

Publication-ready articles including:
- Comprehensive research from multiple sources (news, academic, encyclopedia)
- Well-structured article with markdown formatting
- Inline citations and bibliography
- Readability metrics (Flesch-Kincaid, Gunning Fog)
- SEO metadata (title tags, meta descriptions, keywords)
- Open Graph tags for social sharing
- Internal link suggestions

## Training & Evaluation Use Cases

The Content Creation Pipeline is designed for training agent models on:

1. **Tool Selection Efficiency** - Agents choose from 40+ tools with overlapping capabilities
2. **Reasoning Quality** - LLM reasoning spans capture decision-making process
3. **Answer Correctness** - Quality metrics validate output accuracy
4. **Workflow Optimization** - Compare tool sequences across different runs
5. **Error Recovery** - Track how agents handle API failures and missing data

## License

Apache 2.0

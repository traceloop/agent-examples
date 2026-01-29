# TypeScript AI Agent Examples

AI agent examples built with Vercel AI SDK and Traceloop for observability. These agents demonstrate multi-agent orchestration, tool selection, and comprehensive span tracing.

## Examples

### 1. Travel Planning Agent ([ai_sdk_agent.ts](ai_sdk_agent.ts))

A travel planning AI agent that creates detailed travel itineraries using real-world APIs.

### 2. Content Creation Pipeline ([content_pipeline_agent.ts](content_pipeline_agent.ts))

A multi-agent content creation system demonstrating sequential agent handoffs with 40+ tools for training on tool selection efficiency and agent reasoning quality.

## Travel Planning Agent Features

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

## Content Creation Pipeline Features

- **5 Sequential Agents** with distinct responsibilities:
  - **Orchestrator Agent** (6 tools) - Topic analysis and pipeline configuration
  - **Research Agent** (8 tools) - Multi-source information gathering
  - **Writer Agent** (7 tools) - Article drafting with multiple strategies
  - **Editor Agent** (9 tools) - Quality improvement and readability optimization
  - **SEO Agent** (10 tools) - Search engine optimization and metadata generation

- **40 Total Tools** demonstrating tool selection diversity:
  - Multiple overlapping capabilities per phase (e.g., shallow vs. deep analysis)
  - Different quality/speed tradeoffs (e.g., GPT-4o vs. GPT-4o-mini)
  - API-based vs. local tools (e.g., Serper vs. NLP extraction)

- **Real-World APIs**:
  - NewsAPI.org, NewsData.io (news articles)
  - Wikipedia REST API (encyclopedia content)
  - DuckDuckGo Instant Answer API (quick facts)
  - arXiv API (academic papers)
  - Serper API (Google Search & Scholar)
  - LanguageTool API (grammar checking)

- **Training-Optimized Design**:
  - Clear tool selection decision points
  - Agent reasoning captured in LLM spans
  - Comparative tool performance metrics
  - Sequential workflow for clear span hierarchy

- **Comprehensive Span Hierarchy**:
  ```
  workflow.content_creation_pipeline
  ├── task.topic_analysis (Orchestrator)
  ├── task.research_phase (Research Agent)
  ├── task.writing_phase (Writer Agent)
  ├── task.editing_phase (Editor Agent)
  └── task.seo_optimization_phase (SEO Agent)
  ```

## Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key
- Traceloop API key (optional, for observability)

### Optional API Keys (for Content Pipeline):
- `NEWS_API_KEY` - NewsAPI.org (100 requests/day free)
- `SERPER_API_KEY` - Serper API (2,500 queries free)

## Setup

```bash
# Install dependencies
npm install

# Set environment variables
export OPENAI_API_KEY="your-openai-api-key"
export TRACELOOP_API_KEY="your-traceloop-api-key"  # Optional
export TRACELOOP_BASE_URL="https://api.traceloop.dev"
```

## Usage

### Travel Planning Agent

```bash
# Development mode (with tsx)
npm run dev

# Run with arguments
npx tsx ai_sdk_agent.ts --count 5 --delay 3
```

### Content Creation Pipeline

```bash
# Run content pipeline
npx tsx content_pipeline_agent.ts

# Run multiple queries
npx tsx content_pipeline_agent.ts --count 3
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

## Example Queries (Content Pipeline)

- "Recent developments in quantum computing"
- "A beginner's guide to TypeScript decorators"
- "How remote work affects team productivity"
- "The science behind climate change"

## Project Structure

```
typescript/
├── ai_sdk_agent.ts           # Travel planning agent (6 tools)
├── content_pipeline_agent.ts # Content pipeline (40 tools, 5 agents)
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## Key Dependencies

- `ai` - Vercel AI SDK for agent orchestration
- `@ai-sdk/openai` - OpenAI provider for Vercel AI SDK
- `@traceloop/node-server-sdk` - OpenTelemetry instrumentation
- `zod` - Schema validation and type inference

## License

Apache 2.0

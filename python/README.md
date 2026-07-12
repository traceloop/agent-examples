# AI Agent Examples (Python)

Three examples demonstrating different agent frameworks and chat patterns with OpenTelemetry instrumentation via Traceloop:

1. **Travel Planning Agent** - OpenAI Agents SDK
2. **Research Assistant Agent** - LangGraph
3. **Cooking Assistant Chat** - interactive chat where each message is a trace

The agents use real-world APIs and are designed for debugging and testing observability instrumentation.

## 1. Travel Planning Agent (OpenAI Agents SDK)

### Features

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

### Usage

```bash
# Run a single query
uv run python travel_agent.py

# Run multiple queries
uv run python travel_agent.py --count 5

# Customize delay between queries
uv run python travel_agent.py --count 3 --delay 3.0
```

### Example Queries

- **Specific**: "Plan a 7-day luxury trip to Tokyo for couples interested in food"
- **Broad**: "I want to explore Europe in summer. Find good destinations"
- **Vague**: "I need a vacation. I like history. Plan something for me"
- **Comparison**: "Should I visit Paris or Rome? Compare and create an itinerary"

## 2. Research Assistant Agent (LangGraph)

### Features

- **5 Tools** for comprehensive research:
  - `web_search` - DuckDuckGo search for current information
  - `analyze_content` - Multi-type content analysis (summary, sentiment, technical)
  - `extract_data` - Structured data extraction (facts, numbers, dates, entities)
  - `compare_sources` - Source comparison and agreement/disagreement analysis
  - `generate_report` - Formatted research reports (markdown, JSON, text)

- **Complex State Management** with LangGraph StateGraph
- **Conditional Routing** based on iteration count and research depth
- **Memory Checkpointing** for workflow persistence
- **Multi-step Reasoning** with iterative refinement

### Usage

```bash
# Run with random research queries
uv run python research_assistant.py --count 3

# Run a specific query
uv run python research_assistant.py --query "What are the latest developments in quantum computing?"

# Customize delay between queries
uv run python research_assistant.py --count 5 --delay 2.0
```

### Example Queries

- **Information**: "What are the latest developments in artificial intelligence?"
- **Comparison**: "Compare Python and JavaScript for web development"
- **Analysis**: "Analyze the impact of social media on mental health"
- **Technical**: "Explain how blockchain technology works and its applications"

### Architecture

```
User Query → StateGraph → Agent Node (decides action)
                            ↓
                    Conditional Router
                    ↓            ↓
              Tool Node    Summarize Node
                    ↓            ↓
              Back to Agent    Final Output
```

## 3. Cooking Assistant Chat (per-message tracing)

An interactive, human-in-the-loop chat with a friendly cooking assistant. Unlike the two batch
agents above, this is a REPL: you type messages and the bot replies turn-by-turn.

### Features

- **Interactive REPL** — chat with the bot from your terminal.
- **Each message is its own trace** — every user↔bot exchange is wrapped in a Traceloop
  `@workflow` (`chat_turn`), so it appears as a separate root trace, with the OpenAI completion
  captured as a child span. Turns are tagged with a `conversation_id` so a session's traces group
  together.
- **Conversation memory** — history is threaded across turns.
- **Exit command** — type `exit` (or `quit` / `bye` / `:q`), or press Ctrl-C / Ctrl-D, to leave.

### Usage

```bash
uv run python cooking_chat.py
# or, via the script entry:
uv run cooking-chat
```

Then chat, for example:

```
you  > what can I make with chickpeas and spinach?
chef > ...
you  > make it vegetarian and quicker
chef > ...
you  > exit
```

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) package manager
- OpenAI API key
- Traceloop API key (optional, for observability)

## Setup

```bash
# Install dependencies
uv sync

# Set environment variables (or create .env file)
export OPENAI_API_KEY="your-openai-api-key"
export TRACELOOP_API_KEY="your-traceloop-api-key"  # Optional
```

## Quick Start

```bash
# Run travel planning agent
uv run python travel_agent.py --count 3

# Run research assistant agent
uv run python research_assistant.py --count 3

# Run with custom query
uv run python research_assistant.py --query "Your research question"
```

## Comparison: OpenAI Agents SDK vs LangGraph

| Feature | OpenAI Agents SDK | LangGraph |
|---------|-------------------|-----------|
| **Complexity** | Simpler, higher-level API | More control, lower-level |
| **State Management** | Automatic via Runner | Manual StateGraph definition |
| **Routing** | Model-driven tool selection | Conditional edges & custom logic |
| **Streaming** | Built-in event streaming | Stream through graph execution |
| **Use Case** | Rapid prototyping, simpler flows | Complex workflows, fine control |
| **Span Structure** | Linear tool call hierarchy | Graph-based nested spans |

## Observability

Both agents are instrumented with OpenTelemetry via Traceloop SDK, capturing:

- Tool invocations and parameters
- API calls to external services
- Model completions and token usage
- State transitions (LangGraph)
- Error handling and retries
- End-to-end latency

This makes them ideal for testing and debugging observability systems.

## License

Apache 2.0

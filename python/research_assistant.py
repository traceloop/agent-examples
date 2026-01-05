#!/usr/bin/env python3
"""
Research Assistant Agent using LangGraph.

This agent demonstrates a complex LangGraph workflow with:
- Multiple tools (web search, document analysis, data processing)
- Complex state management
- Conditional routing
- Multi-step reasoning

Designed for debugging and testing OpenTelemetry instrumentation.
"""

import asyncio
import argparse
import json
import random
import time
from typing import Annotated, Literal, TypedDict, List, Dict, Any
from operator import add

from dotenv import load_dotenv
from traceloop.sdk import Traceloop

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END, START
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

# For web search
from ddgs import DDGS

load_dotenv()

Traceloop.init(
    app_name="research-assistant-langgraph",
    disable_batch=False,
)


# ============================================================================
# State Definition
# ============================================================================

class ResearchState(TypedDict):
    """State for the research assistant agent."""
    messages: Annotated[List[BaseMessage], add]
    research_topic: str
    search_results: List[Dict[str, Any]]
    analyzed_content: List[Dict[str, Any]]
    summary: str
    confidence_score: float
    iteration_count: int
    next_action: str


# ============================================================================
# Tools
# ============================================================================

@tool
def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web using DuckDuckGo for current information.

    Args:
        query: The search query
        max_results: Maximum number of results to return (default: 5)

    Returns:
        JSON string with search results including titles, snippets, and URLs
    """
    print(f"[Tool: web_search] Searching for: '{query}'")

    try:
        time.sleep(0.5)  # Rate limiting

        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))

        formatted_results = []
        for i, result in enumerate(results[:max_results], 1):
            formatted_results.append({
                "rank": i,
                "title": result.get("title", ""),
                "snippet": result.get("body", ""),
                "url": result.get("href", ""),
            })

        return json.dumps(formatted_results, indent=2)

    except Exception as e:
        print(f"[Tool: web_search] Error: {str(e)}")
        return json.dumps({"error": f"Search failed: {str(e)}"})


@tool
def analyze_content(content: str, analysis_type: str = "summary") -> str:
    """
    Analyze content with specified analysis type.

    Args:
        content: The content to analyze
        analysis_type: Type of analysis - "summary", "key_points", "sentiment", or "technical"

    Returns:
        Analysis results as JSON string
    """
    print(f"[Tool: analyze_content] Analyzing content (type: {analysis_type})")

    try:
        time.sleep(0.3)  # Simulate processing

        # In a real implementation, this would use NLP/ML models
        # For demo purposes, we'll return structured mock analysis

        analysis = {
            "analysis_type": analysis_type,
            "content_length": len(content),
            "word_count": len(content.split()),
        }

        if analysis_type == "summary":
            # Extract first few sentences as summary
            sentences = content.split(". ")[:3]
            analysis["summary"] = ". ".join(sentences) + "."

        elif analysis_type == "key_points":
            # Mock key point extraction
            analysis["key_points"] = [
                "Primary concept discussed in content",
                "Supporting details and evidence",
                "Conclusions or implications",
            ]

        elif analysis_type == "sentiment":
            # Mock sentiment analysis
            analysis["sentiment"] = {
                "overall": "neutral",
                "confidence": 0.75,
                "positive_score": 0.5,
                "negative_score": 0.2,
                "neutral_score": 0.3,
            }

        elif analysis_type == "technical":
            # Mock technical analysis
            analysis["technical_level"] = "intermediate"
            analysis["topics"] = ["technology", "research", "development"]
            analysis["complexity_score"] = 6.5

        return json.dumps(analysis, indent=2)

    except Exception as e:
        print(f"[Tool: analyze_content] Error: {str(e)}")
        return json.dumps({"error": f"Analysis failed: {str(e)}"})


@tool
def extract_data(text: str, data_type: str = "facts") -> str:
    """
    Extract structured data from unstructured text.

    Args:
        text: The text to extract data from
        data_type: Type of data to extract - "facts", "numbers", "dates", or "entities"

    Returns:
        Extracted data as JSON string
    """
    print(f"[Tool: extract_data] Extracting {data_type} from text")

    try:
        time.sleep(0.2)

        extraction = {
            "data_type": data_type,
            "source_length": len(text),
        }

        if data_type == "facts":
            extraction["facts"] = [
                "Fact 1 extracted from content",
                "Fact 2 extracted from content",
                "Fact 3 extracted from content",
            ]
            extraction["count"] = 3

        elif data_type == "numbers":
            # Mock number extraction
            extraction["numbers"] = [
                {"value": 42, "context": "percentage increase"},
                {"value": 2024, "context": "year"},
                {"value": 1000000, "context": "user count"},
            ]
            extraction["count"] = 3

        elif data_type == "dates":
            extraction["dates"] = [
                {"date": "2024-01-15", "context": "launch date"},
                {"date": "2024-06-30", "context": "deadline"},
            ]
            extraction["count"] = 2

        elif data_type == "entities":
            extraction["entities"] = {
                "people": ["John Doe", "Jane Smith"],
                "organizations": ["TechCorp", "ResearchLab"],
                "locations": ["San Francisco", "New York"],
            }
            extraction["total_count"] = 6

        return json.dumps(extraction, indent=2)

    except Exception as e:
        print(f"[Tool: extract_data] Error: {str(e)}")
        return json.dumps({"error": f"Extraction failed: {str(e)}"})


@tool
def compare_sources(source1: str, source2: str) -> str:
    """
    Compare two information sources and identify agreements/disagreements.

    Args:
        source1: First source content
        source2: Second source content

    Returns:
        Comparison analysis as JSON string
    """
    print(f"[Tool: compare_sources] Comparing two sources")

    try:
        time.sleep(0.4)

        comparison = {
            "source1_length": len(source1),
            "source2_length": len(source2),
            "agreements": [
                "Both sources agree on core concepts",
                "Consistent data points found",
            ],
            "disagreements": [
                "Different perspectives on implementation",
                "Varying emphasis on importance",
            ],
            "unique_to_source1": [
                "Additional context in source 1",
            ],
            "unique_to_source2": [
                "Extra details in source 2",
            ],
            "similarity_score": 0.73,
            "reliability_assessment": "Both sources appear credible",
        }

        return json.dumps(comparison, indent=2)

    except Exception as e:
        print(f"[Tool: compare_sources] Error: {str(e)}")
        return json.dumps({"error": f"Comparison failed: {str(e)}"})


@tool
def generate_report(topic: str, findings: str, format_type: str = "markdown") -> str:
    """
    Generate a formatted research report from findings.

    Args:
        topic: The research topic
        findings: The research findings to include
        format_type: Output format - "markdown", "json", or "text"

    Returns:
        Formatted report as string
    """
    print(f"[Tool: generate_report] Generating {format_type} report for: {topic}")

    try:
        time.sleep(0.3)

        if format_type == "markdown":
            report = f"""# Research Report: {topic}

## Executive Summary
Comprehensive research findings on {topic}.

## Key Findings
{findings}

## Methodology
- Web search and source analysis
- Multi-source verification
- Data extraction and comparison

## Conclusion
Research completed successfully with high confidence.

---
*Generated by Research Assistant Agent*
"""

        elif format_type == "json":
            report = json.dumps({
                "title": f"Research Report: {topic}",
                "summary": f"Comprehensive research findings on {topic}",
                "findings": findings,
                "methodology": ["Web search", "Source analysis", "Data extraction"],
                "confidence": 0.85,
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            }, indent=2)

        else:  # text
            report = f"""RESEARCH REPORT: {topic}
{'='*60}

Findings:
{findings}

Methodology: Web search, source analysis, data extraction
Confidence: High

Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}
"""

        return report

    except Exception as e:
        print(f"[Tool: generate_report] Error: {str(e)}")
        return f"Error generating report: {str(e)}"


# ============================================================================
# Agent Nodes
# ============================================================================

def should_continue(state: ResearchState) -> Literal["tools", "summarize", "end"]:
    """
    Determine the next step based on the current state.

    This creates complex conditional routing in the LangGraph.
    """
    messages = state["messages"]
    last_message = messages[-1] if messages else None

    # Check iteration limit first (max 3 research iterations)
    if state.get("iteration_count", 0) >= 3:
        print("[Router] Max iterations reached, moving to summarize")
        return "summarize"

    # Check if the last message has tool calls
    if last_message and hasattr(last_message, "tool_calls") and last_message.tool_calls:
        print(f"[Router] Tool calls detected: {len(last_message.tool_calls)} tools")
        return "tools"

    # If last message is an AI message without tool calls, we're done
    if isinstance(last_message, AIMessage) and not (hasattr(last_message, "tool_calls") and last_message.tool_calls):
        print("[Router] AI response without tool calls, moving to summarize")
        return "summarize"

    # Default: continue research
    print("[Router] Continue research, moving to summarize")
    return "summarize"


def research_agent_node(state: ResearchState) -> ResearchState:
    """
    Main agent node that decides what to do next.
    """
    print("\n[Agent Node] Processing research request")

    messages = state["messages"]
    iteration = state.get("iteration_count", 0)

    # Increment iteration counter
    state["iteration_count"] = iteration + 1

    # Create agent with tools
    model = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
    tools = [web_search, analyze_content, extract_data, compare_sources, generate_report]
    model_with_tools = model.bind_tools(tools)

    # Enhanced system message based on iteration
    if iteration == 0:
        system_msg = """You are a research assistant. You MUST use the web_search tool to find current information
about the user's question. Do not answer without searching first."""
    elif iteration == 1:
        system_msg = """You have search results. Now either:
1) Use analyze_content or extract_data to process the information, OR
2) Provide your final answer based on the search results."""
    else:
        system_msg = """Provide your final answer based on all gathered information. Do not use any more tools."""

    # Invoke the model
    response = model_with_tools.invoke([
        {"role": "system", "content": system_msg}
    ] + messages)

    print(f"[Agent Node] Response type: {type(response).__name__}")
    if hasattr(response, "tool_calls") and response.tool_calls:
        print(f"[Agent Node] Tool calls: {[tc['name'] for tc in response.tool_calls]}")

    return {"messages": [response]}


def summarize_node(state: ResearchState) -> ResearchState:
    """
    Summarize the research findings.
    """
    print("\n[Summarize Node] Creating final summary")

    messages = state["messages"]

    # Extract the last AI response (the actual research answer)
    agent_response = ""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content:
            agent_response = msg.content
            break

    # Extract key information from messages
    search_count = sum(1 for m in messages if isinstance(m, ToolMessage) and "web_search" in str(m))
    analysis_count = sum(1 for m in messages if isinstance(m, ToolMessage) and "analyze" in str(m))

    # Display the agent's research answer prominently
    print("\n" + "=" * 80)
    print("RESEARCH ANSWER")
    print("=" * 80)
    print(agent_response if agent_response else "No answer generated")
    print("=" * 80)

    summary_text = f"""
Statistics:
- Total iterations: {state.get('iteration_count', 0)}
- Web searches performed: {search_count}
- Content analyses performed: {analysis_count}
- Total messages exchanged: {len(messages)}

Agent's Answer:
{agent_response if agent_response else "No answer generated"}
"""

    state["summary"] = summary_text
    state["confidence_score"] = 0.85

    final_message = AIMessage(content=summary_text)

    return {
        "messages": [final_message],
        "summary": summary_text,
        "confidence_score": 0.85,
    }


# ============================================================================
# Graph Construction
# ============================================================================

def create_research_graph():
    """
    Create the LangGraph workflow for the research assistant.

    This creates a complex graph with:
    - Agent node (decides what to do)
    - Tool node (executes tools)
    - Summarize node (creates final output)
    - Conditional routing based on state
    """
    workflow = StateGraph(ResearchState)

    # Add nodes
    workflow.add_node("agent", research_agent_node)
    workflow.add_node("tools", ToolNode([web_search, analyze_content, extract_data,
                                          compare_sources, generate_report]))
    workflow.add_node("summarize", summarize_node)

    # Set entry point
    workflow.add_edge(START, "agent")

    # Add conditional routing from agent
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            "summarize": "summarize",
            "end": END,
        }
    )

    # After tools, go back to agent
    workflow.add_edge("tools", "agent")

    # After summarize, end
    workflow.add_edge("summarize", END)

    # Add memory checkpointing
    memory = MemorySaver()

    return workflow.compile(checkpointer=memory)


# ============================================================================
# Query Runner
# ============================================================================

async def run_research_query(query: str, topic: str = "general") -> Dict[str, Any]:
    """
    Run a single research query.

    Args:
        query: The research query from the user
        topic: The research topic category

    Returns:
        Dictionary with results including messages, summary, and stats
    """
    print("=" * 80)
    print(f"Query: {query}")
    print(f"Topic: {topic}")
    print("=" * 80)

    # Create the graph
    graph = create_research_graph()

    # Initial state
    initial_state: ResearchState = {
        "messages": [HumanMessage(content=query)],
        "research_topic": topic,
        "search_results": [],
        "analyzed_content": [],
        "summary": "",
        "confidence_score": 0.0,
        "iteration_count": 0,
        "next_action": "",
    }

    # Run the graph (recursion_limit=20 allows 3 iterations with safety margin)
    config = {
        "configurable": {"thread_id": f"research_{int(time.time())}"},
        "recursion_limit": 20
    }

    print("\n[Graph Execution] Starting research workflow...")
    print("-" * 80)

    final_state = None
    step_count = 0

    # Stream the graph execution
    for state in graph.stream(initial_state, config):
        step_count += 1
        node_name = list(state.keys())[0]
        print(f"\n[Step {step_count}] Node: {node_name}")
        final_state = state[node_name]

    print("\n" + "-" * 80)
    print("[Graph Execution] Research workflow completed")

    # Extract results
    messages = final_state.get("messages", [])
    summary = final_state.get("summary", "")
    confidence = final_state.get("confidence_score", 0.0)
    iterations = final_state.get("iteration_count", 0)

    # Count tool usage
    tool_usage = {}
    for msg in messages:
        if isinstance(msg, ToolMessage):
            # Extract tool name from message
            content_str = str(msg)
            for tool_name in ["web_search", "analyze_content", "extract_data",
                             "compare_sources", "generate_report"]:
                if tool_name in content_str:
                    tool_usage[tool_name] = tool_usage.get(tool_name, 0) + 1

    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(f"✅ Research completed in {iterations} iterations")
    print(f"📊 Confidence score: {confidence:.2f}")
    print(f"🔧 Tools used: {', '.join(tool_usage.keys()) if tool_usage else 'None'}")
    print(f"💬 Total messages: {len(messages)}")
    if summary:
        print(f"\n📝 Summary:\n{summary}")
    print("=" * 80 + "\n")

    return {
        "query": query,
        "topic": topic,
        "messages": messages,
        "summary": summary,
        "confidence_score": confidence,
        "iteration_count": iterations,
        "tool_usage": tool_usage,
        "total_messages": len(messages),
    }


# ============================================================================
# Query Generator
# ============================================================================

def generate_research_queries(n: int = 5) -> List[tuple[str, str]]:
    """
    Generate diverse research queries for testing.

    Returns:
        List of (query, topic) tuples
    """
    queries = [
        # Simple information requests
        ("What are the latest developments in artificial intelligence?", "technology"),
        ("Explain the concept of quantum computing", "science"),
        ("What is the current state of renewable energy?", "environment"),

        # Comparative analysis requests
        ("Compare Python and JavaScript for web development", "programming"),
        ("What are the differences between machine learning and deep learning?", "ai"),

        # Data extraction requests
        ("Find statistics on global electric vehicle adoption", "automotive"),
        ("What are the key metrics for measuring software performance?", "engineering"),

        # Multi-step research requests
        ("Research the history of the internet and identify key milestones", "history"),
        ("Analyze the impact of social media on mental health and summarize findings", "health"),

        # Complex synthesis requests
        ("Research climate change solutions and evaluate their effectiveness", "environment"),
        ("Compare different programming paradigms and their use cases", "programming"),
        ("Analyze the evolution of remote work and its future trends", "business"),

        # Technical deep-dives
        ("Explain how blockchain technology works and its applications beyond cryptocurrency", "technology"),
        ("Research the latest advancements in battery technology for electric vehicles", "science"),
        ("What are the best practices for building scalable microservices?", "architecture"),

        # Trend analysis
        ("What are the emerging trends in cybersecurity for 2024?", "security"),
        ("Analyze the current state of the job market in software engineering", "careers"),
        ("Research the future of artificial general intelligence (AGI)", "ai"),

        # Problem-solution requests
        ("What are effective strategies for reducing carbon emissions in urban areas?", "environment"),
        ("How can businesses improve their customer experience using AI?", "business"),
    ]

    # Return random sample
    return random.sample(queries, min(n, len(queries)))


# ============================================================================
# Main Entry Point
# ============================================================================

async def main():
    """Main entry point for the research assistant application."""

    parser = argparse.ArgumentParser(description="Research Assistant Agent Demo with LangGraph")
    parser.add_argument(
        "--count",
        type=int,
        default=3,
        help="Number of queries to run (default: 3)"
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=2.0,
        help="Delay between queries in seconds (default: 2.0)"
    )
    parser.add_argument(
        "--query",
        type=str,
        help="Run a specific query instead of random ones"
    )

    args = parser.parse_args()

    print("=" * 80)
    print("Research Assistant Agent with LangGraph")
    print("=" * 80)
    print(f"Framework: LangGraph + LangChain + OpenAI")
    print(f"Tools: web_search, analyze_content, extract_data, compare_sources, generate_report")
    print(f"Features: State management, conditional routing, checkpointing")
    print("=" * 80)
    print()

    # Run specific query or multiple random queries
    if args.query:
        await run_research_query(args.query, "custom")
    else:
        queries = generate_research_queries(args.count)

        all_results = []
        for i, (query, topic) in enumerate(queries, 1):
            print(f"\n\n{'#' * 80}")
            print(f"# Research Request {i} of {len(queries)}")
            print(f"{'#' * 80}\n")

            result = await run_research_query(query, topic)
            all_results.append(result)

            if i < len(queries):
                print(f"\nWaiting {args.delay} seconds before next query...")
                time.sleep(args.delay)

        # Summary statistics
        print("\n\n" + "=" * 80)
        print("EXECUTION SUMMARY")
        print("=" * 80)
        print(f"Total queries executed: {len(all_results)}")

        # Aggregate tool usage
        total_tool_usage = {}
        for result in all_results:
            for tool, count in result["tool_usage"].items():
                total_tool_usage[tool] = total_tool_usage.get(tool, 0) + count

        print("\nTotal tool usage:")
        for tool, count in sorted(total_tool_usage.items(), key=lambda x: x[1], reverse=True):
            print(f"  - {tool}: {count} times")

        avg_iterations = sum(r["iteration_count"] for r in all_results) / len(all_results)
        avg_messages = sum(r["total_messages"] for r in all_results) / len(all_results)
        avg_confidence = sum(r["confidence_score"] for r in all_results) / len(all_results)

        print(f"\nAverage statistics:")
        print(f"  - Iterations per query: {avg_iterations:.2f}")
        print(f"  - Messages per query: {avg_messages:.2f}")
        print(f"  - Confidence score: {avg_confidence:.2f}")

        print("\n" + "=" * 80)
        print("✅ Research Assistant demo completed successfully!")
        print("🔍 All spans captured by OpenTelemetry instrumentation")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())

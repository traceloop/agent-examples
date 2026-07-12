#!/usr/bin/env python3
"""
Interactive Cooking Assistant Chat.

A simple, human-in-the-loop chat example where each user<->bot exchange is its
own Traceloop trace:

- An interactive REPL (input() loop) so a person chats turn-by-turn.
- Every turn (user message -> bot reply) is wrapped in a Traceloop @workflow,
  so each message exchange shows up as a SEPARATE root trace. The nested OpenAI
  completion is auto-instrumented as a child span of that trace.
- Conversation history is threaded across turns so the bot has memory.
- Type an exit command (exit / quit / bye / :q) to leave the chat.

Unlike travel_agent.py and research_assistant.py (batch, auto-instrumentation
only), this example is synchronous and uses the Traceloop @workflow decorator
explicitly to mark the per-message trace boundary.
"""

import uuid

from dotenv import load_dotenv
from openai import OpenAI
from traceloop.sdk import Traceloop
from traceloop.sdk.decorators import workflow

load_dotenv()

Traceloop.init(
    app_name="cooking-chat",
    disable_batch=False,
    # exporter=ConsoleSpanExporter(),  # uncomment to print spans to the console
)

client = OpenAI()

MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """
You are Chef, a warm and knowledgeable cooking assistant.
Help the user with recipes, ingredients, techniques, substitutions, and meal
ideas. Keep answers practical and concise, ask a brief clarifying question when
a request is ambiguous, and suggest substitutions for dietary needs when useful.
Stay focused on cooking and food topics.
""".strip()

EXIT_COMMANDS = {"exit", "quit", "bye", ":q"}


@workflow(name="chat_turn")
def handle_turn(history: list[dict], user_message: str) -> str:
    """Handle a single user->bot exchange.

    Called at the top level (no enclosing span), so each invocation is a root
    span == one trace per message exchange. `history` is mutated in place so the
    conversation accumulates memory across turns.
    """
    history.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *history],
        temperature=0.7,
    )
    reply = response.choices[0].message.content

    history.append({"role": "assistant", "content": reply})
    return reply


def main():
    """Run the interactive cooking chat REPL."""
    conversation_id = uuid.uuid4().hex
    history: list[dict] = []
    turn = 0

    print("🍳 Cooking Assistant — ask me anything about food.")
    print("   Type 'exit' (or quit / bye / :q) to leave.\n")

    while True:
        try:
            user_input = input("you  > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n👋 Bon appétit! Goodbye.")
            break

        if not user_input:
            continue

        if user_input.lower() in EXIT_COMMANDS:
            print("👋 Bon appétit! Goodbye.")
            break

        # Tag every turn of this session so its traces are groupable in Traceloop.
        turn += 1
        Traceloop.set_association_properties(
            {"conversation_id": conversation_id, "turn": turn}
        )

        reply = handle_turn(history, user_input)
        print(f"chef > {reply}\n")


if __name__ == "__main__":
    main()

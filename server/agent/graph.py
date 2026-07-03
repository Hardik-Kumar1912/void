"""
graph.py – Self-healing LangGraph architecture for Coder Buddy.

Pipeline:
    planner ──► architect ──► coder_step ──(DONE)──────────────► END
                                   │ ▲
                                   │ │ (ERROR, retries left)
                                   ▼ │
                             error_handler
                                   │
                                   └──(EXHAUSTED)──► END (graceful fail)
"""

import traceback

from dotenv import load_dotenv
from langchain_core.globals import set_verbose, set_debug
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq.chat_models import ChatGroq
from langgraph.constants import END
from langgraph.graph import StateGraph
from langgraph.prebuilt import create_react_agent

from agent.prompts import (
    planner_prompt,
    architect_prompt,
    coder_system_prompt,
    error_recovery_prompt,
)
from agent.states import Plan, TaskPlan, CoderState
from agent.tools import write_file, read_file, get_current_directory, list_files

_ = load_dotenv(override=True)
set_debug(False)
set_verbose(False)

# ── LLM ───────────────────────────────────────────────────────────────────────

llm = ChatGroq(model="openai/gpt-oss-120b")

# ── Retry wrapper for structured-output LLM calls ─────────────────────────────

def safe_llm_invoke(fn, *, max_retries: int = 3):
    """
    Calls `fn()` up to `max_retries` times.
    `fn` must be a zero-argument callable that returns the LLM response.
    Returns the response or raises the last exception after all retries are exhausted.
    """
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            result = fn()
            if result is None:
                raise ValueError("LLM returned None – likely a JSON parsing failure.")
            return result
        except Exception as exc:
            last_exc = exc
            print(
                f"[safe_llm_invoke] Attempt {attempt}/{max_retries} failed: "
                f"{type(exc).__name__}: {exc}"
            )
    raise last_exc  # propagate after exhausting retries


ALLOWED_CODER_TOOL_NAMES = "read_file, write_file, list_files, get_current_directory"
PROJECT_FILE_PATHS = ("index.html", "styles.css", "script.js")


def is_invalid_tool_call_error(exc: Exception) -> bool:
    message = str(exc)
    return (
        "not in request.tools" in message
        or "tool_use_failed" in message
        or "Tool call validation failed" in message
    )


def project_file_snapshot(max_chars_per_file: int = 12000) -> str:
    parts = []

    for path in PROJECT_FILE_PATHS:
        try:
            content = read_file.run(path)
        except Exception:
            content = ""

        if len(content) > max_chars_per_file:
            content = content[:max_chars_per_file] + "\n/* truncated for context */"

        parts.append(f"--- {path} ---\n{content or '[empty or not created yet]'}")

    return "\n\n".join(parts)


# ── Graph nodes ───────────────────────────────────────────────────────────────

def planner_agent(state: dict) -> dict:
    """Converts user prompt into a structured Plan (with retry)."""
    user_prompt = state["user_prompt"]
    is_revision = state.get("is_revision", False)
    current_files_snapshot = state.get("current_files_snapshot", None)
    resp = safe_llm_invoke(
        lambda: llm.with_structured_output(Plan).invoke(
            planner_prompt(user_prompt, is_revision=is_revision, current_files_snapshot=current_files_snapshot)
        )
    )
    return {"plan": resp}


def architect_agent(state: dict) -> dict:
    """Creates TaskPlan from Plan (with retry)."""
    plan: Plan = state["plan"]
    is_revision = state.get("is_revision", False)
    resp: TaskPlan = safe_llm_invoke(
        lambda: llm.with_structured_output(TaskPlan).invoke(
            architect_prompt(plan=plan.model_dump_json(), is_revision=is_revision)
        )
    )
    resp.plan = plan  # type: ignore[attr-defined]
    print(resp.model_dump_json())
    return {"task_plan": resp}


def coder_step_node(state: dict) -> dict:
    """
    Executes a SINGLE implementation step using a ReAct agent.

    Key behaviours:
    - Initialises CoderState on first entry.
    - Persists message history in CoderState.messages across retries.
    - Wraps the entire ReAct execution in try/except so ANY failure
      (JSON error, tool crash, API timeout, …) is caught and returned as
      `last_error` rather than crashing the graph.
    - Returns status="DONE" when all steps are complete.
    - Returns status="ERROR" when an exception occurs.
    - Returns status="CONTINUE" when a step succeeds and more steps remain.
    """
    coder_state: CoderState = state.get("coder_state")
    is_revision = state.get("is_revision", False)
    if coder_state is None:
        coder_state = CoderState(
            task_plan=state["task_plan"],
            current_step_idx=0,
            max_retries=state.get("max_retries", 3),
        )

    steps = coder_state.task_plan.implementation_steps

    # All steps done?
    if coder_state.current_step_idx >= len(steps):
        return {"coder_state": coder_state, "status": "DONE"}

    current_task = steps[coder_state.current_step_idx]

    # Build the initial message list for this step (only on first attempt, not retries)
    if coder_state.retry_count == 0:
        # Fresh start for this step – read existing file for context
        try:
            existing_content = read_file.run(current_task.filepath)
        except Exception:
            existing_content = ""

        revision_note = (
            "\n⚠️  REVISION MODE: You are editing an existing file. "
            "Read the existing content above carefully. "
            "Preserve all working code not mentioned in the task.\n"
        ) if is_revision else ""

        user_msg_content = (
            f"Task: {current_task.task_description}\n"
            f"File: {current_task.filepath}\n"
            f"Existing content:\n{existing_content}\n"
            f"{revision_note}"
            "Existing project snapshot:\n"
            f"{project_file_snapshot()}\n\n"
            f"Available tools: {ALLOWED_CODER_TOOL_NAMES}.\n"
            "Do not call repo_browser.open_file, repo_browser.list_files, "
            "open_file, edit_file, or any tool not listed above.\n"
            "Use write_file(path, content) to save your changes."
        )
        coder_state.messages = [
            SystemMessage(content=coder_system_prompt(is_revision=is_revision)),
            HumanMessage(content=user_msg_content),
        ]

    coder_tools = [read_file, write_file, list_files, get_current_directory]

    try:
        react_agent = create_react_agent(llm, coder_tools)
        result = None

        for attempt in range(2):
            try:
                result = react_agent.invoke({"messages": coder_state.messages})
                break
            except Exception as exc:
                if not is_invalid_tool_call_error(exc) or attempt == 1:
                    raise

                coder_state.messages = list(coder_state.messages) + [
                    SystemMessage(
                        content=(
                            "The previous model response attempted to call a tool "
                            "that is not available in this app. Retry now using only "
                            f"these exact tool names: {ALLOWED_CODER_TOOL_NAMES}. "
                            "Do not call repo_browser.open_file or any repo_browser tool."
                        )
                    )
                ]

        if result is None:
            raise RuntimeError("Coder agent returned no result.")

        # Persist updated message history for potential future retries / context
        coder_state.messages = result["messages"]

        # Step succeeded – advance and reset retry counter
        coder_state.current_step_idx += 1
        coder_state.retry_count = 0
        coder_state.last_error = None

        remaining = len(steps) - coder_state.current_step_idx
        status = "DONE" if remaining == 0 else "CONTINUE"
        return {"coder_state": coder_state, "status": status}

    except Exception as exc:
        error_detail = (
            f"{type(exc).__name__}: {exc}\n"
            f"{traceback.format_exc()}"
        )
        print(f"\n[coder_step] Step {coder_state.current_step_idx} FAILED:\n{error_detail}")
        coder_state.last_error = error_detail
        return {"coder_state": coder_state, "status": "ERROR"}


def error_handler_node(state: dict) -> dict:
    """
    Handles a failed coder step.

    - If retries remain: increments retry_count, injects the error as a
      SystemMessage into the message history, and routes back to coder_step.
    - If retries are exhausted: marks status="FAILED" so the graph exits cleanly.
    """
    coder_state: CoderState = state["coder_state"]
    error_msg = coder_state.last_error or "Unknown error"
    steps = coder_state.task_plan.implementation_steps
    current_task = steps[coder_state.current_step_idx]

    if coder_state.retry_count < coder_state.max_retries:
        coder_state.retry_count += 1
        attempt_label = f"Retry {coder_state.retry_count}/{coder_state.max_retries}"
        print(f"\n[error_handler] {attempt_label} for step {coder_state.current_step_idx}: "
              f"{current_task.filepath}")

        # Inject a recovery instruction so the LLM knows exactly what went wrong
        recovery_msg = SystemMessage(
            content=error_recovery_prompt(
                error=error_msg,
                step_description=current_task.task_description,
            )
        )
        coder_state.messages = list(coder_state.messages) + [recovery_msg]
        return {"coder_state": coder_state, "status": "RETRY"}

    else:
        print(
            f"\n[error_handler] Max retries ({coder_state.max_retries}) exhausted "
            f"for step {coder_state.current_step_idx} ({current_task.filepath}). "
            "Marking run as FAILED."
        )
        return {"coder_state": coder_state, "status": "FAILED"}


# ── Routing logic ─────────────────────────────────────────────────────────────

def route_after_coder(state: dict) -> str:
    """
    Routes from coder_step_node based on status:
      DONE     → END
      CONTINUE → coder_step   (next implementation step)
      ERROR    → error_handler
    """
    status = state.get("status", "")
    if status == "DONE":
        return "END"
    if status == "ERROR":
        return "error_handler"
    return "coder_step"  # CONTINUE


def route_after_error_handler(state: dict) -> str:
    """
    Routes from error_handler_node based on status:
      RETRY  → coder_step   (re-run the same step with injected error context)
      FAILED → END          (retries exhausted, exit gracefully)
    """
    status = state.get("status", "")
    if status == "RETRY":
        return "coder_step"
    return "END"  # FAILED


# ── Graph assembly ────────────────────────────────────────────────────────────

graph = StateGraph(dict)

graph.add_node("planner", planner_agent)
graph.add_node("architect", architect_agent)
graph.add_node("coder_step", coder_step_node)
graph.add_node("error_handler", error_handler_node)

graph.set_entry_point("planner")

graph.add_edge("planner", "architect")
graph.add_edge("architect", "coder_step")

graph.add_conditional_edges(
    "coder_step",
    route_after_coder,
    {
        "END": END,
        "coder_step": "coder_step",
        "error_handler": "error_handler",
    },
)

graph.add_conditional_edges(
    "error_handler",
    route_after_error_handler,
    {
        "coder_step": "coder_step",
        "END": END,
    },
)

agent = graph.compile()

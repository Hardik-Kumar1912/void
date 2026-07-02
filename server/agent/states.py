from typing import Optional, Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field, ConfigDict


class File(BaseModel):
    path: str = Field(description="The path to the file to be created or modified")
    purpose: str = Field(
        description="The purpose of the file, e.g. 'main application logic', 'data processing module', etc."
    )


class Plan(BaseModel):
    name: str = Field(description="The name of app to be built")
    description: str = Field(
        description="A oneline description of the app to be built, e.g. 'A web application for managing personal finances'"
    )
    techstack: str = Field(
        description="The tech stack to be used for the app, e.g. 'python', 'javascript', 'react', 'flask', etc."
    )
    features: list[str] = Field(
        description="A list of features that the app should have, e.g. 'user authentication', 'data visualization', etc."
    )
    files: list[File] = Field(
        description="A list of files to be created, each with a 'path' and 'purpose'"
    )


class ImplementationTask(BaseModel):
    filepath: str = Field(description="The path to the file to be modified")
    task_description: str = Field(
        description="A detailed description of the task to be performed on the file, e.g. 'add user authentication', 'implement data processing logic', etc."
    )


class TaskPlan(BaseModel):
    implementation_steps: list[ImplementationTask] = Field(
        description="A list of steps to be taken to implement the task"
    )
    model_config = ConfigDict(extra="allow")


class CoderState(BaseModel):
    """Tracks progress and error-recovery state for the coder agent loop."""

    task_plan: TaskPlan = Field(description="The plan for the task to be implemented")
    current_step_idx: int = Field(0, description="Index of the current implementation step")
    current_file_content: Optional[str] = Field(
        None, description="Content of the file currently being edited or created"
    )

    # ── Self-healing fields ────────────────────────────────────────────────────
    retry_count: int = Field(
        0,
        description="Number of retry attempts for the current step",
    )
    max_retries: int = Field(
        3,
        description="Maximum number of retry attempts per step before giving up",
    )
    last_error: Optional[str] = Field(
        None,
        description="The error message from the last failed execution attempt",
    )
    # Persisted message history for the current step's ReAct agent.
    # Uses LangGraph's add_messages reducer so messages are accumulated, not overwritten.
    messages: Annotated[list[BaseMessage], add_messages] = Field(
        default_factory=list,
        description="Message history for the current coder ReAct session",
    )
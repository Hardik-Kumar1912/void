import json
import asyncio
import os
import re
import shutil
import time
import zipfile
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Optional
from fastapi import FastAPI
from fastapi import Header, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv(override=True)
api_key = os.getenv("GROQ_API_KEY")
if api_key:
    print(f"SUCCESS: API Key found! Starts with: {api_key[:4]}...")
else:
    print("ERROR: API Key is still MISSING. Python cannot see the .env file!")
# Import your existing graph!
from agent.graph import agent
from agent.tools import (
    PROJECTS_ROOT,
    get_project_root,
    init_project_root,
    reset_project_root,
    safe_path_for_project,
    use_project_root,
)



class CurrentFiles(BaseModel):
    """The current state of the three project files sent from the frontend for revision."""
    html: str = ""
    css: str = ""
    js: str = ""


class PromptRequest(BaseModel):
    prompt: str
    max_retries: int = 3
    recursion_limit: int = 150
    current_files: Optional[CurrentFiles] = None  # Present only on revision requests
    is_revision: bool = False                      # True when editing an existing project


GENERATED_FILES = ("index.html", "styles.css", "script.js")
SESSION_ID_PATTERN = re.compile(r"[^a-zA-Z0-9_-]")
SESSION_LOCKS: dict[str, asyncio.Lock] = {}
PROJECT_RETENTION_SECONDS = int(os.getenv("PROJECT_RETENTION_SECONDS", "7200"))  # 2 hours default
last_cleanup_at = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run cleanup of old sessions on startup, then yield for normal operation."""
    global last_cleanup_at
    last_cleanup_at = 0.0  # force cleanup to run on first request
    cleanup_old_project_sessions()
    yield


app = FastAPI(lifespan=lifespan)
frontend_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

# Allow Next.js to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean_session_id(session_id: str | None) -> str:
    cleaned = SESSION_ID_PATTERN.sub("", session_id or "default")[:64]
    return cleaned or "default"


def session_project_root(session_id: str | None):
    return (PROJECTS_ROOT / clean_session_id(session_id)).resolve()


def get_session_lock(session_id: str) -> asyncio.Lock:
    if session_id not in SESSION_LOCKS:
        SESSION_LOCKS[session_id] = asyncio.Lock()
    return SESSION_LOCKS[session_id]


def clear_project_folder() -> None:
    project_root = get_project_root().resolve()
    project_root.mkdir(parents=True, exist_ok=True)

    for child in project_root.iterdir():
        resolved_child = child.resolve()
        if project_root not in resolved_child.parents and resolved_child != project_root:
            raise ValueError("Refusing to clean outside project root")
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def cleanup_old_project_sessions() -> None:
    global last_cleanup_at

    now = time.time()
    if PROJECT_RETENTION_SECONDS <= 0 or now - last_cleanup_at < 300:
        return

    last_cleanup_at = now
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)

    for child in PROJECTS_ROOT.iterdir():
        if not child.is_dir():
            continue

        resolved_child = child.resolve()
        if PROJECTS_ROOT.resolve() not in resolved_child.parents:
            continue

        try:
            latest_mtime = max(
                (path.stat().st_mtime for path in child.rglob("*")),
                default=child.stat().st_mtime,
            )
        except OSError:
            continue

        if now - latest_mtime > PROJECT_RETENTION_SECONDS:
            shutil.rmtree(child, ignore_errors=True)


def file_language(path: str) -> str:
    if path.endswith(".html"):
        return "html"
    if path.endswith(".css"):
        return "css"
    if path.endswith(".js"):
        return "javascript"
    return "plaintext"


def file_media_type(path: str) -> str:
    if path.endswith(".html"):
        return "text/html; charset=utf-8"
    if path.endswith(".css"):
        return "text/css; charset=utf-8"
    if path.endswith(".js"):
        return "application/javascript; charset=utf-8"
    return "text/plain; charset=utf-8"


def no_store_headers() -> dict[str, str]:
    return {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }


def cache_bust_index_html(content: str) -> str:
    version = str(int(time.time() * 1000))
    content = re.sub(
        r'href=(["\'])/?styles\.css(?:\?[^"\']*)?\\1',
        rf'href=\1styles.css?v={version}\1',
        content,
    )
    content = re.sub(
        r'src=(["\'])/?script\.js(?:\?[^"\']*)?\\1',
        rf'src=\1script.js?v={version}\1',
        content,
    )
    return content


def write_current_files_to_disk(current_files: CurrentFiles) -> None:
    """
    Write the frontend's current file contents to the project folder on disk.
    This ensures the agent reads the most up-to-date code when revising.
    """
    file_map = {
        "index.html": current_files.html,
        "styles.css": current_files.css,
        "script.js": current_files.js,
    }
    for filename, content in file_map.items():
        if content.strip():
            file_path = safe_path_for_project(filename)
            file_path.write_text(content, encoding="utf-8")


# Helper function to prevent JSON crashes with custom graph states
def safe_serialize(obj):
    try:
        # If the object has a Pydantic or custom model_dump method, use it
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        return str(obj)
    except Exception:
        return str(obj)


@app.post("/api/generate")  # Unified URL matching the frontend fetch path
async def generate_code(
    request: PromptRequest,
    x_coder_buddy_session: str | None = Header(default=None),
):
    cleanup_old_project_sessions()
    session_id = clean_session_id(x_coder_buddy_session)
    lock = get_session_lock(session_id)

    # Determine if this is a revision or a fresh generation
    is_revision = request.is_revision or (request.current_files is not None)

    # Changed to an 'async def' generator for enterprise-grade performance
    async def event_generator():
        if lock.locked():
            yield f"data: {json.dumps({'error': 'This session is already generating a project.'})}\\n\\n"
            return

        token = use_project_root(session_project_root(session_id))
        await lock.acquire()
        try:
            init_project_root()

            if is_revision and request.current_files is not None:
                # REVISION MODE: Write the current frontend files to disk so the
                # agent's read_file tool sees the most up-to-date code.
                write_current_files_to_disk(request.current_files)
                yield f"data: {json.dumps({'system': {'status': 'REVISION_START'}})}\\n\\n"
            else:
                # NEW PROJECT: Clear any previous files for this session.
                clear_project_folder()
                yield f"data: {json.dumps({'system': {'status': 'CLEANED'}})}\\n\\n"

            # Build the initial state for the agent graph
            initial_state: dict = {
                "user_prompt": request.prompt,
                "max_retries": request.max_retries,
                "is_revision": is_revision,
            }

            # Pass a snapshot of current file contents so prompts can reference them
            if is_revision and request.current_files is not None:
                initial_state["current_files_snapshot"] = {
                    "index.html": request.current_files.html,
                    "styles.css": request.current_files.css,
                    "script.js": request.current_files.js,
                }

            # .astream() handles network requests concurrently without blocking your server threads
            async for chunk in agent.astream(
                initial_state,
                {"recursion_limit": request.recursion_limit},
                stream_mode="updates"
            ):
                # Clean up the chunk data so json.dumps doesn't crash on custom objects
                serializable_chunk = json.loads(
                    json.dumps(chunk, default=safe_serialize)
                )

                # Format perfectly as Server-Sent Events (SSE)
                yield f"data: {json.dumps(serializable_chunk)}\\n\\n"
                await asyncio.sleep(0.01)  # Yields control to the event loop safely

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\\n\\n"
        finally:
            lock.release()
            reset_project_root(token)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/project-files")
async def get_project_files(
    x_coder_buddy_session: str | None = Header(default=None),
    session_id: str | None = Query(default=None),
):
    cleanup_old_project_sessions()
    clean_id = clean_session_id(session_id or x_coder_buddy_session)
    token = use_project_root(session_project_root(clean_id))

    try:
        init_project_root()

        files = []
        for path in GENERATED_FILES:
            file_path = safe_path_for_project(path)
            exists = file_path.exists() and file_path.is_file()
            files.append(
                {
                    "path": path,
                    "language": file_language(path),
                    "exists": exists,
                    "size": file_path.stat().st_size if exists else 0,
                    "content": file_path.read_text(encoding="utf-8") if exists else "",
                }
            )

        return {
            "session_id": clean_id,
            "root": str(get_project_root()),
            "files": files,
        }
    finally:
        reset_project_root(token)


@app.delete("/api/project-files")
async def delete_project_files(
    x_coder_buddy_session: str | None = Header(default=None),
):
    clean_id = clean_session_id(x_coder_buddy_session)
    lock = get_session_lock(clean_id)

    if lock.locked():
        raise HTTPException(status_code=409, detail="Generation is still running")

    token = use_project_root(session_project_root(clean_id))

    try:
        clear_project_folder()
        return {"status": "cleared", "session_id": clean_id}
    finally:
        reset_project_root(token)


@app.get("/api/download-project")
async def download_project(
    x_coder_buddy_session: str | None = Header(default=None),
    session_id: str | None = Query(default=None),
):
    clean_id = clean_session_id(session_id or x_coder_buddy_session)
    lock = get_session_lock(clean_id)

    if lock.locked():
        raise HTTPException(status_code=409, detail="Generation is still running")

    token = use_project_root(session_project_root(clean_id))

    try:
        init_project_root()
        zip_buffer = BytesIO()
        included_files = 0

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in GENERATED_FILES:
                file_path = safe_path_for_project(path)
                if file_path.exists() and file_path.is_file():
                    archive.write(file_path, arcname=path)
                    included_files += 1

        if included_files == 0:
            raise HTTPException(status_code=404, detail="No generated files to download")

        return Response(
            content=zip_buffer.getvalue(),
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="coder-buddy-project.zip"'
            },
        )
    finally:
        reset_project_root(token)


@app.get("/generated/{session_id}/{path:path}")
async def serve_generated_file(session_id: str, path: str):
    if path not in GENERATED_FILES:
        raise HTTPException(status_code=404, detail="File not found")

    token = use_project_root(session_project_root(session_id))

    try:
        file_path = safe_path_for_project(path)
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        content = file_path.read_text(encoding="utf-8")
        if path == "index.html":
            content = cache_bust_index_html(content)

        return Response(
            content=content,
            media_type=file_media_type(path),
            headers=no_store_headers(),
        )
    finally:
        reset_project_root(token)


@app.delete("/api/cleanup-sessions")
async def cleanup_sessions():
    """
    Immediately remove all session folders whose files are older than
    PROJECT_RETENTION_SECONDS, bypassing the normal 5-minute cooldown.
    Safe to call at any time (running sessions are never touched because
    their files are being actively modified).
    """
    global last_cleanup_at
    last_cleanup_at = 0.0  # reset so cleanup runs unconditionally

    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    now = time.time()
    removed = []

    for child in PROJECTS_ROOT.iterdir():
        if not child.is_dir():
            continue

        resolved_child = child.resolve()
        if PROJECTS_ROOT.resolve() not in resolved_child.parents:
            continue

        try:
            latest_mtime = max(
                (path.stat().st_mtime for path in child.rglob("*")),
                default=child.stat().st_mtime,
            )
        except OSError:
            continue

        if PROJECT_RETENTION_SECONDS <= 0 or now - latest_mtime > PROJECT_RETENTION_SECONDS:
            shutil.rmtree(child, ignore_errors=True)
            removed.append(child.name)

    last_cleanup_at = now
    return {
        "status": "ok",
        "removed_sessions": removed,
        "retention_seconds": PROJECT_RETENTION_SECONDS,
    }

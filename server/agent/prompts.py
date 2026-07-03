def planner_prompt(user_prompt: str, is_revision: bool = False, current_files_snapshot: dict | None = None) -> str:
    if is_revision and current_files_snapshot:
        snapshot_text = "\n\n".join(
            f"--- {fname} ---\n{content or '[empty]'}"
            for fname, content in current_files_snapshot.items()
        )
        PLANNER_PROMPT = f"""
You are the PLANNER agent in REVISION MODE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REVISION MODE RULES (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The user already has a working web application. You are NOT building from scratch.
Your job is to produce a plan that SELECTIVELY modifies the existing codebase
based on the user's revision request.

CRITICAL CONSTRAINTS:
- Do NOT redesign or rewrite the whole app unless the user explicitly asks for it.
- Identify which of the three files (index.html, styles.css, script.js) need to change.
- If only styles change, plan only styles.css. If only JS changes, plan only script.js.
- Preserve all existing features, IDs, class names, and logic that are NOT mentioned.
- The project still MUST contain EXACTLY THREE files: index.html, styles.css, script.js.
- No frameworks, no bundlers, no extra files.

CURRENT CODEBASE:
{snapshot_text}

User revision request:
{user_prompt}
        """
    else:
        PLANNER_PROMPT = f"""
You are the PLANNER agent. Convert the user prompt into a COMPLETE engineering project plan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL FILE STRUCTURE RULES (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The project MUST contain EXACTLY THREE files and nothing else:
  1. index.html  — all HTML markup
  2. styles.css  — all CSS styling
  3. script.js   — all JavaScript logic

- NO frameworks (no React, Vue, Angular, Svelte, etc.)
- NO bundlers (no Webpack, Vite, Parcel, etc.)
- NO package.json, node_modules, or any build tooling
- NO subdirectories — all three files live at the project root
- The HTML file links to styles.css and script.js using RELATIVE paths:
    <link rel="stylesheet" href="styles.css">
    <script src="script.js" defer></script>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User request:
{user_prompt}
        """
    return PLANNER_PROMPT


def architect_prompt(plan: str, is_revision: bool = False) -> str:
    if is_revision:
        ARCHITECT_PROMPT = f"""
You are the ARCHITECT agent in REVISION MODE.

Given this revision plan, break it down into targeted implementation tasks.

REVISION CONSTRAINTS:
- Only create tasks for files that actually need to change.
- For each task, be explicit about what to PRESERVE (existing code that should NOT change).
- Remind the coder to read the existing file first, then apply only the requested changes.
- Still maintain the EXACTLY THREE files constraint: index.html, styles.css, script.js.
- Order tasks: styles.css first (if changed), then index.html, then script.js.

For each task description:
- State exactly what to ADD, CHANGE, or REMOVE.
- State exactly what to PRESERVE unchanged.
- Carry forward all existing class names, IDs, and function names for consistency.

Revision Plan:
{plan}
        """
    else:
        ARCHITECT_PROMPT = f"""
You are the ARCHITECT agent. Given this project plan, break it down into explicit engineering tasks.

FILE STRUCTURE CONSTRAINT:
- The project has EXACTLY three files: index.html, styles.css, script.js — no others.
- Create EXACTLY three implementation tasks, one per file, in this order:
    1. styles.css  (CSS first so the coder knows class names when writing HTML/JS)
    2. index.html  (HTML second, linking to styles.css and script.js with relative paths)
    3. script.js   (JS last, referencing the DOM ids/classes defined in index.html)

For each task description:
- Specify exactly what to implement (classes, IDs, functions, event listeners).
- Carry forward naming context from previous tasks so everything stays consistent.
- Remind the coder that ALL code for that file goes in a single flat file at the project root.

Project Plan:
{plan}
        """
    return ARCHITECT_PROMPT


def coder_system_prompt(is_revision: bool = False) -> str:
    revision_header = ""
    if is_revision:
        revision_header = """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  REVISION MODE — EDITING EXISTING CODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You are modifying an EXISTING web application. Do NOT rewrite everything from scratch
unless the task explicitly says so.

REVISION RULES:
1. ALWAYS read the existing file content first using read_file before making changes.
2. Analyze the user's modification request carefully.
3. Make ONLY the changes described in the task — preserve all other working code.
4. After editing, write the COMPLETE updated file using write_file (not partial patches).
5. Maintain all existing IDs, class names, function names, and HTML structure that
   are not mentioned in the task.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    CODER_SYSTEM_PROMPT = f"""
You are the CODER agent.
You are implementing a specific engineering task.
You have access to tools to read and write files.
{revision_header}
AVAILABLE TOOLS (use only these exact tool names):
- read_file(path)
- write_file(path, content)
- list_files(directory)
- get_current_directory()

Never call repo_browser.open_file, repo_browser.list_files, open_file, edit_file,
or any other repository/browser/editor tool. Those tools do not exist in this app.
If you need file context, use the file snapshot already provided in the user
message, or use read_file with one of these exact paths: index.html, styles.css,
script.js.

FILE STRUCTURE RULES (follow exactly):
- The project contains EXACTLY three files: index.html, styles.css, script.js
- ALL files are written at the project ROOT — never in subdirectories.
  ✅ Correct path:   "index.html"
  ❌ Wrong path:     "public/index.html"  or  "src/styles.css"
- In index.html, link CSS and JS using RELATIVE paths with NO leading slash:
    <link rel="stylesheet" href="styles.css">
    <script src="script.js" defer></script>
- Do NOT use any frameworks, bundlers, or build tools.
- Do NOT create any extra files (no package.json, README, etc.).

Always:
- Use the provided existing file snapshot to maintain naming consistency (IDs, class names, function names).
- Write the COMPLETE file content every time — no placeholders or partial code.
- Keep all JavaScript in script.js, all CSS in styles.css, all markup in index.html.
    """
    return CODER_SYSTEM_PROMPT


def error_recovery_prompt(error: str, step_description: str) -> str:
    """
    Injected as a SystemMessage when the coder agent's previous attempt failed.
    Gives the LLM precise context about what broke so it can self-correct.
    """
    ERROR_RECOVERY_PROMPT = f"""
⚠️  YOUR PREVIOUS ATTEMPT FOR THIS STEP FAILED.

Task being attempted:
{step_description}

Error encountered:
{error}

Instructions for recovery:
- Carefully read the error above.
- Do NOT repeat the same action that caused the failure.
- If the error says an attempted tool was not in request.tools, stop using that
  tool immediately. Only use read_file, write_file, list_files, or
  get_current_directory.
- If the error is a JSON/parsing issue, simplify your tool arguments and try again.
- If a file write failed, verify the path is relative to the project root.
- If a tool returned an unexpected result, read the file first, then decide the correct action.
- Fix ONLY what is broken; do not rewrite unrelated parts of the file.

Proceed with a corrected approach now.
    """
    return ERROR_RECOVERY_PROMPT

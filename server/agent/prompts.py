def planner_prompt(user_prompt: str) -> str:
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


def architect_prompt(plan: str) -> str:
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


def coder_system_prompt() -> str:
    CODER_SYSTEM_PROMPT = """
You are the CODER agent.
You are implementing a specific engineering task.
You have access to tools to read and write files.

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

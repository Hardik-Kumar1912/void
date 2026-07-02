import argparse
import sys
import traceback

from agent.graph import agent
from agent.tools import init_project_root


def main():
    parser = argparse.ArgumentParser(description="Run Coder Buddy – self-healing AI coding assistant")
    parser.add_argument(
        "--recursion-limit", "-r",
        type=int,
        default=150,
        help="LangGraph recursion limit (default: 150). Each retry counts as an extra step.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Maximum retries per implementation step before giving up (default: 3).",
    )

    args = parser.parse_args()

    # Ensure the generated_project directory exists before any file ops
    project_root = init_project_root()
    print(f"[coder-buddy] Project root: {project_root}")

    try:
        user_prompt = input("Enter your project prompt: ").strip()
        if not user_prompt:
            print("No prompt provided. Exiting.")
            sys.exit(0)

        result = agent.invoke(
            {
                "user_prompt": user_prompt,
                # Pass max_retries into graph state so nodes can read it if needed
                "max_retries": args.max_retries,
            },
            {"recursion_limit": args.recursion_limit},
        )

        final_status = result.get("status", "UNKNOWN")

        if final_status == "DONE":
            print("\n  All implementation steps completed successfully.")
        elif final_status == "FAILED":
            coder_state = result.get("coder_state")
            if coder_state:
                step_idx = coder_state.current_step_idx
                steps = coder_state.task_plan.implementation_steps
                failed_step = steps[step_idx] if step_idx < len(steps) else None
                print("\n  Run ended after exhausting retries.")
                if failed_step:
                    print(f"   Failed step [{step_idx}]: {failed_step.filepath}")
                    print(f"   Task: {failed_step.task_description[:200]}")
                last_err = coder_state.last_error
                if last_err:
                    print(f"\n   Last error:\n{last_err[:500]}")
            else:
                print("\n  Run ended with FAILED status (no coder state available).")
            sys.exit(2)
        else:
            print(f"\n   Run ended with status: {final_status}")

        print("\nFinal State keys:", list(result.keys()))

    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(0)
    except Exception as e:
        traceback.print_exc()
        print(f"\nFatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
"""PreToolUse(Bash): rewrite plain test/build commands so Claude reads failure lines only."""
import json
import re
import sys

ALLOWED = re.compile(
    r"^(npm (run )?test|npm run build|pnpm (run )?(test|build)|npx playwright test"
    r"|\./gradlew (test|build|check)|\./mvnw (test|verify)|pytest)(\s|$)"
)
# Chained/redirected commands pass through untouched: the hook auto-approves what it rewrites.
SHELL_META = re.compile(r"[;&|`$<>()\n\\]")
FAIL_PATTERN = r"(FAIL|ERROR|Error|error:|✘|failed|Exception)"

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

cmd = (data.get("tool_input") or {}).get("command", "").strip()
if not cmd or not ALLOWED.match(cmd) or SHELL_META.search(cmd):
    sys.exit(0)

filtered = (
    f"{{ {cmd}; }} 2>&1 | grep -E -A 5 '{FAIL_PATTERN}' | head -100; "
    "rc=${PIPESTATUS[0]}; echo \"[filtered: failure lines only] exit=$rc\"; (exit $rc)"
)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "allow",
        "updatedInput": {**data["tool_input"], "command": filtered},
    }
}))

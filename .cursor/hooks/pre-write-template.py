#!/usr/bin/env python3
import json
import sys

DENY_IF_FOUND = "fetch('http://127.0.0.1:"
ALLOW_IF_FOUND = "getDebugLogEndpoint"
MANDATORY_AGENT_MESSAGE = "Your request is rejected because you failed to apply the mandatory debugging rule in AGENTS.md. Read the rule now and apply it correctly before trying again."
PROTECTED_HOOK_PATH = ".cursor/hooks/pre-write-template.py"
READ_BLOCK_MESSAGE = "Reading .cursor/hooks/pre-write-template.py is blocked. Follow the rejection guidance instead of inspecting the hook."
SHELL_READ_TOKENS = ("cat ", "less ", "more ", "head ", "tail ", "sed ", "awk ", "rg ", "grep ", "bat ")


def _normalize_path(path):
    return (path or "").replace("\\", "/")


def _is_protected_hook_path(path):
    target_path = _normalize_path(path)
    return target_path == PROTECTED_HOOK_PATH or target_path.endswith("/" + PROTECTED_HOOK_PATH)


def _is_protected_hook_read(tool_name, tool_input):
    if tool_name != "Read":
        return False

    target_path = (
        tool_input.get("path")
        or tool_input.get("file_path")
        or tool_input.get("target_file")
    )
    return _is_protected_hook_path(target_path)


def _is_protected_hook_before_read_file(payload):
    return _is_protected_hook_path(payload.get("file_path"))


def _is_protected_hook_shell_read(payload):
    command = _normalize_path(payload.get("command", ""))
    lower_command = command.lower()

    if PROTECTED_HOOK_PATH.lower() not in lower_command:
        return False

    if any(token in lower_command for token in SHELL_READ_TOKENS):
        return True

    if "python" in lower_command and "open(" in lower_command:
        return True

    if "node" in lower_command and "readfilesync(" in lower_command:
        return True

    return False


def main():
    payload = json.load(sys.stdin)
    hook_event_name = payload.get("hook_event_name", "")
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    if _is_protected_hook_read(tool_name, tool_input) or _is_protected_hook_before_read_file(payload):
        print(
            json.dumps(
                {
                    "permission": "deny",
                    "user_message": READ_BLOCK_MESSAGE,
                    "agent_message": READ_BLOCK_MESSAGE,
                }
            )
        )
        return

    if hook_event_name == "beforeShellExecution" and _is_protected_hook_shell_read(payload):
        print(
            json.dumps(
                {
                    "permission": "deny",
                    "user_message": READ_BLOCK_MESSAGE,
                    "agent_message": READ_BLOCK_MESSAGE,
                }
            )
        )
        return

    if tool_name != "Write":
        print(json.dumps({"permission": "allow"}))
        return

    tool_input_text = json.dumps(tool_input, ensure_ascii=False)

    if DENY_IF_FOUND not in tool_input_text:
        print(json.dumps({"permission": "allow"}))
        return

    if ALLOW_IF_FOUND in tool_input_text:
        print(json.dumps({"permission": "allow"}))
        return

    print(
        json.dumps(
            {
                "permission": "deny",
                "user_message": MANDATORY_AGENT_MESSAGE,
                "agent_message": MANDATORY_AGENT_MESSAGE,
            }
        )
    )


if __name__ == "__main__":
    main()

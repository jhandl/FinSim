#!/usr/bin/env python3
import json, sys

DENY_IF_FOUND = "fetch('http://127.0.0.1:"
ALLOW_IF_FOUND = "window.getDebugLogEndpoint"
MANDATORY_AGENT_MESSAGE = "Your request is rejected because you failed to apply the mandatory debugging rule in AGENTS.md. Read the rule now and apply it correctly before trying again."
PROTECTED_HOOK_PATH = ".cursor/hooks/pre-write.py"
PROTECTED_HOOK_SUFFIX = "/" + PROTECTED_HOOK_PATH
PROTECTED_HOOK_PATH_LOWER = PROTECTED_HOOK_PATH.lower()
READ_BLOCK_MESSAGE = "Reading .cursor/hooks/pre-write.py is blocked. Follow the rejection guidance instead of inspecting the hook."
SHELL_READ_TOKENS = ("cat ", "less ", "more ", "head ", "tail ", "sed ", "awk ", "rg ", "grep ", "bat ")

def _normalize(value):
    return (value or "").replace("\\", "/")

def _is_protected_path(path):
    path = _normalize(path)
    return path == PROTECTED_HOOK_PATH or path.endswith(PROTECTED_HOOK_SUFFIX)

def _is_shell_read(command):
    command = _normalize(command).lower()
    return PROTECTED_HOOK_PATH_LOWER in command and (
        any(token in command for token in SHELL_READ_TOKENS)
        or ("python" in command and "open(" in command)
        or ("node" in command and "readfilesync(" in command)
    )

def _response(permission, message=None):
    response = {"permission": permission}
    if message:
        response["user_message"] = message
        response["agent_message"] = message
    return json.dumps(response)

def main():
    payload = json.load(sys.stdin)
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})
    target_path = tool_input.get("path") or tool_input.get("file_path") or tool_input.get("target_file")
    if tool_name != "Write":
        print(_response("allow"))
        return
    if (
        (tool_name == "Read" and _is_protected_path(target_path))
        or _is_protected_path(payload.get("file_path"))
        or (
            payload.get("hook_event_name", "") == "beforeShellExecution"
            and _is_shell_read(payload.get("command", ""))
        )
    ):
        print(_response("deny", READ_BLOCK_MESSAGE))
        return
    tool_input_text = json.dumps(tool_input, ensure_ascii=False)
    if DENY_IF_FOUND not in tool_input_text or ALLOW_IF_FOUND in tool_input_text:
        print(_response("allow"))
        return
    print(_response("deny", MANDATORY_AGENT_MESSAGE))

if __name__ == "__main__":
    main()

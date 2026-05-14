"""
ipaship/debugger_ai.py - AI-Powered Debugger with Prompt-Based Breakpoints

An intelligent debugger that uses natural language prompts to set conditional
breakpoints, inspect variables, and generate debugging reports for security
audit workflows.
"""

import ast
import inspect
import json
import textwrap
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional


class DebugState(Enum):
    """Execution state of the debugger."""
    RUNNING = "running"
    PAUSED = "paused"
    STEPPING = "stepping"
    STOPPED = "stopped"


@dataclass
class Breakpoint:
    """A breakpoint with an optional AI-evaluated condition prompt."""
    id: int
    file: str
    line: int
    condition_prompt: Optional[str] = None
    hit_count: int = 0
    enabled: bool = True


@dataclass
class DebugEvent:
    """A recorded debug event during execution."""
    timestamp: str
    event_type: str
    file: str
    line: int
    details: str
    variables: dict = field(default_factory=dict)


class AIDebugger:
    """
    AI-powered debugger that supports prompt-based breakpoints for
    security auditing and code analysis.

    Usage:
        debugger = AIDebugger()

        # Set a natural-language breakpoint
        debugger.set_breakpoint("auth.py", 42, "user role is admin and token is expired")

        # Debug a function
        debugger.debug_function(my_function, arg1, arg2)

        # Inspect and control
        debugger.inspect_variable("token")
        debugger.step()
        debugger.continue_execution()
        debugger.generate_report()
    """

    def __init__(self, api_key: Optional[str] = None):
        self._breakpoints: list[Breakpoint] = []
        self._next_bp_id = 1
        self._state = DebugState.STOPPED
        self._call_stack: list[dict] = []
        self._variables: dict[str, Any] = {}
        self._event_log: list[DebugEvent] = []
        self._current_file: str = ""
        self._current_line: int = 0
        self._api_key = api_key
        self._breakpoint_hits: list[dict] = []
        self._frame_locals: dict[str, Any] = {}

    # ── Breakpoint Management ──────────────────────────────────────────

    def set_breakpoint(
        self,
        file: str,
        line: int,
        condition_prompt: Optional[str] = None,
    ) -> Breakpoint:
        """
        Set a breakpoint at a specific file and line number.

        Args:
            file: Target source file path.
            line: Line number to break at.
            condition_prompt: Natural language condition. The debugger pauses
                only when this condition evaluates to true. Examples:
                - "variable x is negative"
                - "response status code is not 200"
                - "password length is less than 8"

        Returns:
            The created Breakpoint object.
        """
        bp = Breakpoint(
            id=self._next_bp_id,
            file=file,
            line=line,
            condition_prompt=condition_prompt,
        )
        self._next_bp_id += 1
        self._breakpoints.append(bp)
        self._log_event("breakpoint_set", file, line,
                         f"Breakpoint #{bp.id} set" +
                         (f" with condition: {condition_prompt}" if condition_prompt else ""))
        return bp

    def remove_breakpoint(self, bp_id: int) -> bool:
        """Remove a breakpoint by its ID."""
        for i, bp in enumerate(self._breakpoints):
            if bp.id == bp_id:
                removed = self._breakpoints.pop(i)
                self._log_event("breakpoint_removed", removed.file, removed.line,
                                 f"Breakpoint #{bp_id} removed")
                return True
        return False

    def toggle_breakpoint(self, bp_id: int) -> Optional[Breakpoint]:
        """Enable or disable a breakpoint."""
        for bp in self._breakpoints:
            if bp.id == bp_id:
                bp.enabled = not bp.enabled
                return bp
        return None

    def list_breakpoints(self) -> list[Breakpoint]:
        """Return all breakpoints."""
        return list(self._breakpoints)

    # ── AI Condition Evaluation ────────────────────────────────────────

    def _evaluate_condition(self, condition_prompt: str, context: dict) -> bool:
        """
        Evaluate a natural-language condition against the current variable context.

        Uses rule-based pattern matching to interpret common prompt patterns.
        For production use, this can be extended with an LLM API call.

        Supported patterns:
            - "<var> is <value>" / "<var> equals <value>"
            - "<var> is not <value>"
            - "<var> is greater than <value>" / "<var> is less than <value>"
            - "<var> contains <value>"
            - "<var> is empty" / "<var> is not empty"
            - "<var> is None" / "<var> is not None"
            - "<var> is true" / "<var> is false"
            - "<var> length is <num>"
            - "<var> type is <typename>"
        """
        prompt = condition_prompt.strip().lower()

        # Try to match variable patterns from context
        for var_name, var_value in context.items():
            var_lower = var_name.lower()

            # "<var> is <value>"
            if f"{var_lower} is " in prompt:
                rest = prompt.split(f"{var_lower} is ", 1)[1].strip()

                if rest == "none":
                    if var_value is None:
                        return True
                elif rest == "not none":
                    if var_value is not None:
                        return True
                elif rest == "empty":
                    if var_value in (None, "", [], {}, set()):
                        return True
                elif rest == "not empty":
                    if var_value not in (None, "", [], {}, set()):
                        return True
                elif rest == "true":
                    if var_value is True or var_value:
                        return True
                elif rest == "false":
                    if var_value is False or not var_value:
                        return True
                else:
                    # Try numeric comparison
                    try:
                        target = float(rest)
                        if float(var_value) == target:
                            return True
                    except (ValueError, TypeError):
                        pass
                    # String comparison
                    if str(var_value).lower() == rest:
                        return True

            # "<var> is not <value>"
            if f"{var_lower} is not " in prompt:
                rest = prompt.split(f"{var_lower} is not ", 1)[1].strip()
                try:
                    target = float(rest)
                    if float(var_value) != target:
                        return True
                except (ValueError, TypeError):
                    pass
                if str(var_value).lower() != rest:
                    return True

            # "<var> equals <value>"
            if f"{var_lower} equals " in prompt:
                rest = prompt.split(f"{var_lower} equals ", 1)[1].strip()
                if str(var_value).lower() == rest:
                    return True

            # "<var> is greater than <value>"
            if f"{var_lower} is greater than " in prompt:
                rest = prompt.split(f"{var_lower} is greater than ", 1)[1].strip()
                try:
                    if float(var_value) > float(rest):
                        return True
                except (ValueError, TypeError):
                    pass

            # "<var> is less than <value>"
            if f"{var_lower} is less than " in prompt:
                rest = prompt.split(f"{var_lower} is less than ", 1)[1].strip()
                try:
                    if float(var_value) < float(rest):
                        return True
                except (ValueError, TypeError):
                    pass

            # "<var> contains <value>"
            if f"{var_lower} contains " in prompt:
                rest = prompt.split(f"{var_lower} contains ", 1)[1].strip()
                try:
                    if rest in str(var_value).lower():
                        return True
                except (TypeError):
                    pass

            # "<var> length is <num>"
            if f"{var_lower} length is " in prompt:
                rest = prompt.split(f"{var_lower} length is ", 1)[1].strip()
                try:
                    if len(var_value) == int(rest):
                        return True
                except (TypeError, ValueError):
                    pass

            # "<var> type is <typename>"
            if f"{var_lower} type is " in prompt:
                rest = prompt.split(f"{var_lower} type is ", 1)[1].strip()
                if type(var_value).__name__.lower() == rest:
                    return True

        # Compound conditions with "and"
        if " and " in prompt:
            parts = prompt.split(" and ", 1)
            return (self._evaluate_condition(parts[0], context) and
                    self._evaluate_condition(parts[1], context))

        # Compound conditions with "or"
        if " or " in prompt:
            parts = prompt.split(" or ", 1)
            return (self._evaluate_condition(parts[0], context) or
                    self._evaluate_condition(parts[1], context))

        return False

    # ── Variable Inspection ────────────────────────────────────────────

    def inspect_variable(self, var_name: str) -> Optional[dict]:
        """
        Inspect a variable by name from the current debug context.

        Returns a dict with name, value, type, and size info, or None if not found.
        """
        if var_name in self._frame_locals:
            val = self._frame_locals[var_name]
            info = {
                "name": var_name,
                "value": repr(val),
                "type": type(val).__name__,
            }
            try:
                info["size"] = len(val)
            except TypeError:
                pass
            self._log_event("variable_inspected", self._current_file,
                             self._current_line, f"Inspected {var_name} = {repr(val)}")
            return info
        return None

    def get_all_variables(self) -> dict[str, Any]:
        """Return all variables in the current scope."""
        return dict(self._frame_locals)

    # ── Execution Control ──────────────────────────────────────────────

    def step(self) -> DebugState:
        """
        Advance execution by one step (line).
        Returns the new debug state.
        """
        if self._state == DebugState.PAUSED:
            self._state = DebugState.STEPPING
            self._log_event("step", self._current_file, self._current_line, "Stepped one line")
            return self._state
        return self._state

    def continue_execution(self) -> DebugState:
        """
        Continue execution until the next breakpoint hit or completion.
        Returns the new debug state.
        """
        if self._state in (DebugState.PAUSED, DebugState.STEPPING):
            self._state = DebugState.RUNNING
            self._log_event("continue", self._current_file, self._current_line,
                             "Execution continued")
            return self._state
        return self._state

    def stop(self) -> DebugState:
        """
        Stop debugging and reset state.
        Returns the new debug state.
        """
        self._state = DebugState.STOPPED
        self._log_event("stop", self._current_file, self._current_line,
                         "Debugger stopped")
        return self._state

    @property
    def state(self) -> DebugState:
        """Current debugger state."""
        return self._state

    # ── Function Debugging ─────────────────────────────────────────────

    def debug_function(self, func: Callable, *args, **kwargs) -> Any:
        """
        Debug a function by executing it with line-by-line tracing.

        Breakpoints are checked at each line. If a breakpoint hits and its
        condition (if any) is satisfied, execution pauses.

        Args:
            func: The function to debug.
            *args, **kwargs: Arguments to pass to the function.

        Returns:
            The function's return value.
        """
        source_file = inspect.getfile(func)
        source_lines, start_line = inspect.getsourcelines(func)
        source_code = textwrap.dedent("".join(source_lines))

        self._state = DebugState.RUNNING
        self._current_file = source_file
        self._log_event("debug_start", source_file, start_line,
                         f"Debugging {func.__name__}")

        result = None
        error = None

        def trace_fn(frame, event, arg):
            if event == "line":
                self._current_line = frame.f_lineno
                self._frame_locals = dict(frame.f_locals)

                # Check breakpoints
                for bp in self._breakpoints:
                    if (bp.enabled and bp.file in source_file
                            and bp.line == frame.f_lineno):
                        bp.hit_count += 1
                        should_pause = True

                        if bp.condition_prompt:
                            should_pause = self._evaluate_condition(
                                bp.condition_prompt, self._frame_locals
                            )

                        if should_pause:
                            self._state = DebugState.PAUSED
                            self._breakpoint_hits.append({
                                "breakpoint_id": bp.id,
                                "file": source_file,
                                "line": frame.f_lineno,
                                "locals": dict(self._frame_locals),
                                "condition": bp.condition_prompt,
                            })
                            self._log_event(
                                "breakpoint_hit", source_file, frame.f_lineno,
                                f"Breakpoint #{bp.id} hit" +
                                (f" (condition: {bp.condition_prompt})" if bp.condition_prompt else ""),
                                dict(self._frame_locals),
                            )

            elif event == "call":
                self._call_stack.append({
                    "function": frame.f_code.co_name,
                    "file": frame.f_code.co_filename,
                    "line": frame.f_lineno,
                })

            elif event == "return":
                if self._call_stack:
                    self._call_stack.pop()

            return trace_fn

        try:
            import sys
            old_trace = sys.gettrace()
            sys.settrace(trace_fn)
            try:
                result = func(*args, **kwargs)
            finally:
                sys.settrace(old_trace)
        except Exception as e:
            error = traceback.format_exc()
            self._log_event("error", source_file, 0, f"Exception: {e}")

        self._state = DebugState.STOPPED
        self._log_event("debug_end", source_file, 0,
                         f"Debugging {func.__name__} complete" +
                         (f" with error: {error}" if error else ""))

        if error:
            raise RuntimeError(f"Debugged function raised an error:\n{error}")

        return result

    # ── Code Snippet Debugging ─────────────────────────────────────────

    def debug_code(self, code: str, globals_dict: Optional[dict] = None,
                   file_name: str = "<string>") -> dict:
        """
        Debug a code string by executing it with tracing.

        Args:
            code: Python source code to debug.
            globals_dict: Optional global variables for the execution context.
            file_name: Synthetic filename for the code (used in reports).

        Returns:
            Dict with execution result and debug info.
        """
        if globals_dict is None:
            globals_dict = {}

        self._state = DebugState.RUNNING
        self._current_file = file_name
        self._frame_locals = {}
        self._log_event("debug_start", file_name, 1, "Debugging code snippet")

        # Parse and get line count
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            self._log_event("error", file_name, e.lineno or 0, f"Syntax error: {e}")
            self._state = DebugState.STOPPED
            return {"success": False, "error": str(e)}

        result_globals = dict(globals_dict)
        error = None

        def trace_fn(frame, event, arg):
            if event == "line":
                self._current_line = frame.f_lineno
                self._frame_locals = dict(frame.f_locals)

                for bp in self._breakpoints:
                    if (bp.enabled and bp.file == file_name
                            and bp.line == frame.f_lineno):
                        bp.hit_count += 1
                        should_pause = True

                        if bp.condition_prompt:
                            should_pause = self._evaluate_condition(
                                bp.condition_prompt, self._frame_locals
                            )

                        if should_pause:
                            self._breakpoint_hits.append({
                                "breakpoint_id": bp.id,
                                "file": file_name,
                                "line": frame.f_lineno,
                                "locals": dict(self._frame_locals),
                                "condition": bp.condition_prompt,
                            })
                            self._log_event(
                                "breakpoint_hit", file_name, frame.f_lineno,
                                f"Breakpoint #{bp.id} hit",
                                dict(self._frame_locals),
                            )
            return trace_fn

        try:
            import sys
            old_trace = sys.gettrace()
            sys.settrace(trace_fn)
            try:
                exec(code, result_globals)
            finally:
                sys.settrace(old_trace)
        except Exception:
            error = traceback.format_exc()
            self._log_event("error", file_name, 0, error)

        self._state = DebugState.STOPPED
        self._log_event("debug_end", file_name, 0, "Code snippet debugging complete")

        self._frame_locals = {k: v for k, v in result_globals.items()
                              if not k.startswith("__")}

        return {
            "success": error is None,
            "error": error,
            "variables": dict(self._frame_locals),
            "breakpoint_hits": len(self._breakpoint_hits),
        }

    # ── Reporting ──────────────────────────────────────────────────────

    def generate_report(self) -> str:
        """
        Generate a comprehensive debug report as a formatted string.

        The report includes:
        - Session summary (breakpoints, hits, errors)
        - Breakpoint details with hit counts
        - Variable snapshots at each breakpoint hit
        - Full event log
        """
        now = datetime.now().isoformat()
        lines = [
            "=" * 60,
            "  IPAShip AI Debugger - Debug Report",
            f"  Generated: {now}",
            "=" * 60,
            "",
            "## Summary",
            f"  Total breakpoints: {len(self._breakpoints)}",
            f"  Breakpoint hits:   {len(self._breakpoint_hits)}",
            f"  Events logged:     {len(self._event_log)}",
            f"  Final state:       {self._state.value}",
            "",
        ]

        # Breakpoints
        if self._breakpoints:
            lines.append("## Breakpoints")
            for bp in self._breakpoints:
                status = "enabled" if bp.enabled else "disabled"
                cond = f' (condition: "{bp.condition_prompt}")' if bp.condition_prompt else ""
                lines.append(f"  #{bp.id} {bp.file}:{bp.line} [{status}] hits={bp.hit_count}{cond}")
            lines.append("")

        # Breakpoint hit snapshots
        if self._breakpoint_hits:
            lines.append("## Breakpoint Hit Snapshots")
            for i, hit in enumerate(self._breakpoint_hits, 1):
                lines.append(f"  Hit #{i}: bp#{hit['breakpoint_id']} at {hit['file']}:{hit['line']}")
                if hit.get("condition"):
                    lines.append(f"    Condition: {hit['condition']}")
                if hit.get("locals"):
                    for k, v in hit["locals"].items():
                        lines.append(f"    {k} = {repr(v)}")
                lines.append("")

        # Event log
        if self._event_log:
            lines.append("## Event Log")
            for evt in self._event_log:
                lines.append(f"  [{evt.timestamp}] {evt.event_type} @ {evt.file}:{evt.line}")
                lines.append(f"    {evt.details}")
                if evt.variables:
                    for k, v in evt.variables.items():
                        lines.append(f"      {k} = {repr(v)}")
            lines.append("")

        lines.append("=" * 60)
        lines.append("  End of Report")
        lines.append("=" * 60)

        return "\n".join(lines)

    def generate_report_json(self) -> str:
        """Generate the debug report as a JSON string."""
        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_breakpoints": len(self._breakpoints),
                "breakpoint_hits": len(self._breakpoint_hits),
                "events_logged": len(self._event_log),
                "final_state": self._state.value,
            },
            "breakpoints": [
                {
                    "id": bp.id,
                    "file": bp.file,
                    "line": bp.line,
                    "condition_prompt": bp.condition_prompt,
                    "hit_count": bp.hit_count,
                    "enabled": bp.enabled,
                }
                for bp in self._breakpoints
            ],
            "breakpoint_hits": self._breakpoint_hits,
            "event_log": [
                {
                    "timestamp": evt.timestamp,
                    "event_type": evt.event_type,
                    "file": evt.file,
                    "line": evt.line,
                    "details": evt.details,
                    "variables": evt.variables,
                }
                for evt in self._event_log
            ],
        }
        return json.dumps(report, indent=2, default=str)

    # ── Call Stack ─────────────────────────────────────────────────────

    def get_call_stack(self) -> list[dict]:
        """Return the current call stack."""
        return list(self._call_stack)

    # ── Internal Helpers ───────────────────────────────────────────────

    def _log_event(self, event_type: str, file: str, line: int,
                   details: str, variables: Optional[dict] = None) -> None:
        """Record a debug event."""
        self._event_log.append(DebugEvent(
            timestamp=datetime.now().isoformat(),
            event_type=event_type,
            file=file,
            line=line,
            details=details,
            variables=variables or {},
        ))

    def reset(self) -> None:
        """Reset the debugger state for a new session."""
        self._breakpoints.clear()
        self._call_stack.clear()
        self._variables.clear()
        self._event_log.clear()
        self._frame_locals.clear()
        self._breakpoint_hits.clear()
        self._state = DebugState.STOPPED
        self._current_file = ""
        self._current_line = 0
        self._next_bp_id = 1

#!/usr/bin/env python3
"""Prolog code checker."""
import argparse
import concurrent.futures
import sys
import os
import re
from pathlib import Path

from utils import (
    load_api_key_from_env_file,
    normalize_goal_text,
    summarize_failed_tests,
    human_error_type,
)

# Ensure local src/ is on path for llm_bridge and helpers
_ROOT = Path(__file__).resolve().parent
_SRC = _ROOT / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

try:
    from dotenv import load_dotenv
    from pathlib import Path as _Path
    # Ensure .env is loaded from the project root (same directory as this file)
    _here = _Path(__file__).resolve().parent
    load_dotenv(_here / ".env")
    load_dotenv()  # also allow fallback search up the tree
except Exception:
    pass

try:
    from pyswip import Prolog
except Exception:
    Prolog = None

_LLM_IMPORT_ERROR = None
try:
    from llm_bridge import generate_test_cases, translate_to_natural_language, generate_ambiguity_hint
except Exception as e:
    _LLM_IMPORT_ERROR = str(e)
    generate_test_cases = translate_to_natural_language = generate_ambiguity_hint = None

_ALGO_DEBUG_IMPORT_ERROR = None
try:
    from algorithmic_debugger import AlgorithmicDebugger, parse_proof_tree_nodes
except Exception as _e:
    _ALGO_DEBUG_IMPORT_ERROR = str(_e)
    AlgorithmicDebugger = parse_proof_tree_nodes = None

_CLAUSE_EXTRACTOR_IMPORT_ERROR = None
try:
    from clause_extractor import ClauseDatabase
except Exception as _e:
    _CLAUSE_EXTRACTOR_IMPORT_ERROR = str(_e)
    ClauseDatabase = None


DEFAULT_SETTINGS = {
    "query_timeout_seconds": 5,
    "llm_test_gen_timeout_seconds": 30,
    "llm_feedback_timeout_seconds": 30,
    "auto_fix_timeout_seconds": 45,
    "validation_call_time_limit_seconds": 5,
    "diagnosis_call_time_limit_seconds": 2,
    "diagnosis_query_timeout_seconds": 3,
    "compact_text_max_chars": 800,
    "compact_student_max_lines": 80,
    "compact_student_max_chars": 2000,
    "compact_error_max_chars": 400,
    "compact_proof_tree_max_chars": 600,
    "compact_debug_summary_max_chars": 1200,
    "summary_test_failures_threshold": 2,
    "summary_choice_points_slow_threshold": 4,
    "llm_log_preview_max_chars": 0,
}


def _env_int(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _load_settings_from_env(base_settings):
    settings = dict(base_settings)
    for key, value in base_settings.items():
        if not isinstance(value, int):
            continue
        env_name = "PROLOG_CHECKER_" + key.upper()
        settings[key] = _env_int(env_name, value)
    return settings

class PrologChecker:
    def __init__(self, problem_file, student_file, use_llm=False, test_cases_file=None,
                 auto_fix=False, max_fix_attempts=2, fix_output_path=None, cut_debug_mode=False,
                 algo_debug=False, user_settings=None):
        self.problem_file = Path(problem_file)
        self.student_file = Path(student_file)
        self.use_llm = use_llm
        self.test_cases_file = Path(test_cases_file) if test_cases_file else None
        self.src_dir = Path(__file__).parent / "src"
        self.api_key = os.getenv("GROQ_API_KEY") or load_api_key_from_env_file(Path(__file__).resolve().parent)
        self.problem_text = self.problem_file.read_text()
        self.student_code = self.student_file.read_text()
        self.predicate_name = None
        self.predicate_arity = None
        self.sample_goal = None
        self.test_case_goals = []
        self.syntax_error = None
        self.auto_fix = auto_fix
        self.max_fix_attempts = max_fix_attempts
        self.fix_output_path = Path(fix_output_path) if fix_output_path else None
        self.last_llm_feedback = None
        self.enable_llm_ambiguity = os.getenv("ENABLE_LLM_AMBIGUITY_HINTS", "false").lower() in ("1", "true", "yes")
        self.cut_debug_mode = cut_debug_mode
        self.algo_debug = algo_debug
        self.settings = _load_settings_from_env(DEFAULT_SETTINGS)
        if user_settings:
            for key, value in user_settings.items():
                if value is not None and key in self.settings:
                    self.settings[key] = int(value)

    def _log(self, log, message):
        log.append(message)
        print(message)
    
    def _extract_tests(self, log):
        tests = []
        for line in self.problem_text.split("\n"):
            m = re.search(r"(\w+)\((.*?)\)\s+should\s+be\s+(true|false)", line, re.I)
            if m:
                p, a, e = m.groups()
                goal = f"{p}({a})"
                if e.lower() == "true":
                    tests.append(f"test({goal}, [{goal}]).")
                else:
                    tests.append(f"test({goal}, []).")
        return "\n".join(tests) if tests else None

    def _load_test_cases_file(self):
        if not self.test_cases_file:
            return []
        text = self.test_cases_file.read_text()
        parts = [p.strip() for p in text.split(".")]
        goals = []
        for part in parts:
            if not part:
                continue
            line = part.split("%", 1)[0].strip()
            if not line:
                continue
            goals.append(line)
        return goals
    
    def _new_prolog(self):
        if Prolog is None:
            raise RuntimeError("pyswip is not installed")
        return Prolog()

    def _consult(self, prolog, path: Path):
        prolog.consult(str(path))

    def _query_one(self, prolog, query, timeout_seconds=None):
        if timeout_seconds is None:
            timeout_seconds = self.settings["query_timeout_seconds"]
        try:
            results = self._call_with_timeout(
                lambda: list(prolog.query(query, maxresult=1)),
                timeout_seconds
            )
            return results[0] if results else None
        except Exception as e:
            return {"__error__": str(e)}

    def _build_human_feedback(self, analysis):
        status = analysis.get("status")
        if status == "correct":
            if analysis.get("proof_tree"):
                return "The program passed all tests. Therefore, the solution appears correct."
            return "The program passed all tests. The solution appears correct."

        if status == "syntax_error":
            err = analysis.get("syntax_error") or {}
            err_type = human_error_type(err.get("type"))
            line = err.get("line")
            line_text = err.get("line_text")
            friendly = err.get("friendly_message")
            line_part = f" on line {line}" if line else ""
            code_part = f" The problematic code is: {line_text}." if line_text else ""
            if friendly:
                return f"There is a syntax error{line_part}: {err_type}.{code_part} {friendly}"
            return f"There is a syntax error{line_part}: {err_type}.{code_part} Please fix the syntax and try again."

        # logic_error or unknown
        test_summary = summarize_failed_tests(analysis.get("error"))

        if test_summary:
            base_case_hint = ""
            if re.search(r"\(0,|\[\]", normalize_goal_text(analysis.get("error")) or ""):
                base_case_hint = (
                    " The base case for the simplest input (e.g., 0 or []) is likely missing or incorrect."
                )
            return (
                f"{test_summary} This suggests the predicate does not handle the base case or recursion correctly."
                f"{base_case_hint} Check your base case and make sure recursive calls move toward it."
            )

        return "Tests failed, but no specific diagnosis was produced. Review the base case and recursive logic."

    def _maybe_ambiguity_hint(self, analysis, log):
        if not self.enable_llm_ambiguity:
            return None
        if not self.api_key or not generate_ambiguity_hint:
            return None
        try:
            hint = generate_ambiguity_hint(self.student_code, self.api_key)
            if hint:
                self._log(log, "LLM ambiguity hint:")
                self._log(log, hint)
            return hint
        except Exception as e:
            self._log(log, f"LLM ambiguity hint failed: {e}")
            return None

    def _detect_predicate_from_tests(self, prolog):
        sol = self._query_one(prolog, "test(G,_), functor(G, Name, Arity)")
        if sol:
            return sol["Name"], int(sol["Arity"])
        return None

    def _detect_predicate_from_file(self, prolog):
        file_path = self.student_file.as_posix()
        query = (
            "predicate_property(Head, file('" + file_path + "')), "
            "\\+ predicate_property(Head, built_in), "
            "functor(Head, Name, Arity)"
        )
        for sol in prolog.query(query):
            name = sol.get("Name")
            arity = sol.get("Arity")
            if name and arity:
                return name, int(arity)
        return None
    
    def prepare_tests(self, log):
        self._log(log, "Preparing test cases...")
        if self.test_cases_file:
            raw_content = self.test_cases_file.read_text()
            # If the file already uses native test/2 format, trust it and skip variable filtering.
            # This allows test files to include unbound-variable goals like test(max(3,5,X), [max(3,5,5)]).
            if re.search(r"^\s*test\(", raw_content, re.MULTILINE):
                self._log(log, f"Loaded test cases (native format): {self.test_cases_file}")
                # Extract only ground goals for proof-trace display (best effort)
                self.test_case_goals = self._parse_tests_to_goals(raw_content)
                return raw_content
            # Otherwise treat each Prolog fact line as a goal and wrap it
            goals = self._load_test_cases_file()
            if goals:
                self._log(log, f"Loaded test cases: {self.test_cases_file}")
                tests = "\n".join([f"test({g}, [{g}])." for g in goals])
                return self._filter_ground_tests(tests)
        extracted = self._extract_tests(log)
        if extracted:
            self._log(log, "Extracted from problem")
            tests_filtered = self._filter_ground_tests(extracted)
            self.test_case_goals = self._parse_tests_to_goals(tests_filtered)
            return tests_filtered
        if self.use_llm and self.api_key and generate_test_cases:
            self._log(log, "\n" + "="*60)
            self._log(log, "GENERATING TEST CASES WITH LLM")
            self._log(log, "="*60)
            self._log(log, "\nLLM INPUT (Test Case Generation):")
            self._log(log, f"\nProblem Text ({len(self.problem_text)} chars):")
            self._log(log, "-" * 40)
            self._log(log, self.problem_text)
            self._log(log, "-" * 40)
            self._log(log, f"\nStudent Code ({len(self.student_code)} chars):")
            self._log(log, "-" * 40)
            self._log(log, self.student_code)
            self._log(log, "-" * 40)
            
            try:
                self._log(log, "\nCalling LLM API (Groq Llama 3.3)...")
                tests = self._call_with_timeout(
                    generate_test_cases,
                    self.settings["llm_test_gen_timeout_seconds"],
                    self.problem_text,
                    self.student_code,
                    self.api_key
                )
                self._log(log, "\nLLM OUTPUT (Generated Test Cases):")
                self._log(log, "-" * 40)
                self._log(log, tests if tests else "(empty)")
                self._log(log, "-" * 40 + "\n")

                tests_filtered = self._filter_ground_tests(tests)
                self.test_case_goals = self._parse_tests_to_goals(tests_filtered)
                return tests_filtered
            except Exception as e:
                self._log(log, f"\nLLM generation failed: {e}\n")
        return None
    
    def check_syntax(self, log):
        self._log(log, "Step 1: Syntax Check (Grammar-based Parser)")
        # Delegate entirely to prolog_parser.pl:check_file_syntax/3 which runs:
        #   Stage 1 – SWI read_term structural check (missing periods, unmatched parens)
        #   Stage 2 – Token-level semantic check (:= operator, lowercase variable names)
        # Returns Status ('ok'/'error') and Messages (pre-formatted strings) separately.
        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.src_dir / "prolog" / "prolog_parser.pl")
            file_path = str(self.student_file.absolute()).replace('\\', '/')
            results = list(prolog.query(f"check_file_syntax('{file_path}', Status, Messages)"))
            if not results:
                # Query failed entirely — treat as ok (parser may not support this file)
                self._log(log, "Syntax OK - No syntax errors found!\n")
                self.syntax_error = None
                return True

            status = results[0].get('Status', b'ok')
            status_str = status.decode('utf-8') if isinstance(status, bytes) else str(status)

            if status_str == 'error':
                raw_msgs = results[0].get('Messages', [])
                error_messages = [
                    m.decode('utf-8') if isinstance(m, bytes) else str(m)
                    for m in (raw_msgs if isinstance(raw_msgs, list) else [])
                ] or ["Syntax error detected by parser"]

                self._log(log, "\n" + "="*60)
                self._log(log, "SYNTAX ERROR DETECTED (Grammar-based Parser)")
                self._log(log, "="*60)
                for i, msg in enumerate(error_messages, 1):
                    self._log(log, f"Error #{i}:")
                    self._log(log, msg)
                    self._log(log, "\n" + "-"*60 + "\n")
                self.syntax_error = {
                    "line": 0,
                    "type": "parse_error",
                    "line_text": error_messages[0],
                    "friendly_message": error_messages[0],
                }
                return False
        except Exception as e:
            # Parser itself unavailable (e.g. pyswip missing) — skip check
            self._log(log, f"(Syntax checker unavailable: {e})")

        self.syntax_error = None
        self._log(log, "Syntax OK - No syntax errors found!\n")
        return True
    
    def _extract_parser_errors(self, prolog, result):
        """Extract error messages from parser result using format_parse_errors/2"""
        messages = []
        result_str = str(result)
        
        # Check if result contains error terms
        if 'error(' not in result_str and 'errors(' not in result_str:
            return messages
        
        try:
            # Query Prolog to format the errors
            # First, extract the error list from the result
            if 'errors([' in result_str:
                import re
                # Extract everything between errors([ and the matching ])
                match = re.search(r'errors\(\[(.*)\]\)', result_str, re.DOTALL)
                if match:
                    error_content = match.group(1)
                    # Try to parse individual error terms
                    if 'invalid_operator' in error_content:
                        op_match = re.search(r"invalid_operator\('?([^']+)'?\)", error_content)
                        if op_match:
                            op = op_match.group(1)
                            if op == ':=':
                                msg = "Invalid operator: :=\n  Hint: Use \"is\" for arithmetic assignment (X is 5)"
                            elif op == '!=':
                                msg = "Invalid operator: !=\n  Hint: Use \"\\=\" for inequality (X \\= Y)"
                            elif op == '&&':
                                msg = "Invalid operator: &&\n  Hint: Use \",\" for conjunction (goal1, goal2)"
                            elif op == '||':
                                msg = "Invalid operator: ||\n  Hint: Use \";\" for disjunction (goal1 ; goal2)"
                            else:
                                msg = f"Invalid operator: {op}"
                            messages.append(msg)
                    
                    if 'lowercase_variable' in error_content:
                        var_match = re.search(r'lowercase_variable\(([^)]+)\)', error_content)
                        if var_match:
                            var = var_match.group(1).strip("'")
                            msg = f"Variable '{var}' starts with lowercase\n  Hint: Variables must start with uppercase or underscore. Try: {var.upper()}"
                            messages.append(msg)
                    
                    if 'missing_period' in error_content:
                        messages.append("Missing period at end of clause\n  Hint: Every Prolog fact or rule must end with a period (.)")
                    
                    if 'unmatched_parentheses' in error_content:
                        messages.append("Unmatched parentheses\n  Hint: Every ( must have a matching )")
                    
                    if 'unmatched_brackets' in error_content:
                        messages.append("Unmatched brackets\n  Hint: Every [ must have a matching ]")
                    
                    if 'missing_clause_body' in error_content:
                        messages.append("Missing clause body after :-\n  Hint: Add goals after :- or remove :- to make it a fact")
                    
                    if 'trailing_comma' in error_content:
                        messages.append("Trailing comma before period\n  Hint: Remove the comma before the period")
        except Exception as e:
            # Fallback: extract error info from result term directly
            if 'error(' in result_str:
                messages.append(f"Parse error detected:\n{result_str}")
            else:
                messages.append(f"Unknown parse error:\n{result_str}")
        
        return messages if messages else ["Syntax error detected by parser"]

    def _parse_tests_to_goals(self, tests_text):
        """Parse test(...) clauses into goal strings for later proof traces."""
        goals = []
        if not tests_text:
            return goals
        for line in tests_text.splitlines():
            line = line.strip()
            if not line or line.startswith('%'):
                continue
            # Accept formats: test(goal, [goal]). or test(goal).
            m = re.match(r"test\((.+?),\s*\[", line)
            if not m:
                m = re.match(r"test\((.+?)\)\.?", line)
            if m:
                goal = m.group(1).strip()
                # Drop trailing period if present in goal part
                if goal.endswith('.'):
                    goal = goal[:-1]
                # Drop non-ground goals (LLM may emit variable-heavy tests that break relationally)
                if re.search(r"\b[A-Z_][A-Za-z0-9_]*\b", goal):
                    continue
                goals.append(goal)
        return goals

    def _filter_ground_tests(self, tests_text):
        """Remove test cases whose goals contain unbound variables to avoid relational blowups."""
        if not tests_text:
            return tests_text
        filtered_lines = []
        for line in tests_text.splitlines():
            if not line.strip().startswith("test("):
                filtered_lines.append(line)
                continue
            m = re.match(r"test\((.+?)(,\s*\[|\)\.)", line.strip())
            if not m:
                filtered_lines.append(line)
                continue
            goal = m.group(1).strip()
            # Drop negative/empty-expected tests to avoid contradictory cases from LLM
            if re.search(r",\s*\[\s*\]\s*\)\.?$", line.strip()):
                continue
            if re.search(r"\b[A-Z_][A-Za-z0-9_]*\b", goal):
                # Skip non-ground goal
                continue
            filtered_lines.append(line)
        return "\n".join(filtered_lines)
    
    def run_analysis(self, tests, log):
        self._log(log, "Step 2: Logical Analysis")
        trace_records = []
        
        # Show what we're analyzing
        if tests:
            self._log(log, "\nTest Cases Being Used:")
            self._log(log, "-" * 40)
            test_lines = tests.strip().split('\n')
            for i, test_line in enumerate(test_lines, 1):
                if test_line.strip() and not test_line.strip().startswith('%'):
                    self._log(log, f"  {i}. {test_line.strip()}")
            self._log(log, "-" * 40 + "\n")
        
        tf = Path("temp_tests.pl")
        if tests:
            tf.write_text(tests)

        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.src_dir / "prolog" / "meta_interpreter.pl")
            self._consult(prolog, self.src_dir / "prolog" / "diagnosis_engine.pl")
            self._consult(prolog, self.student_file)
            if tests:
                self._consult(prolog, tf)

            pred = None
            if tests:
                pred = self._detect_predicate_from_tests(prolog)
            if not pred:
                pred = self._detect_predicate_from_file(prolog)
            if not pred:
                return {"status":"unknown", "error":"No predicate"}

            self.predicate_name, self.predicate_arity = pred
            goal_template = f"{self.predicate_name}({', '.join(['_'] * self.predicate_arity)})"

            if tests and not self.sample_goal:
                sample = self._query_one(prolog, "test(G,_), term_string(G, S)")
                if sample:
                    self.sample_goal = normalize_goal_text(sample.get("S"))

            if self.test_case_goals:
                self._log(log, "Test Proof Trees:")
                for goal in self.test_case_goals:
                    tree = normalize_goal_text(self._gen_proof_for_goal(goal))
                    trace = normalize_goal_text(self._gen_trace_for_goal(prolog, goal))
                    trace_records.append({"goal": goal, "trace": trace})
                    self._log(log, f"\nQuery: {goal}")
                    if trace:
                        self._log(log, "Execution Trace:")
                        self._log(log, trace)
                    if tree:
                        self._log(log, "Proof Tree:")
                        self._log(log, tree)
                    else:
                        self._log(log, "No proof tree (query failed)")
                    self._log(log, "---")

            proof_tree = normalize_goal_text(self._gen_proof())
            if proof_tree:
                self._log(log, "Proof Tree:\n" + proof_tree)

            trace_goal = self.sample_goal if self.sample_goal else goal_template
            exec_trace = normalize_goal_text(self._gen_trace_for_goal(prolog, trace_goal))
            trace_records.append({"goal": trace_goal, "trace": exec_trace})
            if exec_trace:
                self._log(log, "Execution Trace:\n" + exec_trace)

            if tests:
                validate_time_limit = self.settings["validation_call_time_limit_seconds"]
                q = (
                    f"catch(call_with_time_limit({validate_time_limit}, ("
                    f"findall(test(G,E), test(G,E), Tests), "
                    f"meta_interpreter:validate_with_tests({goal_template}, Tests, Errors)"
                    f")), _, (Errors = [timeout], Diagnoses = []))"
                )
            else:
                q = f"meta_interpreter:validate_with_tests({goal_template}, [], Errors)"

            result = self._query_one(prolog, q)
            if result is None:
                return {"status":"logic_error", "error":"Validation failed"}
            if isinstance(result, dict) and result.get("__error__"):
                return {"status":"logic_error", "error":result.get("__error__")}
            errors = result.get("Errors")
            is_empty_errors = (errors == [] or str(errors) == "[]")

            if is_empty_errors:
                # Tests passed — run Shapiro structural analysis to detect latent issues.
                shapiro_mode_val = "ok"
                shapiro_text = ""
                diag_call_limit = self.settings["diagnosis_call_time_limit_seconds"]
                q_shapiro = (
                    "catch(call_with_time_limit(" + str(diag_call_limit) + ", ("
                    "diagnosis_engine:shapiro_diagnose(" + goal_template + ", Mode, Data),"
                    "term_string(Mode, MS),"
                    "diagnosis_engine:shapiro_nodes_text(Mode, Data, Text)"
                    ")), _, (MS='ok', Text=''))"
                )
                shapiro_result = self._query_one(prolog, q_shapiro, timeout_seconds=self.settings["diagnosis_query_timeout_seconds"])
                if shapiro_result:
                    ms = shapiro_result.get("MS") or b"ok"
                    shapiro_mode_val = normalize_goal_text(ms) or "ok"
                    raw_text = shapiro_result.get("Text") or ""
                    if isinstance(raw_text, bytes):
                        raw_text = raw_text.decode("utf-8", errors="replace")
                    shapiro_text = normalize_goal_text(raw_text) or ""

                if shapiro_text.strip():
                    self._log(log, f"Shapiro Analysis Mode: {shapiro_mode_val}")
                    self._log(log, shapiro_text.strip())

                is_buggy = shapiro_mode_val not in ("ok", "incorrect", "")
                status = "correct_with_diagnoses" if is_buggy else "correct"
                return {
                    "status": status,
                    "proof_tree": proof_tree,
                    "shapiro_mode": shapiro_mode_val,
                    "shapiro_nodes_text": shapiro_text,
                    "trace_records": trace_records,
                }
            if errors is None:
                if tests:
                    return {"status":"logic_error", "error":"Validation failed"}
                self._log(log, "Trying proof tree...")
                if proof_tree:
                    return {"status":"correct", "proof_tree":proof_tree, "trace_records": trace_records}
                return {"status":"logic_error", "error":"No proof tree"}
            # Tests failed — run Shapiro structural analysis on a concrete failing goal.
            # Using goal_template (all wildcards) throws instantiation_error in arithmetic
            # guards, so we pick the first test goal that actually fails.
            shapiro_mode_val = "unknown"
            shapiro_text = ""
            diag_call_limit = self.settings["diagnosis_call_time_limit_seconds"]
            q_shapiro = (
                "catch(call_with_time_limit(" + str(diag_call_limit) + ", ("
                "(meta_interpreter:first_failing_test(SGoal) -> true ; SGoal = " + goal_template + "),"
                "diagnosis_engine:shapiro_diagnose(SGoal, Mode, Data),"
                "term_string(Mode, MS),"
                "diagnosis_engine:shapiro_nodes_text(Mode, Data, Text)"
                ")), _, (MS='unknown', Text=''))"
            )
            shapiro_result = self._query_one(prolog, q_shapiro, timeout_seconds=self.settings["diagnosis_query_timeout_seconds"])
            if shapiro_result:
                ms = shapiro_result.get("MS") or b"unknown"
                shapiro_mode_val = normalize_goal_text(ms) or "unknown"
                raw_text = shapiro_result.get("Text") or ""
                if isinstance(raw_text, bytes):
                    raw_text = raw_text.decode("utf-8", errors="replace")
                shapiro_text = normalize_goal_text(raw_text) or ""

            if shapiro_text.strip():
                self._log(log, f"Shapiro Analysis Mode: {shapiro_mode_val}")
                self._log(log, shapiro_text.strip())

            return {
                "status": "logic_error",
                "error": str(errors),
                "shapiro_mode": shapiro_mode_val,
                "shapiro_nodes_text": shapiro_text,
                "proof_tree": proof_tree,
                "trace_records": trace_records,
            }
        finally:
            if tf.exists():
                tf.unlink()

    def _analyze_debug(self, analysis):
        trace_records = analysis.get("trace_records") or []
        traces = [r.get("trace") for r in trace_records if r and r.get("trace")]
        all_trace_text = "\n".join(traces)

        cut_events = all_trace_text.count("CUT - pruning alternatives")
        choice_points = all_trace_text.count("choice point")
        failed_steps = all_trace_text.count("(failed)")
        depth_limit_hits = all_trace_text.count("Depth limit exceeded")

        has_cut_in_code = bool(re.search(r"(^|[^A-Za-z0-9_])!(?=\s|,|\.|\)|$)", self.student_code, re.M))
        is_cut_context = has_cut_in_code or cut_events > 0
        status = analysis.get("status")
        error_text = str(analysis.get("error") or "")
        test_failures = len(re.findall(r"test_failure\(", error_text))
        findings = []
        if test_failures >= self.settings["summary_test_failures_threshold"]:
            findings.append((
                "Multiple wrong answers",
                "Test failures",
                f"{test_failures} failing test cases were reported."
            ))
        if (depth_limit_hits > 0 or "timeout" in error_text.lower()):
            findings.append((
                "Potential non-termination",
                "Depth/time limit reached",
                "Execution exceeded depth/time limits in trace."
            ))
        if choice_points > 0 and cut_events == 0 and is_cut_context:
            findings.append((
                "Backtracking remains active",
                "No cut pruning observed",
                "Choice points were explored without any cut event in trace."
            ))
        if status in ("correct", "correct_with_diagnoses") and choice_points >= self.settings["summary_choice_points_slow_threshold"] and cut_events == 0:
            findings.append((
                "Correct answer but slow search",
                "Missing pruning",
                "Many choice points were explored with no cut events in trace."
            ))

        unique_findings = []
        seen_findings = set()
        for item in findings:
            key = (item[0], item[1])
            if key in seen_findings:
                continue
            seen_findings.add(key)
            unique_findings.append(item)

        return {
            "is_cut_context": is_cut_context,
            "cut_events": cut_events,
            "choice_points": choice_points,
            "failed_steps": failed_steps,
            "depth_limit_hits": depth_limit_hits,
            "findings": unique_findings,
        }

    def _build_debug_summary_text(self, summary):
        title = "DEBUGGING SUMMARY"
        lines = [
            title,
            "=" * len(title),
            f"- cut events: {summary['cut_events']}",
            f"- choice points: {summary['choice_points']}",
            f"- failed steps: {summary['failed_steps']}",
            f"- depth limit hits: {summary['depth_limit_hits']}"
        ]
        findings = summary.get("findings") or []
        if findings:
            lines.append("Likely behavior → cause:")
            for behavior, cause, evidence in findings:
                lines.append(f"* {behavior} -> {cause}")
                lines.append(f"  evidence: {evidence}")
        else:
            if summary.get("is_cut_context"):
                lines.append("No strong CUT misuse signal from current traces.")
            else:
                lines.append("No strong logic misuse signal from current traces.")
        return "\n".join(lines)

    def _compact_text(self, value, max_chars=None):
        if value is None:
            return None
        if max_chars is None:
            max_chars = self.settings["compact_text_max_chars"]
        text = str(value)
        if len(text) <= max_chars:
            return text
        return text[:max_chars].rstrip() + f" ...[truncated {len(text) - max_chars} chars]"

    def _compact_student_code(self, code_text, max_lines=None, max_chars=None):
        if not code_text:
            return ""
        if max_lines is None:
            max_lines = self.settings["compact_student_max_lines"]
        if max_chars is None:
            max_chars = self.settings["compact_student_max_chars"]
        lines = code_text.splitlines()
        clipped = lines[:max_lines]
        text = "\n".join(clipped)
        if len(lines) > max_lines:
            text += f"\n% ... truncated {len(lines) - max_lines} lines"
        if len(text) > max_chars:
            text = text[:max_chars].rstrip() + f"\n% ... truncated {len(text) - max_chars} chars"
        return text

    def _build_llm_input_payload(self, analysis):
        payload = {
            "status": analysis.get("status"),
            "error": self._compact_text(analysis.get("error"), self.settings["compact_error_max_chars"]),
            "proof_tree": self._compact_text(analysis.get("proof_tree"), self.settings["compact_proof_tree_max_chars"]),
            "shapiro_mode": analysis.get("shapiro_mode"),
            "shapiro_nodes_text": self._compact_text(analysis.get("shapiro_nodes_text"), self.settings["compact_text_max_chars"]),
            "syntax_error": analysis.get("syntax_error"),
            "debug_summary": self._compact_text(analysis.get("debug_summary"), self.settings["compact_debug_summary_max_chars"]),
            "student_error_code": self._compact_student_code(analysis.get("student_error_code") or self.student_code)
        }
        return payload

    def _log_debug_summary(self, analysis, log):
        summary_text = self._attach_debug_summary(analysis)
        analysis["debug_summary"] = summary_text
        self._log(log, "")
        for line in summary_text.split("\n"):
            self._log(log, line)

    def _attach_debug_summary(self, analysis):
        summary = self._analyze_debug(analysis)
        summary_text = self._build_debug_summary_text(summary)
        analysis["debug_summary"] = summary_text
        return summary_text
    
    def _gen_proof(self):
        if not self.predicate_name:
            return None
        if self.sample_goal:
            goal = normalize_goal_text(self.sample_goal)
        else:
            goal = f"{self.predicate_name}({', '.join(['_'] * self.predicate_arity)})"

        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.src_dir / "prolog" / "meta_interpreter.pl")
            self._consult(prolog, self.student_file)
            if not self.sample_goal:
                file_path = self.student_file.as_posix()
                q_head = (
                    "predicate_property(Head, file('" + file_path + "')), "
                    "\\+ predicate_property(Head, built_in), "
                    "term_string(Head, S)"
                )
                head = self._query_one(prolog, q_head)
                if head and head.get("S"):
                    goal = normalize_goal_text(head.get("S"))

            q = f"meta_interpreter:solve_with_trace({goal}, T), with_output_to(string(S), meta_interpreter:print_proof_tree(T))"
            sol = self._query_one(prolog, q)
            if sol and sol.get("S"):
                return sol["S"].strip()
        except Exception:
            return None
        return None

    def _gen_proof_for_goal(self, goal):
        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.src_dir / "prolog" / "meta_interpreter.pl")
            self._consult(prolog, self.student_file)
            q = (
                "catch((meta_interpreter:solve_with_trace(" + goal + ", T), "
                "with_output_to(string(S), meta_interpreter:print_proof_tree(T))), _, fail)"
            )
            sol = self._query_one(prolog, q)
            if sol and sol.get("S"):
                return sol["S"].strip()
        except Exception:
            return None
        return None
    
    def _gen_trace_for_goal(self, prolog, goal):
        """Generate execution trace for a goal showing depth and call sequence."""
        try:
            q = (
                "catch(("
                "meta_interpreter:trace_execution_with_failure(" + goal + ", Trace), "
                "meta_interpreter:format_execution_trace(Trace, S)"
                "), _, S='Error generating trace')"
            )
            sol = self._query_one(prolog, q)
            if sol and sol.get("S"):
                return sol["S"].strip()
        except Exception:
            return None
        return None
    
    def gen_feedback(self, analysis, log):
        self._log(log, "Step 3: Feedback")
        if "student_error_code" not in analysis:
            analysis["student_error_code"] = self.student_code
        llm_input = self._build_llm_input_payload(analysis)
        llm_analysis = dict(analysis)
        llm_analysis["error"] = llm_input.get("error")
        llm_analysis["proof_tree"] = llm_input.get("proof_tree")
        llm_analysis["debug_summary"] = llm_input.get("debug_summary")
        if not self.api_key or not translate_to_natural_language:
            self._log(log, "LLM Input:")
            self._log(log, str(llm_input))

            if not self.api_key:
                self._log(log, "LLM disabled: GROQ_API_KEY not set.")
            if not translate_to_natural_language and _LLM_IMPORT_ERROR:
                self._log(log, f"LLM disabled: llm_bridge import failed ({_LLM_IMPORT_ERROR}).")
            elif not translate_to_natural_language:
                self._log(log, "LLM disabled: translate_to_natural_language unavailable.")

            basic_output = self._build_human_feedback(analysis)
            self._maybe_ambiguity_hint(analysis, log)
            self._log(log, "LLM Output:")
            self._log(log, basic_output if basic_output else "(no output)")
            # Ensure downstream auto-fix can still run even when no LLM feedback was produced
            self.last_llm_feedback = basic_output
            return
        
        # LLM-based feedback generation
        try:
            self._log(log, "\n" + "="*60)
            self._log(log, "GENERATING NATURAL LANGUAGE FEEDBACK WITH LLM")
            self._log(log, "="*60)

            self._log(log, "\nLLM INPUT (Feedback Generation):")
            self._log(log, "-" * 40)
            self._log(log, "Analysis Results:")
            for key, value in llm_input.items():
                if value:
                    val_str = str(value)
                    preview_limit = self.settings["llm_log_preview_max_chars"]
                    if preview_limit and preview_limit > 0:
                        preview = val_str[:preview_limit] + ("..." if len(val_str) > preview_limit else "")
                    else:
                        preview = val_str
                    self._log(log, f"  {key}: {preview}")
            self._log(log, f"\nProblem Text ({len(self.problem_text)} chars)")
            self._log(log, f"Student Code ({len(self.student_code)} chars)")
            self._log(log, "-" * 40)
            
            self._log(log, "\nCalling LLM API (Groq Llama 3.3)...")
            fb = self._call_with_timeout(
                translate_to_natural_language,
                self.settings["llm_feedback_timeout_seconds"],
                llm_analysis,
                self.problem_text,
                llm_input.get("student_error_code") or self.student_code,
                self.api_key
            )
            self.last_llm_feedback = fb

            self._maybe_ambiguity_hint(analysis, log)
            
            self._log(log, "\nLLM OUTPUT (Natural Language Feedback):")
            self._log(log, "="*60)
            self._log(log, fb)
            self._log(log, "="*60 + "\n")
            
        except Exception as e:
            self._log(log, f"\nLLM translation failed: {e}\n")
            # Fallback to basic output
            basic_output = self._build_human_feedback(analysis)
            self.last_llm_feedback = basic_output
            self._log(log, "LLM Output (fallback):")
            self._log(log, basic_output if basic_output else "(no output)")

    def _call_with_timeout(self, func, timeout_seconds, *args):
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(func, *args)
            return future.result(timeout=timeout_seconds)

    def _extract_code_block(self, text):
        if not text:
            return None
        if "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                return parts[1].replace("prolog", "", 1).strip()
        return text.strip()

    def _evaluate_candidate(self, code_text, tests_text, log):
        tmp_path = Path("temp_autofix.pl")
        tmp_path.write_text(code_text)
        try:
            original_file = self.student_file
            original_code = self.student_code
            self.student_file = tmp_path
            self.student_code = code_text
            if not self.check_syntax(log):
                return {"status": "syntax_error", "syntax_error": self.syntax_error}
            analysis = self.run_analysis(tests_text, log)
            return analysis
        finally:
            self.student_file = original_file
            self.student_code = original_code
            if tmp_path.exists():
                tmp_path.unlink()

    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # Algorithmic Debugging (LLM-as-Oracle, Shapiro's Method)
    # ------------------------------------------------------------------

    def _get_proof_nodes_structured(self, goal_str, failing_goal=None):
        """Retrieve Shapiro-typed nodes for *goal_str* via Prolog's shapiro_mode/3.

        Routes automatically to the correct meta-interpreter:
          incorrect      -> ProofNode list  (goal succeeds, wrong answer)
          incomplete     -> IncompleteNode list  (goal fails)
          nonterminating -> TerminationNode list (goal loops)
          ok             -> []

        Returns (nodes, mode_label) tuple.
        """
        if parse_proof_tree_nodes is None:
            return [], "error"
        try:
            from algorithmic_debugger import ProofNode, IncompleteNode, TerminationNode
        except ImportError:
            return [], "error"

        def _decode(v):
            if isinstance(v, bytes):
                return v.decode("utf-8", errors="replace")
            return str(v) if v is not None else ""

        def _int(v):
            if isinstance(v, int):
                return v
            try:
                return int(_decode(v))
            except Exception:
                return 0

        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.src_dir / "prolog" / "meta_interpreter.pl")
            self._consult(prolog, self.src_dir / "prolog" / "diagnosis_engine.pl")
            self._consult(prolog, self.student_file)

            # --- Determine Shapiro mode ---
            q_mode = (
                "catch(("
                "meta_interpreter:shapiro_mode(" + goal_str + ", Mode, _),"
                "term_string(Mode, MS)"
                "), _, (MS='error'))"
            )
            mode_sol = self._query_one(prolog, q_mode)
            mode = _decode(mode_sol.get("MS") if mode_sol else "error").strip("'\"")

            nodes = []
            seen = set()

            if mode == "incorrect":
                # INCORRECTNESS DEBUGGER: iterate proof-tree nodes
                q = (
                    "catch(("
                    "meta_interpreter:solve_with_trace(" + goal_str + ", Tree),"
                    "meta_interpreter:extract_proof_nodes(Tree, Nodes),"
                    "member(node(G,B,D), Nodes),"
                    "copy_term(G-B, GC-BC), numbervars(GC-BC, 0, _),"
                    "with_output_to(atom(GS), write_term(GC, [numbervars(true), quoted(false)])),"
                    "with_output_to(atom(BS), write_term(BC, [numbervars(true), quoted(false)]))"
                    "), _, fail)"
                )
                for sol in prolog.query(q):
                    gs = _decode(sol.get("GS", ""))
                    bs = _decode(sol.get("BS", ""))
                    d  = _int(sol.get("D", 0))
                    if not gs or (gs, bs) in seen:
                        continue
                    seen.add((gs, bs))
                    nodes.append(ProofNode(
                        goal=gs, body=bs, depth=d,
                        is_fact=bs.strip() in ("true", ""),
                        failing_goal=failing_goal or "",
                    ))
                return nodes, "incorrectness (proof tree)"

            elif mode == "incomplete":
                # INCOMPLETENESS DEBUGGER: enumerate existing clauses
                q = (
                    "catch(("
                    "meta_interpreter:debug_incomplete(" + goal_str + ", Clauses),"
                    "member(clause(H,B), Clauses),"
                    "copy_term(H-B, HC-BC), numbervars(HC-BC, 0, _),"
                    "with_output_to(atom(GS), write_term(HC, [numbervars(true), quoted(false)])),"
                    "with_output_to(atom(BS), write_term(BC, [numbervars(true), quoted(false)]))"
                    "), _, fail)"
                )
                for sol in prolog.query(q):
                    gs = _decode(sol.get("GS", ""))
                    bs = _decode(sol.get("BS", ""))
                    if not gs or (gs, bs) in seen:
                        continue
                    seen.add((gs, bs))
                    nodes.append(IncompleteNode(
                        goal=gs, body=bs, depth=0,
                        is_fact=bs.strip() in ("true", ""),
                        failing_goal=failing_goal or "",
                    ))
                return nodes, "incompleteness (clause inspection)"

            elif mode == "nonterminating":
                # TERMINATION DEBUGGER: enumerate non-progressing recursive clauses
                q = (
                    "catch(("
                    "meta_interpreter:debug_nonterminating(" + goal_str + ", FRs),"
                    "member(non_progressing(H,B,Rec), FRs),"
                    "copy_term(H-B-Rec, HC-BC-RC), numbervars(HC-BC-RC, 0, _),"
                    "with_output_to(atom(GS), write_term(HC, [numbervars(true), quoted(false)])),"
                    "with_output_to(atom(BS), write_term(BC, [numbervars(true), quoted(false)])),"
                    "with_output_to(atom(RS), write_term(RC, [numbervars(true), quoted(false)]))"
                    "), _, fail)"
                )
                for sol in prolog.query(q):
                    gs  = _decode(sol.get("GS", ""))
                    bs  = _decode(sol.get("BS", ""))
                    rs  = _decode(sol.get("RS", ""))
                    if not gs or (gs, bs) in seen:
                        continue
                    seen.add((gs, bs))
                    nodes.append(TerminationNode(
                        goal=gs, body=bs, rec_call=rs, depth=0,
                        failing_goal=failing_goal or "",
                    ))
                return nodes, "nontermination (termination debugger)"

            else:  # ok or error
                return [], mode or "ok"

        except Exception:
            return [], "error"

    def _failing_goals_from_analysis(self, analysis):
        """Extract goals that failed their tests from analysis['error'].
        Handles nested parentheses in goal terms (e.g. factorial(0, 1)).
        """
        error_text = str(analysis.get("error") or "")
        goals = []
        for m in re.finditer(r"test_failure\(", error_text):
            start = m.end()  # start of the goal term
            depth = 1
            i = start
            while i < len(error_text) and depth > 0:
                c = error_text[i]
                if c == '(':
                    depth += 1
                elif c == ')':
                    depth -= 1
                elif c == ',' and depth == 1:
                    break  # end of goal argument at top level
                i += 1
            goal = error_text[start:i].strip()
            if goal:
                goals.append(goal)
        return goals

    def run_algorithmic_debug(self, analysis, log):
        """Run Shapiro-style algorithmic debugging using the LLM as oracle.

        Routes each goal through ``shapiro_mode/3`` which auto-selects one of
        Shapiro's four meta-interpreters:
          incorrect      → ProofNode list  (goal succeeds with wrong answer)
          incomplete     → IncompleteNode list  (goal fails, clauses enumerated)
          nonterminating → TerminationNode list (goal loops, bad recursions)
          ok             → [] (no debugging needed)

        The LLM acts as Shapiro's oracle, answering YES/NO for each node.
        """
        self._log(log, "")
        self._log(log, "=" * 60)
        self._log(log, "ALGORITHMIC DEBUGGING (LLM as Oracle — Shapiro's Method)")
        self._log(log, "=" * 60)

        if AlgorithmicDebugger is None or parse_proof_tree_nodes is None:
            self._log(log, f"Algorithmic debugger unavailable: {_ALGO_DEBUG_IMPORT_ERROR}")
            return

        if not self.api_key:
            self._log(log, "Algorithmic debugging skipped: GROQ_API_KEY not set.")
            return

        # --- build goal lists ---
        template = (
            f"{self.predicate_name}({', '.join(['_'] * self.predicate_arity)})"
            if self.predicate_name else None
        )

        # Goals from test cases (may succeed or fail depending on correctness)
        test_goals = list(self.test_case_goals) if self.test_case_goals else []
        if self.sample_goal and self.sample_goal not in test_goals:
            test_goals.append(self.sample_goal)
        if not test_goals and template:
            test_goals.append(template)

        # Goals explicitly reported as failing tests
        failing_goals = self._failing_goals_from_analysis(analysis)

        # --- collect nodes ---
        all_nodes = []
        seen_goals: set = set()

        # For each test goal — shapiro_mode auto-routes to the right meta-interpreter
        for goal in test_goals:
            if goal in seen_goals:
                continue
            seen_goals.add(goal)
            fg = goal if goal in failing_goals else None
            nodes, source = self._get_proof_nodes_structured(goal, failing_goal=fg)
            if nodes:
                self._log(log, f"  {goal}  →  {len(nodes)} node(s) via {source}")
            all_nodes.extend(nodes)

        # For failing goals not already covered above
        for goal in failing_goals:
            if goal in seen_goals:
                continue
            seen_goals.add(goal)
            # Use template for clause enumeration so we get real clause heads
            probe = template or goal
            nodes, source = self._get_proof_nodes_structured(probe, failing_goal=goal)
            if nodes:
                self._log(log, f"  {goal}  →  {len(nodes)} node(s) via {source}")
            all_nodes.extend(nodes)

        if not all_nodes:
            self._log(log, "No nodes available for algorithmic debugging.")
            self._log(log, "(All goals failed before any clause could fire — "
                           "check for syntax errors or completely missing predicate.)")
            return

        self._log(log, f"Total: {len(all_nodes)} node(s) queued for oracle.")

        def _log_fn(msg):
            self._log(log, msg)

        algo_timeout = int(os.getenv("ALGO_DEBUG_ORACLE_TIMEOUT", "20"))

        # Build clause database from student code for original clause resolution
        clause_db = None
        if ClauseDatabase is not None:
            try:
                clause_db = ClauseDatabase.from_source(self.student_code)
                self._log(log, f"[Info] Loaded {len(clause_db.clauses)} clause(s) from student code.")
                self._log(log, "[Info] Oracle will query original clause patterns (not instantiations).")
            except Exception as e:
                self._log(log, f"[Warning] Clause extraction failed ({e}); falling back to instantiated nodes.")
                clause_db = None

        debugger = AlgorithmicDebugger(
            problem_text=self.problem_text,
            api_key=self.api_key,
            log_fn=_log_fn,
            oracle_timeout=algo_timeout,
            clause_db=clause_db,
        )

        oracle_results = debugger.run(all_nodes)
        report = debugger.format_report(oracle_results)

        self._log(log, "")
        for line in report.splitlines():
            self._log(log, line)

        faulty = debugger.find_faulty_clauses(oracle_results)
        analysis["algo_debug_report"] = report
        analysis["algo_debug_faulty"] = [
            {
                "goal": n.goal,
                "body": n.body,
                "depth": getattr(n, "depth", 0),
                "rec_call": getattr(n, "rec_call", None),
                "reason": n.oracle_reason,
            }
            for n in faulty
        ]

    def _attempt_auto_fix(self, analysis, tests_text, log):
        # Requires explicit opt-in and an API key, but does not require prior LLM feedback.
        if not self.auto_fix:
            self._log(log, "Auto-correction skipped (auto_fix disabled).")
            return

        self._log(log, "")
        self._log(log, "AUTO-CORRECTION")
        self._log(log, "================")
        self._log(log, "Before fixing code:")
        debug_summary = analysis.get("debug_summary")
        if debug_summary:
            self._log(log, "Debug summary:")
            self._log(log, debug_summary)
        self._log(log, "Student error code:")
        self._log(log, self.student_code)

        if not self.api_key:
            self._log(log, "Auto-correction skipped: GROQ_API_KEY not set.")
            return
        try:
            from llm_bridge import generate_correct_code
        except Exception as e:
            self._log(log, f"Auto-correction skipped: cannot import generate_correct_code ({e}).")
            return

        current_code = self.student_code
        final_corrected_code = None
        correction_succeeded = False
        # Fall back to basic human-readable feedback when no LLM feedback exists
        feedback = self.last_llm_feedback or self._build_human_feedback(analysis) or ""
        error_summary = analysis.get("error")

        for attempt in range(1, self.max_fix_attempts + 1):
            self._log(log, f"Attempt {attempt}/{self.max_fix_attempts}")
            self._log(log, "Input summary:")
            self._log(log, f"- Error: {error_summary}")
            self._log(log, f"- Feedback length: {len(feedback) if feedback else 0}")
            self._log(log, "Calling LLM code fixer...")

            fix_response = self._call_with_timeout(
                generate_correct_code,
                self.settings["auto_fix_timeout_seconds"],
                self.problem_text,
                current_code,
                feedback,
                str(error_summary),
                self.api_key
            )

            fixed_code = self._extract_code_block(fix_response)
            self._log(log, "Corrected code:")
            self._log(log, fixed_code if fixed_code else "(empty)")

            if not fixed_code:
                self._log(log, "No corrected code returned. Stopping.")
                break

            final_corrected_code = fixed_code
            current_code = fixed_code

            eval_result = self._evaluate_candidate(fixed_code, tests_text, log)
            if eval_result.get("status") in ("correct", "correct_with_diagnoses"):
                self._log(log, "Auto-correction succeeded.")
                correction_succeeded = True
                if self.fix_output_path:
                    self.fix_output_path.write_text(fixed_code)
                else:
                    self._log(log, "Corrected code saved in log only.")
                break

            error_summary = eval_result.get("error") or eval_result.get("syntax_error")
            feedback = self.last_llm_feedback or feedback

        self._log(log, "Auto-correction finished.")
        if final_corrected_code:
            self._log(log, "Final corrected code:")
            self._log(log, final_corrected_code)
            if self.fix_output_path and not correction_succeeded:
                self.fix_output_path.write_text(final_corrected_code)
    
    def run(self):
        log = []
        self._log(log, "PROLOG CODE CHECKER")
        self._log(log, f"Problem: {self.problem_file.name}")
        self._log(log, f"Student Code: {self.student_file.name}")

        if self.check_syntax(log):
            tests = self.prepare_tests(log)
            analysis = self.run_analysis(tests, log)
            analysis["student_error_code"] = self.student_code
            self._attach_debug_summary(analysis)
            if self.cut_debug_mode:
                self._log_debug_summary(analysis, log)
            if self.algo_debug:
                self.run_algorithmic_debug(analysis, log)
            self.gen_feedback(analysis, log)
            self._attempt_auto_fix(analysis, tests, log)
        else:
            if self.syntax_error:
                analysis = {
                    "status": "syntax_error",
                    "error": self.syntax_error.get("type"),
                    "syntax_error": self.syntax_error
                }
                self.gen_feedback(analysis, log)
                self._attempt_auto_fix(analysis, None, log)

        if self.predicate_name:
            self._log(log, f"Predicate: {self.predicate_name}/{self.predicate_arity}")

        return "\n".join(log)

def parse_args():
    parser = argparse.ArgumentParser(description="Prolog code checker")
    parser.add_argument("--problem", required=True, help="Path to problem file")
    parser.add_argument("--student_code", required=True, help="Path to student Prolog code")
    parser.add_argument("--test_cases", help="Path to Prolog test queries file")
    parser.add_argument("--output", required=True, help="Path to output text file")
    parser.add_argument("--auto_fix", action="store_true", help="Enable LLM-based code correction")
    parser.add_argument("--max_fix_attempts", type=int, default=2, help="Max correction attempts")
    parser.add_argument("--fix_output", help="Path to save corrected code")
    parser.add_argument("--cut_debug", action="store_true", help="Enable CUT debugging summary based on execution traces")
    parser.add_argument("--algo_debug", action="store_true",
                        help="Enable Shapiro-style algorithmic debugging using the LLM as oracle")

    parser.add_argument("--query_timeout_seconds", type=int, help="Timeout for generic Prolog queries")
    parser.add_argument("--llm_test_gen_timeout_seconds", type=int, help="Timeout for LLM test generation")
    parser.add_argument("--llm_feedback_timeout_seconds", type=int, help="Timeout for LLM feedback generation")
    parser.add_argument("--auto_fix_timeout_seconds", type=int, help="Timeout for LLM auto-fix generation")
    parser.add_argument("--validation_call_time_limit_seconds", type=int, help="Prolog call_with_time_limit for test validation")
    parser.add_argument("--diagnosis_call_time_limit_seconds", type=int, help="Prolog call_with_time_limit for diagnosis generation")
    parser.add_argument("--diagnosis_query_timeout_seconds", type=int, help="Python-side timeout wrapping diagnosis query calls")

    parser.add_argument("--compact_text_max_chars", type=int, help="Default max chars for compacted text fields")
    parser.add_argument("--compact_student_max_lines", type=int, help="Max lines for student code in LLM payload")
    parser.add_argument("--compact_student_max_chars", type=int, help="Max chars for student code in LLM payload")
    parser.add_argument("--compact_error_max_chars", type=int, help="Max chars for error field in LLM payload")
    parser.add_argument("--compact_proof_tree_max_chars", type=int, help="Max chars for proof tree field in LLM payload")
    parser.add_argument("--compact_debug_summary_max_chars", type=int, help="Max chars for debug summary in LLM payload")

    parser.add_argument("--summary_test_failures_threshold", type=int, help="Threshold for reporting test-failure finding")
    parser.add_argument("--summary_choice_points_slow_threshold", type=int, help="Choice-point threshold for slow-search finding")
    parser.add_argument("--llm_log_preview_max_chars", type=int, help="Per-field LLM input preview limit in logs (0 = full)")

    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    user_settings = {k: getattr(args, k, None) for k in DEFAULT_SETTINGS.keys()}
    checker = PrologChecker(
        args.problem,
        args.student_code,
        True,
        args.test_cases,
        auto_fix=args.auto_fix,
        max_fix_attempts=args.max_fix_attempts,
        fix_output_path=args.fix_output,
        cut_debug_mode=args.cut_debug,
        algo_debug=args.algo_debug,
        user_settings=user_settings,
    )
    output_text = checker.run()
    Path(args.output).write_text(output_text)
    print(output_text)
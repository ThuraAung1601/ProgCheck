#!/usr/bin/env python3
"""Prolog code checker."""
import argparse
import concurrent.futures
import sys
import os
import re
from pathlib import Path

# Ensure project root and src/ are on path for utils and llm_bridge
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_SRC = _PROJECT_ROOT / "src"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from utils import (
    normalize_goal_text,
    extract_evidence_items,
    parse_diagnoses_text,
    summarize_failed_tests,
    human_error_type,
)

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

class PrologChecker:
    def __init__(self, problem_file, student_file, use_llm=False, test_cases_file=None,
                 auto_fix=False, max_fix_attempts=2, fix_output_path=None):
        self.problem_file = Path(problem_file)
        self.student_file = Path(student_file)
        self.use_llm = use_llm
        self.test_cases_file = Path(test_cases_file) if test_cases_file else None
        self.src_dir = _SRC
        self.api_key = os.getenv("GROQ_API_KEY")
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

    def _log(self, log, message):
        log.append(message)
        print(message)
    
    def _extract_tests(self, log=None):
        tests = []
        for line in self.problem_text.split("\n"):
            m = re.search(r"(\w+\(.*?\))\s+should\s+be\s+(true|false)", line, re.I)
            if not m:
                continue
            goal, expected = m.groups()
            if re.search(r"\b[A-Z_][A-Za-z0-9_]*\b", goal):
                continue
            expected_list = f"[{goal}]" if expected.lower() == "true" else "[]"
            tests.append(f"test({goal}, {expected_list}).")
        return "\n".join(tests)

    def _load_test_cases_file(self):
        if not self.test_cases_file:
            return []
        goals = []
        for raw_line in self.test_cases_file.read_text().splitlines():
            line = raw_line.split("%", 1)[0].strip()
            if not line:
                continue
            if line.endswith('.'):
                line = line[:-1].strip()
            if line:
                goals.append(line)
        return goals

    def _normalize_goal_text(self, value):
        return normalize_goal_text(value)

    def _summarize_failed_tests(self, value):
        return summarize_failed_tests(value)

    def _human_error_type(self, value):
        return human_error_type(value)
    
    def _new_prolog(self):
        if Prolog is None:
            raise RuntimeError("pyswip is not installed")
        return Prolog()

    def _consult(self, prolog, path: Path):
        prolog.consult(str(path))

    def _query_one(self, prolog, query, timeout_seconds=5):
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
        diagnoses_text = analysis.get("diagnoses_text")
        diag_pairs = parse_diagnoses_text(diagnoses_text)
        test_summary = summarize_failed_tests(analysis.get("error"))

        if diag_pairs:
            messages = []
            for message, suggestion in diag_pairs:
                messages.append(f"{message}.")
                messages.append(f"Suggestion: {suggestion}.")
            if test_summary:
                messages.append(test_summary)
            return " ".join(messages)

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
        diag_text = analysis.get("diagnoses_text") or ""
        if diag_text:
            diag_lc = str(diag_text).lower()
            if "ambigu" not in diag_lc:
                return None
        else:
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
            raw = self.test_cases_file.read_text().strip()
            if raw:
                self._log(log, f"Loaded test cases: {self.test_cases_file}")
                # Detect if file already contains test(G,E). facts (from API conversion)
                first_code_line = next(
                    (l.strip() for l in raw.splitlines()
                     if l.strip() and not l.strip().startswith('%')),
                    ''
                )
                if first_code_line.startswith('test('):
                    # Already properly formatted — use as-is, no re-wrapping
                    self.test_case_goals = self._parse_tests_to_goals(raw)
                    return raw
                # Legacy format: plain goals → treat as positive tests
                goals = self._load_test_cases_file()
                if goals:
                    self.test_case_goals = goals
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
                    30,
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
        try:
            # First, rely on SWI-Prolog (authoritative).
            prolog_swi = self._new_prolog()
            self._consult(prolog_swi, self.student_file)
            swi_ok = True
        except Exception as e:
            swi_ok = False
            swi_err = str(e)

        if not swi_ok:
            # SWI failed; run grammar parser to produce student-friendly messages.
            try:
                prolog = self._new_prolog()
                self._consult(prolog, self.src_dir / "prolog" / "prolog_parser.pl")
                file_path = str(self.student_file.absolute()).replace('\\', '/')
                query = f"parse_prolog_file('{file_path}', Result)"
                results = list(prolog.query(query))
                result = results[0].get('Result', None) if results else None
                result_str = str(result)
                if 'errors(' in result_str and result_str != 'ok(_)':
                    self._log(log, "\n" + "="*60)
                    self._log(log, "SYNTAX ERROR DETECTED (SWI-Prolog Parser)")
                    self._log(log, "="*60)
                    self._log(log, f"\n{swi_err}\n")
                    error_messages = self._extract_parser_errors(prolog, result)
                    if error_messages:
                        for i, msg in enumerate(error_messages, 1):
                            self._log(log, f"Error #{i}:")
                            self._log(log, msg)
                            self._log(log, "\n" + "-"*60 + "\n")
                        self.syntax_error = {
                            "line": 0,
                            "type": "parse_error",
                            "line_text": error_messages[0],
                            "friendly_message": error_messages[0]
                        }
                    else:
                        self.syntax_error = {
                            "line": 0,
                            "type": "parser_error",
                            "line_text": swi_err
                        }
                    return False
            except Exception:
                # If grammar parser also fails, just report the SWI error
                self._log(log, "\n" + "="*60)
                self._log(log, "SYNTAX ERROR DETECTED (SWI-Prolog Parser)")
                self._log(log, "="*60)
                self._log(log, f"\n{swi_err}\n")
                self.syntax_error = {
                    "line": 0,
                    "type": "parser_error",
                    "line_text": swi_err
                }
                return False

        # SWI accepted the file; optionally surface grammar issues as warnings only.
        # SWI accepted; skip grammar warnings to avoid noise.

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
            if re.search(r"\b[A-Z_][A-Za-z0-9_]*\b", goal):
                # Skip non-ground goal
                continue
            filtered_lines.append(line)
        return "\n".join(filtered_lines)
    
    def run_analysis(self, tests, log):
        self._log(log, "Step 2: Logical Analysis")
        
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

            if tests and not self.sample_goal:
                sample = self._query_one(prolog, "test(G,_), term_string(G, S)")
                if sample:
                    self.sample_goal = normalize_goal_text(sample.get("S"))

            if self.test_case_goals:
                self._log(log, "Test Proof Trees:")
                for goal in self.test_case_goals:
                    tree = normalize_goal_text(self._gen_proof_for_goal(goal))
                    trace = normalize_goal_text(self._gen_trace_for_goal(prolog, goal))
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

            goal_template = f"{self.predicate_name}({', '.join(['_'] * self.predicate_arity)})"

            trace_goal = self.sample_goal if self.sample_goal else goal_template
            exec_trace = normalize_goal_text(self._gen_trace_for_goal(prolog, trace_goal))
            if exec_trace:
                self._log(log, "Execution Trace:\n" + exec_trace)

            if tests:
                q = (
                    f"catch(call_with_time_limit(5, ("
                    f"findall(test(G,E), test(G,E), Tests), "
                    f"meta_interpreter:validate_with_tests({goal_template}, Tests, Errors)"
                    f")), _, (Errors = [timeout], Diagnoses = []))"
                )
            else:
                q = f"meta_interpreter:detect_errors({goal_template}, Errors), Diagnoses = []"

            result = self._query_one(prolog, q)
            if result is None:
                return {"status":"logic_error", "error":"Validation failed"}
            if isinstance(result, dict) and result.get("__error__"):
                return {"status":"logic_error", "error":result.get("__error__")}
            errors = result.get("Errors")
            diagnoses = result.get("Diagnoses") if result else None
            is_empty_errors = (errors == [] or str(errors) == "[]")

            if is_empty_errors:
                # Even when tests pass, attempt diagnosis to catch issues like missing cuts.
                diagnoses = None
                diagnoses_text = None
                diag_goal = self.sample_goal if self.sample_goal else goal_template
                if diag_goal:
                    q_diag = (
                        "catch(call_with_time_limit(2, (diagnosis_engine:generate_diagnoses(" + diag_goal + ", Ds), "
                        "term_string(Ds, S))), _, (Ds = [], S=''))"
                    )
                    diag_result = self._query_one(prolog, q_diag, timeout_seconds=3)
                    if diag_result:
                        if diag_result.get("Ds") is not None:
                            diagnoses = diag_result.get("Ds")
                        if diag_result.get("S"):
                            diagnoses_text = diag_result.get("S")

                evidence_items = extract_evidence_items(diagnoses)
                if evidence_items:
                    self._log(log, "Evidence Items:")
                    for item in evidence_items:
                        self._log(log, item)

                # Pretty-print diagnoses if present
                if diagnoses:
                    q_print = (
                        "catch((call_with_time_limit(2, diagnosis_engine:generate_diagnoses(" + diag_goal + ", Ds)), "
                        "with_output_to(string(S), diagnosis_engine:print_diagnoses(Ds))), _, S='')"
                    )
                    printed = self._query_one(prolog, q_print, timeout_seconds=3)
                    if printed and printed.get("S"):
                        diag_text = normalize_goal_text(printed.get("S"))
                        if diag_text.strip():
                            self._log(log, "Diagnoses (formatted):")
                            self._log(log, diag_text.strip())

                status = "correct_with_diagnoses" if diagnoses else "correct"
                return {"status":status, "proof_tree":proof_tree, "diagnoses":diagnoses, "diagnoses_text":diagnoses_text}
            if errors is None:
                if tests:
                    return {"status":"logic_error", "error":"Validation failed"}
                self._log(log, "Trying proof tree...")
                if proof_tree:
                    return {"status":"correct", "proof_tree":proof_tree}
                return {"status":"logic_error", "error":"No proof tree"}
            diagnoses_text = None
            if self.sample_goal:
                q_diag = (
                    "catch(call_with_time_limit(2, (diagnosis_engine:generate_diagnoses(" + self.sample_goal + ", Ds), "
                    "term_string(Ds, S))), _, (Ds = [], S=''))"
                )
                diag_result = self._query_one(prolog, q_diag, timeout_seconds=3)
                if diag_result:
                    if diag_result.get("Ds") is not None and diagnoses is None:
                        diagnoses = diag_result.get("Ds")
                    if diag_result.get("S"):
                        diagnoses_text = diag_result.get("S")

            evidence_items = extract_evidence_items(diagnoses)
            if evidence_items:
                self._log(log, "Evidence Items:")
                for item in evidence_items:
                    self._log(log, item)

            # Pretty-print diagnoses using Prolog printer when available
            diag_goal = self.sample_goal if self.sample_goal else goal_template
            if diag_goal:
                q_print = (
                    "catch((call_with_time_limit(2, diagnosis_engine:generate_diagnoses(" + diag_goal + ", Ds)), "
                    "with_output_to(string(S), diagnosis_engine:print_diagnoses(Ds))), _, S='')"
                )
                printed = self._query_one(prolog, q_print, timeout_seconds=3)
                if printed and printed.get("S"):
                    diag_text = normalize_goal_text(printed.get("S"))
                    if diag_text.strip():
                        self._log(log, "Diagnoses (formatted):")
                        self._log(log, diag_text.strip())

            return {
                "status":"logic_error",
                "error":str(errors),
                "diagnoses":diagnoses,
                "diagnoses_text":diagnoses_text,
                "proof_tree":proof_tree
            }
        finally:
            if tf.exists():
                tf.unlink()
    
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
        if not self.api_key or not translate_to_natural_language:
            llm_input = {
                "status": analysis.get("status"),
                "error": analysis.get("error"),
                "proof_tree": analysis.get("proof_tree"),
                "diagnoses": analysis.get("diagnoses"),
                "syntax_error": analysis.get("syntax_error")
            }
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
            
            llm_input = {
                "status": analysis.get("status"),
                "error": analysis.get("error"),
                "proof_tree": analysis.get("proof_tree"),
                "diagnoses": str(analysis.get("diagnoses")),
                "syntax_error": analysis.get("syntax_error")
            }
            
            self._log(log, "\nLLM INPUT (Feedback Generation):")
            self._log(log, "-" * 40)
            self._log(log, "Analysis Results:")
            for key, value in llm_input.items():
                if value:
                    val_str = str(value)
                    preview = val_str[:200] + "..." if len(val_str) > 200 else val_str
                    self._log(log, f"  {key}: {preview}")
            self._log(log, f"\nProblem Text ({len(self.problem_text)} chars)")
            self._log(log, f"Student Code ({len(self.student_code)} chars)")
            self._log(log, "-" * 40)
            
            self._log(log, "\nCalling LLM API (Groq Llama 3.3)...")
            fb = self._call_with_timeout(
                translate_to_natural_language,
                30,
                analysis,
                self.problem_text,
                self.student_code,
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

    def _attempt_auto_fix(self, analysis, tests_text, log):
        # Requires explicit opt-in and an API key, but does not require prior LLM feedback.
        if not self.auto_fix:
            self._log(log, "Auto-correction skipped (auto_fix disabled).")
            return
        if not self.api_key:
            self._log(log, "Auto-correction skipped: GROQ_API_KEY not set.")
            return
        try:
            from llm_bridge import generate_correct_code
        except Exception as e:
            self._log(log, f"Auto-correction skipped: cannot import generate_correct_code ({e}).")
            return

        self._log(log, "")
        self._log(log, "AUTO-CORRECTION")
        self._log(log, "================")

        current_code = self.student_code
        # Fall back to basic human-readable feedback when no LLM feedback exists
        feedback = self.last_llm_feedback or self._build_human_feedback(analysis) or ""
        error_summary = analysis.get("error")

        last_fixed_code = None
        verified = False

        for attempt in range(1, self.max_fix_attempts + 1):
            self._log(log, f"Attempt {attempt}/{self.max_fix_attempts}")
            self._log(log, "Input summary:")
            self._log(log, f"- Error: {error_summary}")
            self._log(log, f"- Feedback length: {len(feedback) if feedback else 0}")
            self._log(log, "Calling LLM code fixer...")

            fix_response = self._call_with_timeout(
                generate_correct_code,
                45,
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

            last_fixed_code = fixed_code

            eval_result = self._evaluate_candidate(fixed_code, tests_text, log)
            if eval_result.get("status") == "correct":
                self._log(log, "Auto-correction succeeded.")
                if self.fix_output_path:
                    self.fix_output_path.write_text(fixed_code)
                else:
                    self._log(log, "Corrected code saved in log only.")
                verified = True
                break

            error_summary = eval_result.get("error") or eval_result.get("syntax_error")
            feedback = self.last_llm_feedback or feedback

        # If evaluation was inconclusive but the LLM did produce a suggestion, still
        # surface it so the user can review the diff and decide.
        if not verified and last_fixed_code and self.fix_output_path:
            self._log(log, "Auto-correction unverified (evaluation inconclusive) — saving best attempt for review.")
            self.fix_output_path.write_text(last_fixed_code)

        self._log(log, "Auto-correction finished.")
    
    def run(self):
        log = []
        self._log(log, "PROLOG CODE CHECKER")
        self._log(log, f"Problem: {self.problem_file.name}")
        self._log(log, f"Student Code: {self.student_file.name}")

        if self.check_syntax(log):
            tests = self.prepare_tests(log)
            analysis = self.run_analysis(tests, log)
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
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    checker = PrologChecker(
        args.problem,
        args.student_code,
        True,
        args.test_cases,
        auto_fix=args.auto_fix,
        max_fix_attempts=args.max_fix_attempts,
        fix_output_path=args.fix_output
    )
    output_text = checker.run()
    Path(args.output).write_text(output_text)
    print(output_text)
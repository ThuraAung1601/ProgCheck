#!/usr/bin/env python3
"""Prolog code checker."""
import argparse
import concurrent.futures
import sys
import os
import re
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

try:
    from pyswip import Prolog
except Exception:
    Prolog = None

sys.path.insert(0, str(Path(__file__).parent / "src"))
try:
    from llm_bridge import generate_test_cases, translate_to_natural_language
except Exception:
    generate_test_cases = translate_to_natural_language = None

class PrologChecker:
    def __init__(self, problem_file, student_file, use_llm=False, test_cases_file=None):
        self.problem_file = Path(problem_file)
        self.student_file = Path(student_file)
        self.use_llm = use_llm
        self.test_cases_file = Path(test_cases_file) if test_cases_file else None
        self.src_dir = Path(__file__).parent / "src"
        self.api_key = os.getenv("GROQ_API_KEY")
        self.problem_text = self.problem_file.read_text()
        self.student_code = self.student_file.read_text()
        self.predicate_name = None
        self.predicate_arity = None
        self.sample_goal = None
        self.test_case_goals = []

    def _log(self, log, message):
        log.append(message)
        print(message)
    
    def _extract_tests(self):
        tests = []
        for line in self.problem_text.split("\n"):
            m = re.search(r"(\w+)\((.*?)\)\s+should\s+be\s+(true|false)", line, re.I)
            if m:
                p, a, e = m.groups()
                if re.search(r"\b[A-Z_][A-Za-z0-9_]*", a):
                    continue
                if "false" not in e.lower():
                    tests.append(f"test({p}({a}), [{p}({a})]).")
                else:
                    tests.append(f"test({p}({a}), []).")
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

    def _query_one(self, prolog, query, timeout_seconds=5):
        try:
            results = self._call_with_timeout(
                lambda: list(prolog.query(query, maxresult=1)),
                timeout_seconds
            )
            return results[0] if results else None
        except Exception as e:
            return {"__error__": str(e)}

    def _normalize_goal_text(self, value):
        if value is None:
            return None
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="ignore")
        return str(value)

    def _extract_evidence_items(self, diagnoses):
        if diagnoses is None:
            return []
        text = self._normalize_goal_text(diagnoses)
        matches = re.findall(r"diagnosis\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*(\[[^\]]*\])\)", text)
        items = []
        for m in matches:
            items.append(m)
        return items

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
            self.test_case_goals = self._load_test_cases_file()
            if self.test_case_goals:
                self._log(log, f"Loaded test cases: {self.test_cases_file}")
                return "\n".join([f"test({g}, [{g}])." for g in self.test_case_goals])
        extracted = self._extract_tests()
        if extracted:
            self._log(log, "Extracted from problem")
            return extracted
        if self.use_llm and self.api_key and generate_test_cases:
            self._log(log, "Generating with LLM...")
            try:
                return self._call_with_timeout(
                    generate_test_cases,
                    30,
                    self.problem_text,
                    self.student_code,
                    self.api_key
                )
            except Exception as e:
                self._log(log, f"LLM generation failed: {e}")
        return None
    
    def check_syntax(self, log):
        self._log(log, "Step 1: Syntax Check")
        try:
            prolog = self._new_prolog()
            self._consult(prolog, self.student_file)
        except Exception as e:
            err = str(e)
            self._log(log, f"SYNTAX ERROR\n{err}")
            if self.api_key and translate_to_natural_language:
                try:
                    fb = translate_to_natural_language(
                        {"status":"syntax_error", "error":err},
                        self.problem_text,
                        self.student_code,
                        self.api_key
                    )
                    self._log(log, fb)
                except Exception:
                    pass
            return False
        self._log(log, "Syntax OK")
        return True
    
    def run_analysis(self, tests, log):
        self._log(log, "Step 2: Logical Analysis")
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
                    self.sample_goal = self._normalize_goal_text(sample.get("S"))

            if self.test_case_goals:
                self._log(log, "Test Proof Trees:")
                for goal in self.test_case_goals:
                    tree = self._normalize_goal_text(self._gen_proof_for_goal(goal))
                    if tree:
                        self._log(log, f"Query: {goal}\n{tree}")
                    else:
                        self._log(log, f"Query: {goal}\nNo proof tree")

            proof_tree = self._normalize_goal_text(self._gen_proof())
            if proof_tree:
                self._log(log, "Proof Tree:\n" + proof_tree)

            goal_template = f"{self.predicate_name}({', '.join(['_'] * self.predicate_arity)})"

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
                return {"status":"correct", "proof_tree":proof_tree}
            if errors is None:
                if tests:
                    return {"status":"logic_error", "error":"Validation failed"}
                self._log(log, "Trying proof tree...")
                if proof_tree:
                    return {"status":"correct", "proof_tree":proof_tree}
                return {"status":"logic_error", "error":"No proof tree"}
            if not diagnoses and self.sample_goal:
                q_diag = (
                    f"catch(call_with_time_limit(2, diagnosis_engine:generate_diagnoses({self.sample_goal}, Ds)), _, Ds = [])"
                )
                diag_result = self._query_one(prolog, q_diag, timeout_seconds=3)
                if diag_result and diag_result.get("Ds") is not None:
                    diagnoses = diag_result.get("Ds")

            evidence_items = self._extract_evidence_items(diagnoses)
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
                    diag_text = self._normalize_goal_text(printed.get("S"))
                    if diag_text.strip():
                        self._log(log, "Diagnoses (formatted):")
                        self._log(log, diag_text.strip())

            return {"status":"logic_error", "error":str(errors), "diagnoses":diagnoses, "proof_tree":proof_tree}
        finally:
            if tf.exists():
                tf.unlink()
    
    def _gen_proof(self):
        if not self.predicate_name:
            return None
        if self.sample_goal:
            goal = self._normalize_goal_text(self.sample_goal)
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
                    goal = self._normalize_goal_text(head.get("S"))

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
    
    def gen_feedback(self, analysis, log):
        self._log(log, "Step 3: Feedback")
        if not self.api_key or not translate_to_natural_language:
            if analysis["status"] == "correct":
                self._log(log, "Correct")
                if analysis.get("proof_tree"):
                    self._log(log, "Proof Tree:\n" + analysis.get("proof_tree"))
            else:
                self._log(log, f"{analysis.get('error','Error')}")
                if analysis.get("diagnoses"):
                    self._log(log, "Evidence-based diagnoses:")
                    self._log(log, str(analysis.get("diagnoses")))
            return
        try:
            llm_input = {
                "status": analysis.get("status"),
                "error": analysis.get("error"),
                "proof_tree": analysis.get("proof_tree"),
                "diagnoses": analysis.get("diagnoses")
            }
            self._log(log, "LLM Input:")
            self._log(log, str(llm_input))
            fb = self._call_with_timeout(
                translate_to_natural_language,
                30,
                analysis,
                self.problem_text,
                self.student_code,
                self.api_key
            )
            self._log(log, "LLM Output:")
            self._log(log, fb)
        except Exception as e:
            self._log(log, f"LLM translation failed: {e}")

    def _call_with_timeout(self, func, timeout_seconds, *args):
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(func, *args)
            return future.result(timeout=timeout_seconds)
    
    def run(self):
        log = []
        self._log(log, "PROLOG CODE CHECKER")
        self._log(log, f"Problem: {self.problem_file.name}")
        self._log(log, f"Student Code: {self.student_file.name}")

        if self.check_syntax(log):
            tests = self.prepare_tests(log)
            analysis = self.run_analysis(tests, log)
            self.gen_feedback(analysis, log)

        if self.predicate_name:
            self._log(log, f"Predicate: {self.predicate_name}/{self.predicate_arity}")

        return "\n".join(log)

def parse_args():
    parser = argparse.ArgumentParser(description="Prolog code checker")
    parser.add_argument("--problem", required=True, help="Path to problem file")
    parser.add_argument("--student_code", required=True, help="Path to student Prolog code")
    parser.add_argument("--test_cases", help="Path to Prolog test queries file")
    parser.add_argument("--output", required=True, help="Path to output text file")
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()
    checker = PrologChecker(args.problem, args.student_code, True, args.test_cases)
    output_text = checker.run()
    Path(args.output).write_text(output_text)
    print(output_text)

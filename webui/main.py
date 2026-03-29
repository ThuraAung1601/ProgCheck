from __future__ import annotations

import difflib
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from check_prolog import PrologChecker


class BasePayload(BaseModel):
    problem_file: str
    student_file: str
    student_code: str


class QueryPayload(BasePayload):
    query: str


class FullDiagnosisPayload(BasePayload):
    test_cases_file: str | None = None


class ApplyFixPayload(BaseModel):
    student_file: str
    corrected_code: str
    accept: bool


class CutComparePayload(BaseModel):
    problem_file: str
    query: str
    code_a: str
    code_b: str


app = FastAPI(title="Prolog Debugger UI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = ROOT / "webui" / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _to_abs(path_text: str) -> Path:
    path = Path(path_text)
    return path if path.is_absolute() else (ROOT / path).resolve()


def _safe_read(path: Path) -> str:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return path.read_text()


def _list_rel(directory: Path, pattern: str) -> list[str]:
    if not directory.exists():
        return []
    return sorted([str(p.relative_to(ROOT)) for p in directory.glob(pattern) if p.is_file()])


def _build_checker(problem_file: Path, student_file: Path, test_cases_file: Path | None = None) -> PrologChecker:
    return PrologChecker(
        problem_file=problem_file,
        student_file=student_file,
        use_llm=True,
        test_cases_file=test_cases_file,
        auto_fix=False,
        cut_debug_mode=True,
        algo_debug=True,
    )


def _trace_stats(trace_text: str) -> dict[str, int]:
    text = trace_text or ""
    return {
        "cut_events": text.count("CUT - pruning alternatives"),
        "choice_points": text.count("choice point"),
        "failed_steps": text.count("(failed)"),
        "depth_limit_hits": text.count("Depth limit exceeded"),
    }


def _execute_query(problem_path: Path, student_code: str, query: str) -> dict[str, Any]:
    temp_student = _write_temp_student(student_code)
    try:
        checker = _build_checker(problem_path, temp_student)
        log: list[str] = []
        if not checker.check_syntax(log):
            return {
                "ok": False,
                "feedback": "\n".join(log),
                "syntax_error": checker.syntax_error,
            }

        prolog = checker._new_prolog()
        checker._consult(prolog, checker.src_dir / "prolog" / "meta_interpreter.pl")
        checker._consult(prolog, checker.src_dir / "prolog" / "diagnosis_engine.pl")
        checker._consult(prolog, temp_student)

        trace_text = checker._gen_trace_for_goal(prolog, query) or "No trace generated"
        proof_tree = checker._gen_proof_for_goal(query) or "No proof tree (query failed)"

        q_diag = (
            "catch((diagnosis_engine:shapiro_diagnose(" + query + ", Mode, Data),"
            "term_string(Mode, MS),"
            "diagnosis_engine:shapiro_nodes_text(Mode, Data, Text)),_,(MS='unknown', Text=''))"
        )
        diag = checker._query_one(prolog, q_diag)
        mode_raw = (diag or {}).get("MS", "unknown")
        mode = mode_raw.decode("utf-8") if isinstance(mode_raw, bytes) else str(mode_raw)
        mode = mode.strip("'\"")
        nodes_raw = (diag or {}).get("Text", "")
        nodes_text = nodes_raw.decode("utf-8", errors="replace") if isinstance(nodes_raw, bytes) else str(nodes_raw)

        has_logic_error = mode not in ("ok", "incorrect", "")
        analysis = {
            "status": "logic_error" if has_logic_error else "correct",
            "error": nodes_text if has_logic_error else "",
            "proof_tree": proof_tree,
            "shapiro_mode": mode,
            "shapiro_nodes_text": nodes_text,
            "trace_records": [{"goal": query, "trace": trace_text}],
        }
        debug_summary = checker._attach_debug_summary(analysis)

        return {
            "ok": True,
            "query": query,
            "trace": trace_text,
            "proof_tree": proof_tree,
            "shapiro_mode": mode,
            "has_logic_error": has_logic_error,
            "shapiro_nodes_text": nodes_text,
            "debug_summary": debug_summary,
            "analysis": analysis,
            "trace_stats": _trace_stats(trace_text),
        }
    finally:
        temp_student.unlink(missing_ok=True)


def _write_temp_student(code: str) -> Path:
    fd = tempfile.NamedTemporaryFile(mode="w", suffix=".pl", delete=False)
    try:
        fd.write(code)
        fd.flush()
        return Path(fd.name)
    finally:
        fd.close()


@app.get("/")
def root() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/options")
def options() -> dict[str, Any]:
    return {
        "problems": _list_rel(ROOT / "examples", "*.txt"),
        "students": _list_rel(ROOT / "student_codes", "*.pl"),
        "tests": _list_rel(ROOT / "test_files", "*.pl"),
    }


@app.post("/api/load")
def load_file(payload: BasePayload) -> dict[str, Any]:
    problem_path = _to_abs(payload.problem_file)
    student_path = _to_abs(payload.student_file)
    return {
        "problem_text": _safe_read(problem_path),
        "student_code": _safe_read(student_path),
    }


@app.post("/api/syntax-check")
def syntax_check(payload: BasePayload) -> dict[str, Any]:
    problem_path = _to_abs(payload.problem_file)
    temp_student = _write_temp_student(payload.student_code)
    try:
        checker = _build_checker(problem_path, temp_student)
        log: list[str] = []
        ok = checker.check_syntax(log)
        return {
            "ok": ok,
            "feedback": "\n".join(log),
            "syntax_error": checker.syntax_error,
        }
    finally:
        temp_student.unlink(missing_ok=True)


@app.post("/api/query-run")
def query_run(payload: QueryPayload) -> dict[str, Any]:
    problem_path = _to_abs(payload.problem_file)
    query = payload.query.strip().rstrip(".")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    return _execute_query(problem_path, payload.student_code, query)


@app.post("/api/cut-compare")
def cut_compare(payload: CutComparePayload) -> dict[str, Any]:
    problem_path = _to_abs(payload.problem_file)
    query = payload.query.strip().rstrip(".")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    result_a = _execute_query(problem_path, payload.code_a, query)
    result_b = _execute_query(problem_path, payload.code_b, query)

    return {
        "ok": True,
        "query": query,
        "left": result_a,
        "right": result_b,
    }


@app.post("/api/llm-feedback")
def llm_feedback(payload: QueryPayload) -> dict[str, Any]:
    result = query_run(payload)
    if not result.get("ok"):
        return result

    problem_path = _to_abs(payload.problem_file)
    temp_student = _write_temp_student(payload.student_code)
    try:
        checker = _build_checker(problem_path, temp_student)
        analysis = result.get("analysis", {})
        analysis["student_error_code"] = payload.student_code
        log: list[str] = []
        checker.gen_feedback(analysis, log)
        return {
            "ok": True,
            "feedback": checker.last_llm_feedback or "",
            "trace": result.get("trace", ""),
            "proof_tree": result.get("proof_tree", ""),
            "debug_summary": result.get("debug_summary", ""),
            "shapiro_mode": result.get("shapiro_mode", "unknown"),
            "log": "\n".join(log),
        }
    finally:
        temp_student.unlink(missing_ok=True)


@app.post("/api/full-diagnosis")
def full_diagnosis(payload: FullDiagnosisPayload) -> dict[str, Any]:
    problem_path = _to_abs(payload.problem_file)
    test_path = _to_abs(payload.test_cases_file) if payload.test_cases_file else None
    temp_student = _write_temp_student(payload.student_code)

    with tempfile.NamedTemporaryFile(mode="w", suffix="_fixed.pl", delete=False) as fix_f:
        fix_path = Path(fix_f.name)

    try:
        checker = PrologChecker(
            problem_file=problem_path,
            student_file=temp_student,
            use_llm=True,
            test_cases_file=test_path,
            auto_fix=True,
            max_fix_attempts=2,
            fix_output_path=fix_path,
            cut_debug_mode=True,
            algo_debug=True,
        )
        full_log = checker.run()
        corrected = fix_path.read_text() if fix_path.exists() and fix_path.stat().st_size > 0 else ""

        diff_text = ""
        if corrected and corrected != payload.student_code:
            diff_text = "\n".join(
                difflib.unified_diff(
                    payload.student_code.splitlines(),
                    corrected.splitlines(),
                    fromfile="student_original.pl",
                    tofile="student_corrected.pl",
                    lineterm="",
                )
            )

        return {
            "ok": True,
            "log": full_log,
            "corrected_code": corrected,
            "diff": diff_text,
            "changed": bool(diff_text),
        }
    finally:
        temp_student.unlink(missing_ok=True)
        fix_path.unlink(missing_ok=True)


@app.post("/api/apply-fix")
def apply_fix(payload: ApplyFixPayload) -> dict[str, Any]:
    path = _to_abs(payload.student_file)
    if not payload.accept:
        return {"ok": True, "applied": False}
    path.write_text(payload.corrected_code)
    return {"ok": True, "applied": True, "student_file": str(path.relative_to(ROOT))}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

"""ProgCheck + Prolog Visualizer — FastAPI server.

Serves the React frontend from /static and all API routes under /api/*.
"""
from __future__ import annotations

import difflib
import sys
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Path setup ────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent   # project root
SRC  = ROOT / "src"
STUDENT_DIR = ROOT / "data" / "student_codes"

for p in [str(ROOT), str(SRC)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from src.checker import PrologChecker

# ── Pydantic models ───────────────────────────────────────────────────────

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

# ── App setup ─────────────────────────────────────────────────────────────

app = FastAPI(title="ProgCheck + Prolog Viz")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# CRA always outputs:
#   {BUILD_PATH}/index.html          → served at GET /
#   {BUILD_PATH}/static/js/...       → served at GET /static/js/...
#   {BUILD_PATH}/static/css/...      → served at GET /static/css/...
#
# BUILD_PATH = ROOT/static, so mount /static → ROOT/static/static
BUILD_DIR  = ROOT / "static"          # top-level CRA output dir
ASSETS_DIR = BUILD_DIR / "static"     # CRA always nests assets here
BUILD_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(ASSETS_DIR), html=False), name="static")

# ── Helpers ───────────────────────────────────────────────────────────────

def _to_abs(path_text: str) -> Path:
    p = Path(path_text)
    return p if p.is_absolute() else (ROOT / p).resolve()

def _safe_read(path: Path) -> str:
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return path.read_text()

def _list_rel(directory: Path, pattern: str) -> list[str]:
    if not directory.exists():
        return []
    return sorted(str(p.relative_to(ROOT)) for p in directory.glob(pattern) if p.is_file())

def _write_temp(code: str, suffix: str = ".pl") -> Path:
    fd = tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False)
    try:
        fd.write(code)
        fd.flush()
        return Path(fd.name)
    finally:
        fd.close()

def _make_checker(problem_file: Path, student_file: Path,
                  test_cases_file: Path | None = None,
                  auto_fix: bool = False,
                  max_fix_attempts: int = 2,
                  fix_output_path: Path | None = None) -> PrologChecker:
    """Create a PrologChecker with the actual constructor signature."""
    kwargs: dict[str, Any] = dict(
        problem_file=problem_file,
        student_file=student_file,
        use_llm=True,
        test_cases_file=test_cases_file,
        auto_fix=auto_fix,
        max_fix_attempts=max_fix_attempts,
    )
    if fix_output_path is not None:
        kwargs["fix_output_path"] = fix_output_path
    return PrologChecker(**kwargs)

def _trace_stats(text: str) -> dict[str, int]:
    return {
        "cut_events":       text.count("CUT - pruning alternatives"),
        "choice_points":    text.count("choice point"),
        "failed_steps":     text.count("(failed)"),
        "depth_limit_hits": text.count("Depth limit exceeded"),
    }

def _build_debug_summary(analysis: dict) -> str:
    """Build a plain-text debug summary from analysis dict (replaces missing _attach_debug_summary)."""
    parts: list[str] = []
    mode = analysis.get("shapiro_mode", "")
    status = analysis.get("status", "")
    # "incorrect" is the name of the Shapiro algorithm, not a verdict — map to user-friendly label
    verdict = "correct" if status == "correct" or mode in ("ok", "incorrect", "") else mode
    if verdict:
        parts.append(f"Status: {verdict}")
    nodes_text = analysis.get("shapiro_nodes_text", "")
    if nodes_text and nodes_text.strip():
        parts.append(f"Shapiro nodes:\n{nodes_text}")
    error = analysis.get("error", "")
    if error and error.strip():
        parts.append(f"Error details:\n{error}")
    return "\n".join(parts) if parts else "No debug summary available."

def _execute_query(problem_path: Path, student_code: str, query: str) -> dict[str, Any]:
    temp_student = _write_temp(student_code)
    try:
        checker = _make_checker(problem_path, temp_student)
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
        proof_tree = checker._gen_proof_for_goal(query)       or "No proof tree (query failed)"

        q_diag = (
            "catch((diagnosis_engine:shapiro_diagnose(" + query + ", Mode, Data),"
            "term_string(Mode, MS),"
            "diagnosis_engine:shapiro_nodes_text(Mode, Data, Text)),"
            "_,(MS='unknown', Text=''))"
        )
        diag = checker._query_one(prolog, q_diag)

        mode_raw  = (diag or {}).get("MS", "unknown")
        mode      = mode_raw.decode("utf-8") if isinstance(mode_raw, bytes) else str(mode_raw)
        mode      = mode.strip("'\"")

        nodes_raw  = (diag or {}).get("Text", "")
        nodes_text = (nodes_raw.decode("utf-8", errors="replace")
                      if isinstance(nodes_raw, bytes) else str(nodes_raw))

        has_logic_error = mode not in ("ok", "incorrect", "")
        analysis = {
            "status":             "logic_error" if has_logic_error else "correct",
            "error":              nodes_text if has_logic_error else "",
            "proof_tree":         proof_tree,
            "shapiro_mode":       mode,
            "shapiro_nodes_text": nodes_text,
            "trace_records":      [{"goal": query, "trace": trace_text}],
        }
        debug_summary = _build_debug_summary(analysis)

        return {
            "ok":                 True,
            "query":              query,
            "trace":              trace_text,
            "proof_tree":         proof_tree,
            "shapiro_mode":       mode,
            "has_logic_error":    has_logic_error,
            "shapiro_nodes_text": nodes_text,
            "debug_summary":      debug_summary,
            "analysis":           analysis,
            "trace_stats":        _trace_stats(trace_text),
        }
    finally:
        temp_student.unlink(missing_ok=True)

# ── Routes ────────────────────────────────────────────────────────────────

@app.get("/")
def root() -> FileResponse:
    index = BUILD_DIR / "index.html"
    if not index.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend not built yet. Run: cd webui/frontend && npm run build"
        )
    return FileResponse(str(index))

@app.get("/api/options")
def options() -> dict[str, Any]:
    return {
        "problems": _list_rel(ROOT / "data" / "examples",      "*.txt"),
        "students": _list_rel(ROOT / "data" / "student_codes",  "*.pl"),
        "tests":    _list_rel(ROOT / "data" / "test_files",     "*.pl"),
    }

@app.post("/api/load")
def load_file(payload: BasePayload) -> dict[str, Any]:
    return {
        "problem_text": _safe_read(_to_abs(payload.problem_file)),
        "student_code": _safe_read(_to_abs(payload.student_file)),
    }

@app.post("/api/syntax-check")
def syntax_check(payload: BasePayload) -> dict[str, Any]:
    if not payload.problem_file:
        raise HTTPException(status_code=400, detail="Problem file is required")

    problem_path = _to_abs(payload.problem_file)

    if not problem_path.is_file():
        raise HTTPException(status_code=400, detail="Invalid problem file")
    
    temp_student = _write_temp(payload.student_code)
    try:
        checker = _make_checker(_to_abs(payload.problem_file), temp_student)
        log: list[str] = []
        ok = checker.check_syntax(log)
        return {"ok": ok, "feedback": "\n".join(log), "syntax_error": checker.syntax_error}
    finally:
        temp_student.unlink(missing_ok=True)

@app.post("/api/query-run")
def query_run(payload: QueryPayload) -> dict[str, Any]:
    query = payload.query.strip().rstrip(".")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    return _execute_query(_to_abs(payload.problem_file), payload.student_code, query)

@app.post("/api/cut-compare")
def cut_compare(payload: CutComparePayload) -> dict[str, Any]:
    query = payload.query.strip().rstrip(".")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    problem_path = _to_abs(payload.problem_file)
    return {
        "ok":    True,
        "query": query,
        "left":  _execute_query(problem_path, payload.code_a, query),
        "right": _execute_query(problem_path, payload.code_b, query),
    }

@app.post("/api/llm-feedback")
def llm_feedback(payload: QueryPayload) -> dict[str, Any]:
    result = query_run(payload)
    if not result.get("ok"):
        return result

    temp_student = _write_temp(payload.student_code)
    try:
        checker  = _make_checker(_to_abs(payload.problem_file), temp_student)
        analysis = dict(result.get("analysis", {}))
        analysis["student_error_code"] = payload.student_code
        log: list[str] = []
        checker.gen_feedback(analysis, log)
        return {
            "ok":          True,
            "feedback":    checker.last_llm_feedback or "",
            "trace":       result.get("trace", ""),
            "proof_tree":  result.get("proof_tree", ""),
            "debug_summary": result.get("debug_summary", ""),
            "shapiro_mode":  result.get("shapiro_mode", "unknown"),
            "log":           "\n".join(log),
        }
    finally:
        temp_student.unlink(missing_ok=True)

@app.post("/api/full-diagnosis")
def full_diagnosis(payload: FullDiagnosisPayload) -> dict[str, Any]:
    test_path    = _to_abs(payload.test_cases_file) if payload.test_cases_file else None
    temp_student = _write_temp(payload.student_code)

    with tempfile.NamedTemporaryFile(mode="w", suffix="_fixed.pl", delete=False) as fh:
        fix_path = Path(fh.name)

    try:
        checker  = _make_checker(
            _to_abs(payload.problem_file), temp_student,
            test_cases_file=test_path,
            auto_fix=True, max_fix_attempts=2,
            fix_output_path=fix_path,
        )
        full_log  = checker.run()
        corrected = (fix_path.read_text()
                     if fix_path.exists() and fix_path.stat().st_size > 0 else "")

        diff_text = ""
        if corrected and corrected != payload.student_code:
            diff_text = "\n".join(difflib.unified_diff(
                payload.student_code.splitlines(),
                corrected.splitlines(),
                fromfile="student_original.pl",
                tofile="student_corrected.pl",
                lineterm="",
            ))

        return {
            "ok":             True,
            "log":            full_log,
            "corrected_code": corrected,
            "diff":           diff_text,
            "changed":        bool(diff_text),
        }
    finally:
        temp_student.unlink(missing_ok=True)
        fix_path.unlink(missing_ok=True)

@app.post("/api/apply-fix")
def apply_fix(payload: ApplyFixPayload) -> dict[str, Any]:
    if not payload.accept:
        return {"ok": True, "applied": False}

    # ensure filename only (no path traversal)
    filename = Path(payload.student_file).name

    path = STUDENT_DIR / filename
    path.write_text(payload.corrected_code)

    return {
        "ok": True,
        "applied": True,
        "student_file": str(path.relative_to(ROOT))
    }

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

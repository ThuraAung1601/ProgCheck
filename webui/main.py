"""ProgCheck + Prolog Visualizer — FastAPI server.

Serves the React frontend from /static and all API routes under /api/*.
"""
from __future__ import annotations

import difflib
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional, List, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Path setup ────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent   # project root
SRC  = ROOT / "src"
STUDENT_DIR = ROOT / "data" / "student_codes"

# Store database in project data/ directory (same path as reset_db.py)
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True, parents=True)

for p in [str(ROOT), str(SRC)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from src.checker import PrologChecker
from src.database import init_database, close_database, get_root
from src.routes import auth, settings, classrooms, labs
from src.notification_scheduler import start_scheduler
from llm_bridge import generate_simple_test_cases as _gen_simple_tc

# ── Pydantic models ───────────────────────────────────────────────────────

class BasePayload(BaseModel):
    problem_id: int
    student_file: str
    student_code: str

class TestCase(BaseModel):
    testcase_id: int
    input: str
    expected_output: str

class QueryPayload(BasePayload):
    query: str

class FullDiagnosisPayload(BasePayload):
    test_cases_file: Optional[List[TestCase]] = None

class ApplyFixPayload(BaseModel):
    student_file: str
    corrected_code: str
    accept: bool

class CutComparePayload(BaseModel):
    problem_file: str
    query: str
    code_a: str
    code_b: str

class UserFileLoadPayload(BaseModel):
    user_id: str
    role: str   # "student" or "teacher"
    filename: str

class UserFileSavePayload(BaseModel):
    user_id: str
    role: str   # "student" or "teacher"
    filename: str
    code: str

# ── App setup ─────────────────────────────────────────────────────────────

app = FastAPI(title="ProgCheck + Prolog Viz")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Database Initialization ───────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    """Initialize ZODB database on startup"""
    try:
        db_path = str(DATA_DIR / "progcheck.fs")
        init_database(db_path)
        print("[OK] ZODB database initialized successfully")
    except Exception as e:
        print(f"[WARNING] Database initialization failed: {e}")
        print("  Server will run without database (some features may be unavailable)")
        # Don't raise - let server continue without database
    start_scheduler()

@app.on_event("shutdown")
async def shutdown():
    """Close database connection on shutdown"""
    close_database()
    print("[OK] ZODB database closed")

# ── Include Routes ────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(classrooms.router)
app.include_router(labs.router)

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

def _proof_text_to_nodes(text: str, counter: list | None = None) -> list[dict]:
    """Convert print_proof_tree/1 output into a flat list of trace nodes
    that BacktrackTree.js can render directly.

    print_proof_tree indents with 2 spaces per unit and increments by 2 units
    per level, so each level = 4 raw spaces.  We use raw-space count to infer
    depth and parent-child relationships (same algorithm as engineOutputParser.js).

    counter: shared [int] list so multiple calls produce non-colliding IDs.
    """
    import re as _re

    if isinstance(text, bytes):
        text = text.decode("utf-8", errors="replace")
    if not text or not text.strip():
        return []

    lines = text.split('\n')
    nodes: list[dict] = []
    if counter is None:
        counter = [0]
    stack: list[tuple[int, str]] = []  # (indent_chars, node_id)

    def nid() -> str:
        counter[0] += 1
        return f"n{counter[0]}"

    for line in lines:
        if not line.strip():
            continue

        indent_chars = len(line) - len(line.lstrip(' '))
        text_part = line.strip()

        # Pop stack entries that are at the same or deeper indent
        while stack and stack[-1][0] >= indent_chars:
            stack.pop()

        parent_id = stack[-1][1] if stack else None
        depth = len(stack)
        node_id = nid()

        # "Goal: X (fact)"
        m = _re.match(r'^Goal:\s+(.+?)\s*\(fact\)\s*$', text_part, _re.I)
        if m:
            goal = m.group(1).strip()
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': goal, 'clause': goal, 'result': 'success',
                          'cutPrevented': False, 'bindings': {}, 'isFact': True})
            stack.append((indent_chars, node_id))
            continue

        # "Goal: X :- body"
        m = _re.match(r'^Goal:\s+(.+?)\s*:-\s*(.+)$', text_part)
        if m:
            goal = m.group(1).strip()
            body = m.group(2).strip()
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': goal, 'clause': f"{goal} :- {body}",
                          'result': 'success', 'cutPrevented': False, 'bindings': {}})
            stack.append((indent_chars, node_id))
            continue

        # "Builtin: expr"
        m = _re.match(r'^Builtin:\s+(.+)$', text_part, _re.I)
        if m:
            goal = m.group(1).strip()
            result = 'cut' if goal == '!' else 'success'
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': goal, 'clause': '(built-in)', 'result': result,
                          'cutPrevented': False, 'bindings': {}})
            stack.append((indent_chars, node_id))
            continue

        # "true"
        if text_part == 'true':
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': 'true', 'clause': '(built-in)', 'result': 'success',
                          'cutPrevented': False, 'bindings': {}})
            stack.append((indent_chars, node_id))
            continue

        # "!" bare
        if text_part == '!':
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': '!', 'clause': '!', 'result': 'cut',
                          'cutPrevented': False, 'bindings': {}})
            stack.append((indent_chars, node_id))
            continue

        # "Goal: X" bare
        m = _re.match(r'^Goal:\s+(.+)$', text_part)
        if m:
            goal = m.group(1).strip()
            nodes.append({'id': node_id, 'parentId': parent_id, 'depth': depth,
                          'goal': goal, 'clause': goal, 'result': 'success',
                          'cutPrevented': False, 'bindings': {}})
            stack.append((indent_chars, node_id))
            continue

    return nodes


def _get_graph_data(student_code: str) -> dict[str, Any]:
    """Parse Prolog source into a detailed AST graph:
    - predicate nodes (rule/fact)
    - head argument nodes (atom/var) with arg1/arg2/… edges
    - body builtin-goal nodes (fact) with calls edges
    - body variables as var nodes with uses edges
    - body user-predicate calls as dashed calls edges to the target predicate
    """
    import re as _re

    code = _re.sub(r'%[^\n]*', '', student_code)
    code = _re.sub(r'/\*.*?\*/', '', code, flags=_re.DOTALL)

    nodes_map: dict[str, dict] = {}
    edges_list: list[dict] = []
    edge_set: set[str] = set()

    def add_node(nid: str, label: str, ntype: str, arity: int = 0) -> None:
        if nid not in nodes_map:
            nodes_map[nid] = {"id": nid, "label": label, "type": ntype,
                              "arity": arity, "x": None, "y": None}

    def add_edge(from_id: str, to_id: str, label: str, style: str = "solid") -> None:
        eid = f"{from_id}=>{to_id}:{label}"
        if eid not in edge_set:
            edge_set.add(eid)
            edges_list.append({"id": eid, "from": from_id, "to": to_id,
                               "label": label, "style": style})

    def split_top(s: str) -> list[str]:
        """Split s by top-level commas (respects nested parens/brackets)."""
        parts: list[str] = []
        depth, cur = 0, ""
        for ch in s:
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            elif ch == "," and depth == 0:
                parts.append(cur.strip())
                cur = ""
                continue
            cur += ch
        if cur.strip():
            parts.append(cur.strip())
        return parts

    def parse_head(head: str):
        """Return (functor, arity, args_list) from a head term string."""
        head = head.strip()
        m = _re.match(r'^([a-z_][a-zA-Z0-9_]*)\s*\((.+)\)\s*$', head, _re.DOTALL)
        if m:
            args = split_top(m.group(2))
            return m.group(1), len(args), args
        m2 = _re.match(r'^([a-z_][a-zA-Z0-9_]*)$', head)
        if m2:
            return m2.group(1), 0, []
        return None, 0, []

    def classify(term: str):
        """Classify a term as 'var', 'atom', or 'compound'."""
        t = term.strip()
        if _re.match(r'^[A-Z_][a-zA-Z0-9_]*$', t):
            return "var"
        if _re.match(r'^-?\d+(\.\d+)?$', t) or _re.match(r'^[a-z_][a-zA-Z0-9_]*$', t):
            return "atom"
        return "compound"

    def all_vars(text: str) -> list[str]:
        """Extract all unique variable names (uppercase start) from text."""
        return list(dict.fromkeys(
            v for v in _re.findall(r'\b([A-Z_][a-zA-Z0-9_]*)\b', text)
            if v != '_'
        ))

    # ── First pass: collect all user-defined predicate keys ──────────────────
    raw_clauses = _re.split(r'\.\s+|\.\s*$', code, flags=_re.MULTILINE)
    clauses: list[tuple] = []
    pred_keys: set[str] = set()
    has_body: set[str] = set()

    for raw in raw_clauses:
        clause = raw.strip()
        if not clause:
            continue
        if ":-" in clause:
            head_str, body_str = clause.split(":-", 1)
        else:
            head_str, body_str = clause, ""
        functor, arity, args = parse_head(head_str)
        if not functor:
            continue
        key = f"{functor}/{arity}"
        pred_keys.add(key)
        if body_str.strip():
            has_body.add(key)
        clauses.append((key, functor, arity, args, body_str.strip()))

    # ── Create predicate nodes ────────────────────────────────────────────────
    seen_pred: set[str] = set()
    for key, functor, arity, args, body_str in clauses:
        ntype = "rule" if key in has_body else "fact"
        pred_id = f"pred:{key}"
        if key not in seen_pred:
            add_node(pred_id, functor, ntype, arity)
            seen_pred.add(key)
        elif ntype == "rule":
            nodes_map[pred_id]["type"] = "rule"

    # ── Second pass: head args + body goals ──────────────────────────────────
    for key, functor, arity, args, body_str in clauses:
        pred_id = f"pred:{key}"

        # Head arguments → argN edges
        for i, arg in enumerate(args):
            kind = classify(arg)
            if kind == "var":
                nid = f"var:{key}:{arg}"
                add_node(nid, arg, "var", 0)
                add_edge(pred_id, nid, f"arg{i+1}")
            elif kind == "atom":
                nid = f"atom:{arg}"
                add_node(nid, arg, "atom", 0)
                add_edge(pred_id, nid, f"arg{i+1}")
            # compound head args: skip (rare in typical Prolog)

        # Body goals
        if body_str:
            body_goals = split_top(body_str)
            for goal in body_goals:
                goal = goal.strip()
                if not goal:
                    continue

                # Check if it calls a known user-defined predicate
                gm = _re.match(r'^([a-z_][a-zA-Z0-9_]*)\s*\((.+)\)\s*$', goal, _re.DOTALL)
                if gm:
                    gf = gm.group(1)
                    gargs = split_top(gm.group(2))
                    gkey = f"{gf}/{len(gargs)}"
                    if gkey in pred_keys:
                        add_edge(pred_id, f"pred:{gkey}", "calls", "dashed")
                        continue
                elif _re.match(r'^([a-z_][a-zA-Z0-9_]*)$', goal):
                    # Bare atom body goal (e.g. a known fact)
                    gkey = f"{goal}/0"
                    if gkey in pred_keys:
                        add_edge(pred_id, f"pred:{gkey}", "calls", "dashed")
                        continue

                # Builtin / expression goal → FACT node + calls edge
                norm = _re.sub(r'\s+', ' ', goal)
                goal_id = f"goal:{key}:{norm}"
                label = norm if len(norm) <= 14 else norm[:13] + "…"
                add_node(goal_id, label, "fact", 0)
                add_edge(pred_id, goal_id, "calls", "dashed")

                # Variables inside the body goal → VAR nodes + uses edges
                for var_name in all_vars(goal):
                    vid = f"var:{key}:{var_name}"
                    add_node(vid, var_name, "var", 0)
                    add_edge(pred_id, vid, "uses")

    return {"nodes": list(nodes_map.values()), "edges": edges_list}

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

        # Collect ALL proof trees correctly:
        # 1. Use call(Query) to enumerate real solutions — this respects ! cuts.
        # 2. For each solution, variables are already bound (e.g. X=pizza, Y=apple),
        #    so solve_with_trace(Query, T) runs the meta-interpreter on the specific
        #    instantiated goal, producing one correct proof tree per solution.
        # This avoids findall's cut-barrier problem AND avoids iterating the
        # meta-interpreter directly (which treats ! as a no-op via call(!)).
        q_proof_all = (
            "catch(("
            "call(" + query + "),"
            "meta_interpreter:solve_with_trace(" + query + ", T),"
            "with_output_to(string(S), meta_interpreter:print_proof_tree(T))"
            "), _, fail)"
        )
        try:
            all_sols = checker._call_with_timeout(
                lambda: list(prolog.query(q_proof_all, maxresult=50)),
                5
            )
        except Exception:
            all_sols = []

        if all_sols:
            counter = [0]
            proof_nodes = []
            for sol in all_sols:
                tree_str = sol.get("S", b"")
                if isinstance(tree_str, bytes):
                    tree_str = tree_str.decode("utf-8", errors="replace")
                proof_nodes.extend(_proof_text_to_nodes(tree_str, counter))
            proof_tree = "\n---\n".join(
                (sol.get("S", b"").decode("utf-8", errors="replace")
                 if isinstance(sol.get("S", b""), bytes) else str(sol.get("S", "")))
                for sol in all_sols
            )
        else:
            proof_tree = checker._gen_proof_for_goal(query) or "No proof tree (query failed)"
            proof_tree_str = proof_tree.decode("utf-8", errors="replace") if isinstance(proof_tree, bytes) else (proof_tree or "")
            proof_nodes = _proof_text_to_nodes(proof_tree_str)

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

        # "incomplete" means the goal cleanly failed (no solutions) — show as "false", not an error
        query_failed = (mode == "incomplete")
        has_logic_error = not query_failed and mode not in ("ok", "incorrect", "")
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
            "query_result":       "false" if query_failed else "true",
            "trace":              trace_text,
            "proof_tree":         proof_tree,
            "proof_nodes":        proof_nodes,
            "shapiro_mode":       mode,
            "has_logic_error":    has_logic_error,
            "shapiro_nodes_text": nodes_text,
            "debug_summary":      debug_summary,
            "analysis":           analysis,
            "trace_stats":        _trace_stats(trace_text),
        }
    finally:
        temp_student.unlink(missing_ok=True)

def _get_all_problems():
    data, conn = get_root()   

    try:
        problems = []
        for lab in data.labs.values():
            for q in lab.lab_question:
                problems.append({
                    "id": q.question_id,
                    "title": q.title,
                    "description": q.problem,   
                    "lab_id": lab.lab_id,
                })

        return problems
    finally:
        conn.close()

def _convert_testcases_to_prolog(testcases: list[TestCase]) -> str:
    lines = []
    for tc in testcases:
        goal = tc.input.strip()
        if tc.expected_output.lower() == "true":
            lines.append(f"test({goal}, [{goal}]).")
        else:
            lines.append(f"test({goal}, []).")
    return "\n".join(lines)

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
        "problems": _get_all_problems(),
        "students": _list_rel(ROOT / "data" / "student_codes",  "*.pl"),
        "tests":    _list_rel(ROOT / "data" / "test_files",     "*.pl"),
    }

@app.post("/api/load")
def load_file(payload: BasePayload):

        # Load student file from disk
        student_code = _safe_read(_to_abs(payload.student_file))

        return {
            "student_code": student_code       # from file
        }

@app.post("/api/syntax-check")
def syntax_check(payload: BasePayload) -> dict[str, Any]:

    # Get problem from DB
    data, conn = get_root()
    try:
        problem = None
        for lab in data.labs.values():
            for q in lab.lab_question:
                print(f"Checking problem {q.question_id} against payload {payload.problem_id}")
                if str(q.question_id) == str(payload.problem_id):
                    problem = q
                    break
            if problem:
                break

        if not problem:
            raise HTTPException(status_code=404, detail="Problem not found")

        # Write problem to temp file
        problem_path = _write_temp(problem.problem)

    finally:
        conn.close()

    # Write student code to temp file
    temp_student = _write_temp(payload.student_code)

    try:
        checker = _make_checker(problem_path, temp_student)

        log: list[str] = []
        ok = checker.check_syntax(log)

        return {
            "ok": ok,
            "feedback": "\n".join(log),
            "syntax_error": checker.syntax_error
        }

    finally:
        problem_path.unlink(missing_ok=True)
        temp_student.unlink(missing_ok=True)

@app.post("/api/query-run")
def query_run(payload: QueryPayload) -> dict[str, Any]:
    query = payload.query.strip().rstrip(".")
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")

    if not hasattr(payload, "problem_id") or not payload.problem_id:
        raise HTTPException(status_code=400, detail="Problem id is required")

    data, conn = get_root()

    try:
        qid = int(payload.problem_id)  

        for lab in data.labs.values():
            for q in lab.lab_question:
                if q.question_id == qid:
                    problem_path = _write_temp(q.problem)
                    return _execute_query(problem_path, payload.student_code, query)

        raise HTTPException(status_code=404, detail="Problem not found")

    finally:
        conn.close()

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

class GraphDataPayload(BaseModel):
    student_code: str

@app.post("/api/graph-data")
def graph_data(payload: GraphDataPayload) -> dict[str, Any]:
    """Return predicate-level graph nodes and edges extracted by SWI-Prolog
    from the student code.  Replaces the frontend-only prologParser.js approach."""
    result = _get_graph_data(payload.student_code)
    return {"ok": True, **result}

@app.post("/api/llm-feedback")
def llm_feedback(payload: QueryPayload) -> dict[str, Any]:
    # First run query (already DB-based)
    result = query_run(payload)

    if not result.get("ok"):
        return result

    data, conn = get_root()

    try:
        qid = int(payload.problem_id)

        # ✅ find problem in DB
        for lab in data.labs.values():
            for q in lab.lab_question:
                if q.question_id == qid:
                    problem_path = _write_temp(q.problem)

                    temp_student = _write_temp(payload.student_code)
                    try:
                        checker = _make_checker(problem_path, temp_student)

                        analysis = dict(result.get("analysis", {}))
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
                        problem_path.unlink(missing_ok=True)

        raise HTTPException(status_code=404, detail="Problem not found")

    finally:
        conn.close()

@app.post("/api/full-diagnosis")
def full_diagnosis(payload: FullDiagnosisPayload) -> dict[str, Any]:
    data, conn = get_root()

    try:
        qid = int(payload.problem_id)

        # find problem
        for lab in data.labs.values():
            for q in lab.lab_question:
                if q.question_id == qid:
                    problem_path = _write_temp(q.problem)

                    temp_student = _write_temp(payload.student_code)

                    with tempfile.NamedTemporaryFile(mode="w", suffix="_fixed.pl", delete=False) as fh:
                        fix_path = Path(fh.name)

                    test_file_path = None

                    if payload.test_cases_file:
                        prolog_tests = _convert_testcases_to_prolog(payload.test_cases_file)

                        with tempfile.NamedTemporaryFile(mode="w", suffix=".pl", delete=False) as tf:
                            tf.write(prolog_tests)
                            test_file_path = Path(tf.name)

                    try:
                        checker = _make_checker(
                            problem_path,
                            temp_student,
                            test_cases_file=test_file_path,
                            auto_fix=True,
                            max_fix_attempts=2,
                            fix_output_path=fix_path,
                        )

                        full_log = checker.run()

                        corrected = (
                            fix_path.read_text()
                            if fix_path.exists() and fix_path.stat().st_size > 0
                            else ""
                        )

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
                            "ok": True,
                            "log": full_log,
                            "corrected_code": corrected,
                            "diff": diff_text,
                            "changed": bool(diff_text),
                        }

                    finally:
                        temp_student.unlink(missing_ok=True)
                        fix_path.unlink(missing_ok=True)
                        problem_path.unlink(missing_ok=True)
                        if test_file_path:
                            test_file_path.unlink(missing_ok=True)

        raise HTTPException(status_code=404, detail="Problem not found")

    finally:
        conn.close()

class GenerateTestCasesPayload(BaseModel):
    problem_id: int
    student_code: str

@app.post("/api/generate-diagnosis-testcases")
def generate_diagnosis_testcases(payload: GenerateTestCasesPayload) -> dict[str, Any]:
    """Generate LLM test cases for diagnosis in simple input/expected_output format."""
    import os
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return {"ok": False, "test_cases": [], "error": "GROQ_API_KEY not set"}

    data, conn = get_root()
    try:
        qid = int(payload.problem_id)
        problem_text = None
        for lab in data.labs.values():
            for q in lab.lab_question:
                if q.question_id == qid:
                    problem_text = q.problem
                    break
            if problem_text is not None:
                break

        if problem_text is None:
            raise HTTPException(status_code=404, detail="Problem not found")

        try:
            test_cases = _gen_simple_tc(problem_text, payload.student_code, api_key)
            return {"ok": True, "test_cases": test_cases}
        except Exception as e:
            return {"ok": False, "test_cases": [], "error": str(e)}
    finally:
        conn.close()


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

def _get_user(data, user_id: str, role: str):
    """Return the user object from the database, or None."""
    if role == "student":
        return data.students.get(user_id)
    elif role == "teacher":
        return data.teachers.get(user_id)
    return None

def _ensure_code_files(user):
    """Initialize code_files mapping if the user object predates the field."""
    from persistent.mapping import PersistentMapping
    if not hasattr(user, 'code_files') or user.code_files is None:
        user.code_files = PersistentMapping()
        user._p_changed = True

@app.get("/api/user-files")
def get_user_files(user_id: str, role: str) -> dict[str, Any]:
    data, conn = get_root()
    try:
        user = _get_user(data, user_id, role)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        code_files = getattr(user, 'code_files', {}) or {}
        return {"files": sorted(code_files.keys())}
    finally:
        conn.close()

@app.post("/api/user-file/load")
def load_user_file(payload: UserFileLoadPayload) -> dict[str, Any]:
    data, conn = get_root()
    try:
        user = _get_user(data, payload.user_id, payload.role)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        code_files = getattr(user, 'code_files', {}) or {}
        filename = Path(payload.filename).name
        if filename not in code_files:
            raise HTTPException(status_code=404, detail="File not found")
        return {"student_code": code_files[filename]}
    finally:
        conn.close()

@app.post("/api/user-file/save")
def save_user_file(payload: UserFileSavePayload) -> dict[str, Any]:
    import transaction                          # ← add this import
    data, conn = get_root()
    try:
        user = _get_user(data, payload.user_id, payload.role)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        _ensure_code_files(user)
        filename = Path(payload.filename).name
        if not filename.endswith('.pl'):
            filename += '.pl'
        user.code_files[filename] = payload.code
        transaction.commit()                    # ← replaces undefined commit_changes()
        return {"ok": True, "filename": filename}
    except HTTPException:
        transaction.abort()
        raise
    except Exception as e:
        transaction.abort()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()                            # ← now safe: commit/abort happened first

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

# ── SPA catch-all — serves index.html for any non-API, non-static path ────────
# This must be the LAST route so it doesn't shadow the routes above.
@app.get("/{full_path:path}")
def spa_fallback(full_path: str) -> FileResponse:
    index = BUILD_DIR / "index.html"
    if not index.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend not built yet. Run: cd webui/frontend && npm run build"
        )
    return FileResponse(str(index))

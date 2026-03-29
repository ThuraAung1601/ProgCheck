const state = {
  lastQueryResult: null,
  lastDiagnosisResult: null,
  selectedProblem: "",
  selectedStudent: "",
  selectedTest: "",
};

const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

function setFeedback(text) {
  $("feedbackText").textContent = text || "";
}

function buildPayload() {
  return {
    problem_file: state.selectedProblem,
    student_file: state.selectedStudent,
    student_code: $("editor").value,
  };
}

function fillSelect(selectEl, values, placeholder) {
  selectEl.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  selectEl.appendChild(ph);
  values.forEach((val) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = val;
    selectEl.appendChild(opt);
  });
}

async function loadOptions() {
  const res = await fetch("/api/options");
  const data = await res.json();
  fillSelect($("problemSelect"), data.problems || [], "Select problem");
  fillSelect($("studentSelect"), data.students || [], "Select student code");
  fillSelect($("testSelect"), data.tests || [], "Select test file");
}

async function loadFiles() {
  if (!state.selectedProblem || !state.selectedStudent) {
    setFeedback("Please choose problem and student code first.");
    return;
  }
  const data = await api("/api/load", {
    problem_file: state.selectedProblem,
    student_file: state.selectedStudent,
    student_code: "",
  });
  $("questionText").textContent = data.problem_text || "";
  $("editor").value = data.student_code || "";
  setFeedback("Loaded problem + student code.");
}

function normalizeQuery(input) {
  const q = (input || "").trim();
  if (!q) return "";
  return q.endsWith(".") ? q.slice(0, -1) : q;
}

function prettyShapiroMode(mode) {
  const raw = (mode || "").toString();
  if (raw === "incorrect") return "proof_succeeded (incorrect-mode)";
  if (!raw) return "unknown";
  return raw;
}

async function checkSyntax() {
  const payload = buildPayload();
  const result = await api("/api/syntax-check", payload);
  if (!result.ok) {
    setFeedback(result.feedback || "Syntax error");
    return;
  }
  setFeedback(result.feedback || "Syntax OK.");
}

async function runQuery() {
  const query = normalizeQuery($("queryInput").value);
  if (!query) {
    setFeedback("Enter a query first.");
    return;
  }
  const payload = { ...buildPayload(), query };
  const result = await api("/api/query-run", payload);
  state.lastQueryResult = result;
  if (!result.ok) {
    setFeedback(result.feedback || "Failed.");
    return;
  }
  const text = [
    `Query: ${result.query}`,
    `Shapiro mode: ${prettyShapiroMode(result.shapiro_mode)} (raw: ${result.shapiro_mode || "unknown"})`,
    "",
    "Execution Trace:",
    result.trace,
    "",
    "Proof Tree:",
    result.proof_tree,
    "",
    "Debug Summary:",
    result.debug_summary,
  ].join("\n");
  setFeedback(text);
}

async function runLlmFeedback() {
  const query = normalizeQuery($("queryInput").value);
  if (!query) {
    setFeedback("Enter a query first.");
    return;
  }
  const payload = { ...buildPayload(), query };
  const result = await api("/api/llm-feedback", payload);
  state.lastQueryResult = result;
  const text = [
    "LLM Feedback:",
    result.feedback || "",
    "",
    "Execution Trace:",
    result.trace || "",
    "",
    "Proof Tree:",
    result.proof_tree || "",
    "",
    "Debug Summary:",
    result.debug_summary || "",
  ].join("\n");
  setFeedback(text);
}

function parseTraceSteps(traceText = "") {
  return traceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => ({
      idx,
      line,
      isError: /failed|Depth limit exceeded/i.test(line),
    }));
}

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openVisualizationPopup() {
  const result = state.lastQueryResult;
  if (!result || !result.trace) {
    setFeedback("Run a test query first to visualize trace.");
    return;
  }

  const baseQuery = result.query || normalizeQuery($("queryInput").value);
  const baseCode = $("editor").value;

  const win = window.open("", "trace-visualization", "width=1100,height=760");
  if (!win) {
    setFeedback("Popup blocked. Please allow popups for this site.");
    return;
  }

  const style = `
    body { font-family: -apple-system,Segoe UI,sans-serif; margin:0; background:#0b1220; color:#e5e7eb; }
    .wrap { display:grid; grid-template-rows: auto 1fr; height:100vh; }
    .top { padding:12px; border-bottom:1px solid #334155; display:grid; gap:10px; }
    .codeRow { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
    .outRow { display:grid; grid-template-columns: 1fr 1fr; min-height:0; }
    .panel { padding:12px; overflow:auto; border-right:1px solid #334155; }
    .panel:last-child { border-right:none; }
    textarea,input { width:100%; background:#0f172a; color:#e5e7eb; border:1px solid #334155; border-radius:6px; padding:8px; font-family: ui-monospace,Menlo,monospace; }
    textarea { min-height:130px; }
    .step { padding:8px; margin:6px 0; border-radius:6px; border:1px solid #334155; }
    .step.current { border-color:#10b981; background:#052e24; }
    .step.cut { border-color:#eab308; background:#3a2a08; }
    .step.bad { border-color:#ef4444; background:#3a0d0d; }
    .controls { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
    button { padding:6px 10px; border-radius:6px; border:1px solid #475569; background:#1e293b; color:#e5e7eb; }
    .ok { color:#10b981; }
    .badText { color:#ef4444; }
    .warn { color:#f59e0b; }
    pre { white-space: pre-wrap; background:#0f172a; border:1px solid #334155; padding:8px; border-radius:6px; }
    .stats { display:grid; grid-template-columns: repeat(4, minmax(80px, 1fr)); gap:6px; margin:8px 0; }
    .chip { border:1px solid #334155; border-radius:8px; padding:6px; background:#111827; font-size:12px; }
    .title { font-weight:600; margin-bottom:6px; }
  `;

  win.document.write(`
    <html>
      <head><title>Trace Visualization</title><style>${style}</style></head>
      <body>
        <div class="wrap">
          <div class="top">
            <div class="title">Cut Playground (compare cut placement)</div>
            <input id="playQuery" value="${escapeHtml(baseQuery)}" placeholder="Query, e.g. max(7,2,R)" />
            <div class="codeRow">
              <div>
                <div class="title">Code A</div>
                <textarea id="codeA">${escapeHtml(baseCode)}</textarea>
              </div>
              <div>
                <div class="title">Code B</div>
                <textarea id="codeB">${escapeHtml(baseCode)}</textarea>
              </div>
            </div>
            <div class="controls">
              <button id="compareBtn">Compare A vs B</button>
              <button id="prevBtn">← Prev</button>
              <button id="nextBtn">Next →</button>
              <span class="warn">Yellow = cut step, Red = logic error step</span>
            </div>
          </div>
          <div class="outRow">
            <div class="panel">
              <h3>Variant A</h3>
              <div id="statusA" class="ok">Ready.</div>
              <div id="statsA" class="stats"></div>
              <div id="stepsA"></div>
              <h4>Proof Tree</h4>
              <pre id="proofA"></pre>
              <h4>Debug Summary</h4>
              <pre id="summaryA"></pre>
            </div>
            <div class="panel">
              <h3>Variant B</h3>
              <div id="statusB" class="ok">Ready.</div>
              <div id="statsB" class="stats"></div>
              <div id="stepsB"></div>
              <h4>Proof Tree</h4>
              <pre id="proofB"></pre>
              <h4>Debug Summary</h4>
              <pre id="summaryB"></pre>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);

  let current = 0;
  let stepsA = parseTraceSteps(result.trace || "").map((s) => ({ ...s, isCut: /CUT - pruning alternatives/i.test(s.line) }));
  let stepsB = [];
  let modeA = result.shapiro_mode || "unknown";
  let modeB = "unknown";
  let hasErrA = !!result.has_logic_error;
  let hasErrB = false;

  const rowsToStats = (stats) => {
    const s = stats || {};
    return [
      ["Cuts", s.cut_events ?? 0],
      ["Choice", s.choice_points ?? 0],
      ["Failed", s.failed_steps ?? 0],
      ["DepthLimit", s.depth_limit_hits ?? 0],
    ];
  };

  const fillStats = (elId, stats) => {
    const root = win.document.getElementById(elId);
    root.innerHTML = "";
    rowsToStats(stats).forEach(([k, v]) => {
      const div = win.document.createElement("div");
      div.className = "chip";
      div.textContent = `${k}: ${v}`;
      root.appendChild(div);
    });
  };

  const renderSteps = (rootId, steps, hasLogicError) => {
    const root = win.document.getElementById(rootId);
    root.innerHTML = "";
    steps.forEach((step, idx) => {
      const div = win.document.createElement("div");
      div.className = "step";
      if (idx === current) div.classList.add("current");
      if (step.isCut) div.classList.add("cut");
      if (hasLogicError && (step.isError || idx === steps.length - 1)) div.classList.add("bad");
      div.textContent = step.line;
      root.appendChild(div);
    });
  };

  const renderAll = (resA, resB) => {
    const statusA = win.document.getElementById("statusA");
    const statusB = win.document.getElementById("statusB");
    statusA.className = hasErrA ? "badText" : "ok";
    statusB.className = hasErrB ? "badText" : "ok";
    statusA.textContent = `Mode: ${prettyShapiroMode(modeA)} (raw: ${modeA || "unknown"})`;
    statusB.textContent = `Mode: ${prettyShapiroMode(modeB)} (raw: ${modeB || "unknown"})`;

    fillStats("statsA", (resA && resA.trace_stats) || result.trace_stats || {});
    fillStats("statsB", (resB && resB.trace_stats) || {});

    win.document.getElementById("proofA").textContent = (resA && resA.proof_tree) || result.proof_tree || "";
    win.document.getElementById("summaryA").textContent = (resA && resA.debug_summary) || result.debug_summary || "";
    win.document.getElementById("proofB").textContent = (resB && resB.proof_tree) || "";
    win.document.getElementById("summaryB").textContent = (resB && resB.debug_summary) || "";

    renderSteps("stepsA", stepsA, hasErrA);
    renderSteps("stepsB", stepsB, hasErrB);
  };

  win.document.getElementById("compareBtn").onclick = async () => {
    const query = (win.document.getElementById("playQuery").value || "").trim().replace(/\.$/, "");
    if (!query) {
      setFeedback("Playground query is required.");
      return;
    }
    const payload = {
      problem_file: state.selectedProblem,
      query,
      code_a: win.document.getElementById("codeA").value,
      code_b: win.document.getElementById("codeB").value,
    };

    try {
      const cmp = await api("/api/cut-compare", payload);
      const left = cmp.left || {};
      const right = cmp.right || {};
      modeA = left.shapiro_mode || "unknown";
      modeB = right.shapiro_mode || "unknown";
      hasErrA = !!left.has_logic_error;
      hasErrB = !!right.has_logic_error;
      stepsA = parseTraceSteps(left.trace || "").map((s) => ({ ...s, isCut: /CUT - pruning alternatives/i.test(s.line) }));
      stepsB = parseTraceSteps(right.trace || "").map((s) => ({ ...s, isCut: /CUT - pruning alternatives/i.test(s.line) }));
      current = 0;
      renderAll(left, right);
    } catch (e) {
      setFeedback(String(e));
    }
  };

  win.document.getElementById("prevBtn").onclick = () => {
    current = Math.max(0, current - 1);
    renderAll();
  };
  win.document.getElementById("nextBtn").onclick = () => {
    const maxLen = Math.max(stepsA.length, stepsB.length, 1);
    current = Math.min(maxLen - 1, current + 1);
    renderAll();
  };

  renderAll(result, null);
}

async function runFullDiagnosis() {
  const payload = {
    ...buildPayload(),
    test_cases_file: state.selectedTest || null,
  };
  const result = await api("/api/full-diagnosis", payload);
  state.lastDiagnosisResult = result;
  setFeedback(result.log || "Diagnosis finished.");

  if (result.changed) {
    $("diffText").textContent = result.diff || "";
    $("fixDialog").showModal();
  }
}

async function applyFix(accept) {
  const result = state.lastDiagnosisResult;
  $("fixDialog").close();
  if (!result || !result.corrected_code) return;

  if (accept) {
    const payload = {
      student_file: state.selectedStudent,
      corrected_code: result.corrected_code,
      accept: true,
    };
    await api("/api/apply-fix", payload);
    $("editor").value = result.corrected_code;
    setFeedback("Fix accepted and applied to editor + student file.");
  } else {
    setFeedback("Fix denied. Original code kept.");
  }
}

async function saveCode() {
  const payload = {
    student_file: state.selectedStudent,
    corrected_code: $("editor").value,
    accept: true,
  };
  await api("/api/apply-fix", payload);
  setFeedback("Code saved.");
}

function makeSplitResizable() {
  const layout = $("mainLayout");
  const rightPane = $("rightPane");
  const vDivider = document.querySelector(".divider.vertical");
  const hDividers = Array.from(document.querySelectorAll(".divider.horizontal"));

  let startX = 0;
  let startLeft = 50;

  vDivider.addEventListener("mousedown", (e) => {
    startX = e.clientX;
    const width = layout.getBoundingClientRect().width;
    const leftWidth = document.querySelector(".editor-pane").getBoundingClientRect().width;
    startLeft = (leftWidth / width) * 100;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const pct = Math.max(20, Math.min(80, startLeft + (dx / width) * 100));
      layout.style.gridTemplateColumns = `${pct}fr 6px ${100 - pct}fr`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  hDividers.forEach((divider, idx) => {
    divider.addEventListener("mousedown", (e) => {
      const rect = rightPane.getBoundingClientRect();
      const startY = e.clientY;
      const rows = getComputedStyle(rightPane).gridTemplateRows.split(" ");
      const qH = document.getElementById("questionPanel").getBoundingClientRect().height;
      const tH = document.getElementById("queryPanel").getBoundingClientRect().height;
      const fH = document.getElementById("feedbackPanel").getBoundingClientRect().height;

      const onMove = (ev) => {
        const dy = ev.clientY - startY;
        if (idx === 0) {
          const nq = Math.max(120, qH + dy);
          const nt = Math.max(100, tH - dy);
          rightPane.style.gridTemplateRows = `${nq}px 6px ${nt}px 6px 1fr`;
        } else {
          const nt = Math.max(100, tH + dy);
          const nf = Math.max(120, fH - dy);
          rightPane.style.gridTemplateRows = `1fr 6px ${nt}px 6px ${nf}px`;
        }
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function setupClosablePanels() {
  document.querySelectorAll(".toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.toggle);
      const hidden = target.classList.toggle("hidden-panel");
      btn.textContent = hidden ? "Open" : "Close";
    });
  });
}

function setupEvents() {
  $("problemSelect").addEventListener("change", (e) => { state.selectedProblem = e.target.value; });
  $("studentSelect").addEventListener("change", (e) => { state.selectedStudent = e.target.value; });
  $("testSelect").addEventListener("change", (e) => { state.selectedTest = e.target.value; });

  $("loadBtn").addEventListener("click", () => loadFiles().catch((e) => setFeedback(String(e))));
  $("saveBtn").addEventListener("click", () => saveCode().catch((e) => setFeedback(String(e))));
  $("syntaxBtn").addEventListener("click", () => checkSyntax().catch((e) => setFeedback(String(e))));
  $("queryBtn").addEventListener("click", () => runQuery().catch((e) => setFeedback(String(e))));
  $("llmBtn").addEventListener("click", () => runLlmFeedback().catch((e) => setFeedback(String(e))));
  $("visualizeBtn").addEventListener("click", openVisualizationPopup);
  $("diagnoseBtn").addEventListener("click", () => runFullDiagnosis().catch((e) => setFeedback(String(e))));

  $("acceptFixBtn").addEventListener("click", () => applyFix(true).catch((e) => setFeedback(String(e))));
  $("denyFixBtn").addEventListener("click", () => applyFix(false).catch((e) => setFeedback(String(e))));
}

async function init() {
  await loadOptions();
  setupEvents();
  makeSplitResizable();
  setupClosablePanels();
}

init().catch((e) => setFeedback(String(e)));

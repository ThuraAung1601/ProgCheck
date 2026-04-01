# ProgCheck + Prolog Visualizer

A Prolog assignment checker with interactive visual debugging.

## Features

| Feature | Description |
|---|---|
| **Syntax check** | Grammar-based parser highlights errors with hints |
| **Query runner** | Runs a goal, returns proof tree + execution trace + Shapiro mode |
| **LLM feedback** | Natural-language explanation of errors via Groq |
| **Full diagnosis** | All test cases, algorithmic debugger, optional auto-fix |
| **Knowledge graph** | Drag predicate nodes to reorder code · drag edge endpoints to rewire arguments |
| **Backtracking trace** | Step-through tree showing every clause tried, ghost nodes for cut-prevented paths |

## Project Structure

```
progcheck/
├── check_prolog.py          CLI entry-point
├── requirements.txt
├── start.sh                 Build frontend + start server (production)
├── start_dev.sh             Hot-reload dev mode (two servers)
├── .env.example             Copy to .env and add your GROQ_API_KEY
│
├── src/
│   ├── checker/
│   │   ├── __init__.py
│   │   └── prolog_checker.py    Core checker class
│   ├── prolog/
│   │   ├── meta_interpreter.pl  SWI-Prolog meta-interpreter
│   │   ├── diagnosis_engine.pl  Shapiro algorithmic debugger
│   │   └── prolog_parser.pl     Grammar-based syntax checker
│   ├── algorithmic_debugger.py  LLM oracle for Shapiro debugging
│   ├── llm_bridge.py            Groq API calls
│   └── utils.py                 Shared utilities
│
├── data/
│   ├── examples/            Problem description .txt files
│   ├── student_codes/       Student .pl submissions
│   └── test_files/          Test query .pl files
│
├── webui/
│   ├── main.py              FastAPI server (API + static serving)
│   └── frontend/            React source (Tailwind + custom components)
│       └── src/
│           ├── App.js
│           ├── components/
│           │   ├── CodeEditor.js      Syntax-highlighted editor (aligned cursor)
│           │   ├── GraphCanvas.js     Drag-and-drop knowledge graph
│           │   ├── BacktrackTree.js   Backtracking trace visualizer
│           │   └── NodeInfo.js
│           └── utils/
│               ├── prologParser.js    Prolog → AST
│               ├── engineOutputParser.js  Proof tree text → trace nodes
│               ├── treeLayout.js      Reingold-Tilford tree layout
│               └── rewire.js          Edge drag → code rewrite
│
└── static/                  React build output (generated — not committed)
```

## Quick Start

### Requirements
- Python 3.11+
- Node.js 18+
- [SWI-Prolog](https://www.swi-prolog.org/) installed and on `PATH`
- A [Groq API key](https://console.groq.com/)

### Setup

```bash
# 1. Clone / unzip the project
cd progcheck

# 2. Python dependencies
pip install -r requirements.txt

# 3. API key
cp .env.example .env
# Edit .env and set GROQ_API_KEY=gsk_...

# 4. Build frontend + start (production)
./start.sh
```

Open **http://localhost:8000**

### Development mode (hot-reload)

```bash
./start_dev.sh
# Backend  → http://localhost:8000
# Frontend → http://localhost:3000
```

## Usage Workflow

1. **Select** a problem file and student code from the dropdowns
2. **Load** — loads the problem description and code into the editor
3. **Edit** the code directly, or drag graph nodes/edges to restructure it
4. **Syntax** — check for parse errors
5. **Run** — execute a query (e.g. `factorial(3, X)`) to get the proof tree
6. **Visualize** — parse the proof tree into the interactive backtracking tree
7. **LLM** — get natural-language feedback from Groq
8. **Diagnose** — run all test cases with full algorithmic debugging

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes (for LLM) | Groq API key |

## CLI Usage

```bash
python check_prolog.py \
  --problem data/examples/factorial_problem.txt \
  --student_code data/student_codes/factorial_correct.pl \
  --output result.txt
```

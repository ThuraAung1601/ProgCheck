# ProgCheck Prolog Documentation

This document provides a comprehensive overview of the Prolog components within the ProgCheck system, including the parser, meta-interpreters, and diagnosis engine.

---

## 1. Prolog Parser ([src/prolog/prolog_parser.pl](src/prolog/prolog_parser.pl))

The parser implements a **two-stage syntax checker** that moves beyond simple regex to provide student-friendly error messages.

### Stage 1: Structural Check (SWI-Prolog `read_term`)
*   **Mechanism:** Uses `swi_structural_check/2` to attempt to read the file using the built-in Prolog reader.
*   **Purpose:** Catches hard syntax errors that prevent the file from loading.
*   **Detected Errors:** 
    *   Missing periods (`.`) at the end of clauses.
    *   Unmatched parentheses `()` or brackets `[]`.

### Stage 2: Semantic & Token-Level Check
*   **Mechanism:** Uses a custom tokenizer (`tokenize/2`) and BNF-based validator.
*   **Detected Errors:**
    *   **Invalid Operators:** Detects common "C-style" mistakes like `:=`, `!=`, `&&`, and `||`.
    *   **Lowercase Variables:** Identifies atoms that look like intended variables (e.g., `x` instead of `X`) based on length and context.
    *   **Missing Bodies:** Identifies rules that end with `:-` but have no goals.

---

## 2. Meta-Interpreter ([src/prolog/meta_interpreter.pl](src/prolog/meta_interpreter.pl))

The meta-interpreter is the heart of the system, providing four distinct execution modes (Shapiro's 4 Meta-Interpreters).

### A. Execution Tracer (`solve_with_trace/2`)
*   **Role:** Generates a positive proof tree for a successful goal.
*   **Output:** A nested structure: `proof(Goal, Body, SubTree)`.
*   **Usage:** Used by the **Correctness Debugger** to identify which specific clause in a successful proof is "unintended."

### B. Procedural Tracer (`trace_execution_with_failure/2`)
*   **Role:** Simulates the Prolog engine's step-by-step backtracking.
*   **Captures:** `step`, `failed`, `choice_point`, and `cut` events.
*   **Usage:** Powers the **WebUI Backtrack Graph**. Unlike `solve_with_trace`, it shows *why* things failed.

### C. Incompleteness Debugger (`debug_incomplete/2`)
*   **Role:** Analyzes goals that fail when they should succeed.
*   **Mechanism:** Enumerates all clauses of the failing predicate for the LLM Oracle to inspect for missing base cases or logic errors.

### D. Termination Debugger (`debug_nonterminating/2`)
*   **Role:** Detects infinite recursion.
*   **Mechanism:** Uses `solve_with_depth/2` to find goals exceeding depth limits.
*   **Logic:** Uses `is_decreasing_call/2` and `wf_smaller/2` to check if recursive calls are actually reducing the size of arguments (Well-Founded Ordering).

---

## 3. Diagnosis Engine ([src/prolog/diagnosis_engine.pl](src/prolog/diagnosis_engine.pl))

The Diagnosis Engine acts as the **Unified Dispatcher** between the Python backend and the Prolog meta-interpreters.

### Key Predicate: `shapiro_diagnose(+Goal, -Mode, -Data)`
Automatically detects the failure mode of a goal:
1.  **`nonterminating`**: If a goal hits the time/depth limit and is not progressing.
2.  **`incomplete`**: If a goal fails cleanly (no exception, just `fail`).
3.  **`incorrect`**: If a goal succeeds but provides a wrong answer (triggers proof tree extraction).
4.  **`ok`**: If the goal behaves as expected.

### Serialization: `shapiro_nodes_text/3`
Converts complex Prolog trace data into human-readable text blocks. These blocks are sent to the **LLM (llm_bridge.py)** so it can explain the bug to the student.

---

## 4. Grammar Support ([src/prolog/prolog_grammar.bnf](src/prolog/prolog_grammar.bnf))

The system supports a specific subset of Prolog suitable for educational use:
*   **Facts, Rules, and Queries**.
*   **Standard Terms:** Atoms, Variables, Numbers, Lists, Strings.
*   **Compound Terms:** `functor(arg1, ...)`.
*   **Operators:** Arithmetic (`+`, `-`, `*`, `/`, `mod`, `is`) and Comparison (`=`, `\=`, `<`, `>`, `=<`, `>=`).
*   **Built-ins:** `append/3`, `member/2`, `length/2`, `reverse/2`, `!`, `true`, `false`.

---

## 5. Summary of Internal Utilities

| Predicate | Purpose |
| :--- | :--- |
| `solve_with_depth/2` | Tracks recursion depth to prevent crashes. |
| `wf_smaller/2` | Checks if one term is "smaller" than another (induction helper). |
| `first_failing_test/1` | Finds the specific counter-example that triggers a student failure. |
| `builtin/1` | Defines the list of predicates the interpreter should execute directly. |

# Requirements Specification

This document defines the functional and non-functional requirements for the Prolog debugging system, organized by system-level and user-level perspectives.

## 1. System Requirements (Functional)

These requirements specify what the system must do internally to support debugging workflows.

### SR-F1: Problem Text Parsing
The system must parse problem specification files to extract predicate names, arities, and test case descriptions.

### SR-F2: Prolog Code Loading
The system must load student Prolog code into the SWI-Prolog runtime environment for analysis.

### SR-F3: Knowledge Base Integration
The system must load generated knowledge base facts (from LLM translation or manual input) into SWI-Prolog.

### SR-F4: Proof Tree Generation
The system must generate proof trees that trace the execution of sample goals through the meta-interpreter.

### SR-F5: Test Case Validation
The system must validate student code against provided test cases and report pass/fail outcomes.

### SR-F6: External Test File Support
The system must support optional external test-case files in Prolog format via the `--test_cases` flag.

### SR-F7: Missing Base Case Detection
The system must detect and report when a recursive predicate lacks a proper base case.

### SR-F8: Infinite Recursion Detection
The system must detect and report non-terminating recursive calls that exceed depth limits.

### SR-F9: Argument Order Error Detection
The system must detect when predicate arguments are swapped or in incorrect order.

### SR-F10: Evidence-Based Diagnosis Ranking
The system must produce ranked diagnoses with cumulative evidence scores, not probabilistic confidence values.

### SR-F11: Multiple Error Pattern Detection
The system must detect arity mismatches, overly general base cases, wrong base case values, cut/negation misuse, and operator precedence ambiguities.

### SR-F12: LLM Translation Integration
The system must translate problem text to Prolog facts and proof trees to natural language via LLM (when available).

---

## 2. System Requirements (Non-Functional)

These requirements specify quality attributes and constraints on how the system operates.

### SR-NF1: Execution Time Limits
The system must enforce time limits (default: 1 second) on individual Prolog query execution to prevent hanging.

### SR-NF2: Recursion Depth Limits
The system must enforce depth limits (default: 200 levels) to detect infinite recursion safely.

### SR-NF3: Cross-Platform Compatibility
The system must run on macOS, Linux, and Windows with Python 3.7+ and SWI-Prolog installed.

### SR-NF4: No GPU Requirement
The system must run entirely on CPU without requiring GPU acceleration.

### SR-NF5: Graceful Error Handling
The system must catch Prolog syntax errors, runtime errors, and malformed input, reporting them clearly without crashing.

### SR-NF6: LLM Role Constraint
The system must limit LLM usage to linguistic translation only; all logical reasoning must occur in Prolog.

### SR-NF7: Deterministic Output
The system must produce consistent, deterministic output formatting for the same inputs across runs.

### SR-NF8: Optional LLM Operation
The system must function without LLM API keys, falling back to manual test cases and basic output.

### SR-NF9: Human-Readable Logs
The system must output logs and reports in plain text format that is readable without specialized tools.

### SR-NF10: Minimal Dependencies
The system must minimize external dependencies (only `groq`, `pyswip`, `python-dotenv` required).

### SR-NF11: Safe Code Evaluation
The system must safely evaluate untrusted student code using time and depth limits to prevent resource exhaustion.

### SR-NF12: Maintainable Architecture
The system must maintain clear separation between Prolog reasoning, LLM translation, and Python orchestration layers.

---

## 3. User Requirements (Functional)

These requirements specify what users must be able to do with the system.

### UR-F1: Single Command Execution
Users must be able to run the entire analysis with a single CLI command specifying problem and student code files.

### UR-F2: Output File Specification
Users must be able to specify an output file path via the `--output` flag to save analysis results.

### UR-F3: Test File Provision
Users must be able to supply custom test cases via the `--test_cases` flag pointing to a Prolog file.

### UR-F4: Proof Tree Visualization
Users must be able to view proof trees for each test case execution in the output report.

### UR-F5: Error Pattern Inspection
Users must be able to see all detected error patterns with their names and descriptions.

### UR-F6: Evidence Item Review
Users must be able to review individual evidence items contributing to each diagnosis.

### UR-F7: Ranked Diagnosis Summary
Users must be able to see diagnoses ranked by evidence score from highest to lowest.

### UR-F8: Batch Execution
Users must be able to run all example scenarios via the provided shell script (`run_all_examples.sh`).

### UR-F9: Default LLM Provider
Users must be able to use Groq as the default LLM provider with minimal configuration.

### UR-F10: Alternative LLM Provider
Users must be able to switch to alternative LLM providers (e.g., Hugging Face models) if needed.

### UR-F11: Help and Documentation Access
Users must be able to view command-line help via `--help` and access documentation files.

### UR-F12: Example Problem Access
Users must have access to pre-built example problems and student code samples for testing.

---

## 4. User Requirements (Non-Functional)

These requirements specify quality attributes from the user's perspective.

### UR-NF1: Output Readability
The system output must be concise, well-formatted, and easy to read for both students and instructors.

### UR-NF2: Diagnostic Transparency
Diagnostics must be explainable with clear evidence trails, avoiding opaque "black box" reasoning.

### UR-NF3: CLI Stability
The command-line interface must produce consistent behavior and results across multiple runs.

### UR-NF4: Clear Error Messages
Error messages must be specific, actionable, and guide users toward resolution.

### UR-NF5: No Background Services
The system must not require running background services, databases, or daemon processes.

### UR-NF6: Simple Setup Process
Setup must require only two steps: installing Python dependencies and SWI-Prolog.

### UR-NF7: Fast Execution
Analysis must complete within seconds per test case under normal conditions.

### UR-NF8: Optional LLM Usage
LLM features must be optional; core functionality must work without API keys or internet access.

### UR-NF9: Focused Documentation
Documentation must be short, practical, and focused on essential usage patterns.

### UR-NF10: Safe Evaluation Environment
The system must safely evaluate student code without risking host system security or stability.

### UR-NF11: Low Learning Curve
Users with basic command-line knowledge must be able to run the system after reading the quick start guide.

### UR-NF12: Reproducible Results
Given the same inputs, the system must produce identical analysis results for verification purposes.

---

## Requirement Traceability

All requirements are implemented across the following components:

- **Prolog reasoning layer**: [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl), [src/prolog/diagnosis_engine.pl](../src/prolog/diagnosis_engine.pl)
- **Python orchestration**: [check_prolog.py](../check_prolog.py)
- **LLM integration**: [src/llm_bridge.py](../src/llm_bridge.py)
- **Documentation**: [README.md](../README.md), [HOW_TO_USE.md](../HOW_TO_USE.md), [ARCHITECTURE.md](ARCHITECTURE.md)

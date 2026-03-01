# Prolog Architecture Documentation

## Overview

This document explains the Prolog components of the intelligent Prolog tutoring system. The Prolog layer forms the core analysis engine that executes, traces, validates, and diagnoses student Prolog code.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Module Overview](#module-overview)
3. [Meta-Interpreter Module](#meta-interpreter-module)
4. [Diagnosis Engine Module](#diagnosis-engine-module)
5. [Module Interconnection](#module-interconnection)
6. [Integration with Python](#integration-with-python)
7. [Execution Flow](#execution-flow)
8. [Key Algorithms](#key-algorithms)
9. [Error Detection Patterns](#error-detection-patterns)

---

## System Architecture

The Prolog subsystem consists of two main modules that work together:

```
┌─────────────────────────────────────────────┐
│          Python Layer (check_prolog.py)      │
│    - Orchestrates analysis workflow          │
│    - Calls Prolog predicates via PySwip      │
│    - Formats final output                    │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│        Prolog Layer (Two Modules)            │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │   meta_interpreter.pl              │    │
│  │   - Execution tracing              │    │
│  │   - Proof tree generation          │    │
│  │   - Test validation                │    │
│  │   - Depth-limited solving          │    │
│  └────────────────────────────────────┘    │
│                     │                        │
│                     ▼ (imports)              │
│  ┌────────────────────────────────────┐    │
│  │   diagnosis_engine.pl              │    │
│  │   - Error pattern detection        │    │
│  │   - Evidence-based diagnosis       │    │
│  │   - Ranked error reporting         │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│         Student Prolog Code                  │
│    - Loaded dynamically                      │
│    - Analyzed by meta-interpreter            │
│    - Diagnosed by diagnosis engine           │
└─────────────────────────────────────────────┘
```

---

## Module Overview

### 1. **meta_interpreter.pl**
**Purpose:** Core execution and tracing engine

**Exported Predicates:**
- `solve_with_trace/2` - Generate proof trees
- `print_proof_tree/1` - Pretty-print proof trees
- `detect_errors/2` - Basic error detection
- `validate_with_tests/3` - Test case validation
- `trace_execution_with_failure/2` - Detailed execution traces
- `format_execution_trace/2` - Format traces as strings
- `builtin/1` - Identify built-in predicates
- `solve_with_depth/2` - Depth-limited solving
- `contains_goal/2` - Check goal presence in body
- `contains_recursive_call/2` - Detect recursive calls

**Key Features:**
- Meta-circular interpreter for tracing
- Proof tree construction
- Execution trace with failure points
- Test case validation
- Infinite recursion detection

### 2. **diagnosis_engine.pl**
**Purpose:** Advanced error diagnosis with evidence-based ranking

**Exported Predicates:**
- `generate_diagnoses/2` - Main diagnosis entry point

**Imported from meta_interpreter:**
- `builtin/1`
- `solve_with_depth/2`
- `contains_goal/2`
- `contains_recursive_call/2`

**Key Features:**
- 11 error pattern detectors
- Evidence collection and scoring
- Ranked diagnosis output
- Pattern-based error detection

### 3. **syntax_checker.pl** ⭐ NEW
**Purpose:** DCG-based syntax validation with student-friendly error messages

**Exported Predicates:**
- `check_syntax/2` - Main syntax checking entry point
- `friendly_error_message/2` - Convert error terms to readable messages

**Key Features:**
- Line-by-line syntax validation using pattern matching
- Detects 8 common student syntax errors:
  - Missing periods (`.`)
  - Unmatched parentheses/brackets
  - Lowercase variables (should be uppercase)
  - Invalid operators (`:=`, `==`, `!=`, `&&`, `||`)
  - Double periods (`..`)
  - Spaces in atom names
  - Missing clause bodies after `:-`
- Student-friendly error messages with:
  - Exact line numbers
  - Clear explanations
  - Specific fix suggestions
  - Emoji visual markers (📍, ❌, 💡)

**Design Philosophy:**
Unlike SWI-Prolog's native parser which gives cryptic error messages, this DCG checker provides educational feedback tailored for beginners learning Prolog.

---

## Meta-Interpreter Module

### Architecture

The meta-interpreter uses **meta-circular interpretation** - it's a Prolog program that interprets Prolog code, allowing deep introspection.

### Core Components

#### 1. Built-in Predicate Registry

```prolog
builtin(_ is _).
builtin(_ =:= _).
builtin(_ < _).
% ... 20+ built-in predicates
```

**Purpose:** Distinguishes user-defined predicates from built-ins during tracing.

#### 2. Proof Tree Generation (`solve_with_trace/2`)

**Signature:** `solve_with_trace(+Goal, -ProofTree)`

**How it works:**
1. **Base case:** `true` → returns `true`
2. **Conjunction:** `(G1, G2)` → recursively traces both goals
3. **Built-in:** Recognized by `builtin/1` → executes and returns `builtin(Goal)`
4. **User predicate:** Finds clause, traces body → returns `proof(Goal, Body, SubTree)`

**Example Proof Tree:**
```prolog
% For: factorial(2, X)
proof(
  factorial(2, X),
  (N > 0, N1 is N-1, factorial(N1, F1), X is N*F1),
  (
    builtin(2 > 0),
    builtin(1 is 2-1),
    proof(factorial(1, F1), (1 =:= 0, 2 is 1), ...),
    builtin(X is 2*1)
  )
)
```

#### 3. Execution Trace with Failures (`trace_execution_with_failure/2`)

**Signature:** `trace_execution_with_failure(+Goal, -Trace)`

**What it captures:**
- `step(Depth, Goal)` - Successful step
- `failed(Depth, Goal)` - Failed attempt
- `depth_limit_exceeded` - Infinite recursion detected

**Algorithm:**
1. Accumulates trace as it descends through execution
2. Records each clause attempt with depth
3. Marks failures explicitly
4. Stops at depth 100 (infinite recursion guard)

**Example Trace:**
```prolog
[
  step(1, factorial(2, X)),
  step(2, (2 > 0)),
  step(3, factorial(1, F1)),
  step(4, (1 > 0)),
  step(5, factorial(0, F2)),
  failed(6, (0 > 0)),
  step(6, (0 =:= 0))
]
```

#### 4. Test Validation (`validate_with_tests/3`)

**Signature:** `validate_with_tests(+GoalTemplate, +TestCases, -Errors)`

**Test Case Format:**
```prolog
test(factorial(3, X), [factorial(3, 6)]).  % Should succeed with X=6
test(factorial(-1, _), []).                 % Should fail
```

**Validation Process:**
1. For each test, execute goal safely (1-second timeout, 200 depth limit)
2. Compare actual results with expected results (order-independent)
3. Collect failures as `test_failure(Goal, Expected, Actual)`

#### 5. Depth-Limited Solving (`solve_with_depth/2`)

**Signature:** `solve_with_depth(+Goal, +MaxDepth)`

**Purpose:** Detect infinite recursion by enforcing depth limit (default 100)

**Returns:**
- `true` if goal succeeds within depth
- `false` if exceeds depth or fails

#### 6. Error Detection (`detect_errors/2`)

**Basic error checks:**
- `missing_base_case` - No non-recursive clause found
- `infinite_recursion` - Depth limit exceeded

---

## Diagnosis Engine Module

### Architecture

The diagnosis engine uses an **evidence-based scoring system** to rank potential errors. Each error pattern has detection predicates that collect evidence, then evidence is weighted and scored.

### Core Components

#### 1. Evidence Weight System

```prolog
evidence_weight(non_terminating_execution, 1).
evidence_weight(recursive_call_without_progress, 1).
evidence_weight(no_matching_clause, 1).
% ... 12 evidence types
```

**Purpose:** Each piece of evidence contributes to the diagnostic confidence.

#### 2. Error Pattern Registry

```prolog
error_pattern(
    PatternName,
    DetectionPredicate,
    'Error message',
    'Suggestion'
).
```

**11 Registered Patterns:**
1. `missing_base_case` - No base case found
2. `infinite_recursion` - Non-terminating execution
3. `wrong_variable_binding` - Variable used before bound
4. `missing_clause` - No clause matches input
5. `non_decreasing_recursion` - Recursive call doesn't progress
6. `wrong_base_case` - Base case exists but incorrect
7. `argument_order_swapped` - Arguments in wrong order
8. `arity_mismatch` - Wrong number of arguments
9. `overly_general_base_case` - Base case too general
10. `cut_negation_misuse` - Improper use of `!` or `\+`
11. `operator_precedence_ambiguity` - Ambiguous operator order

#### 3. Evidence Collection

Each detection predicate follows this pattern:

```prolog
detect_PATTERN(Goal, Evidence) :-
    findall(E, evidence_for_PATTERN(Goal, E), EvidenceItems),
    EvidenceItems \= [],  % At least one evidence item
    Evidence = EvidenceItems.

evidence_for_PATTERN(Goal, EvidenceType) :-
    % Check condition that provides evidence
    ...
```

**Example - Missing Base Case:**

```prolog
detect_missing_base_case(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    findall(E, evidence_for_missing_base(GenericGoal, E), EvidenceItems),
    EvidenceItems \= [],
    Evidence = EvidenceItems.

evidence_for_missing_base(Goal, missing_base_case_fact) :-
    \+ (clause(Goal, Body), \+ contains_recursive_call(Goal, Body)).

evidence_for_missing_base(Goal, non_terminating_execution) :-
    \+ solve_with_depth(Goal, 100).
```

#### 4. Diagnosis Generation (`generate_diagnoses/2`)

**Signature:** `generate_diagnoses(+Goal, -RankedDiagnoses)`

**Algorithm:**
1. Try each error pattern detector
2. For patterns with evidence, calculate evidence score (sum of weights)
3. Create `diagnosis(Pattern, Score, Message, Suggestion, EvidenceList)`
4. Sort diagnoses by score (highest first)
5. Return ranked list

**Output Format:**
```prolog
[
  diagnosis(
    missing_base_case,
    2,  % Score: 2 pieces of evidence
    'No base case found - likely infinite recursion',
    'Add a base case that matches simple inputs (e.g., empty list, zero)',
    [missing_base_case_fact, non_terminating_execution]
  ),
  diagnosis(
    infinite_recursion,
    1,
    'Predicate does not terminate within reasonable depth',
    'Ensure recursive calls make progress toward base case',
    [non_terminating_execution]
  )
]
```

#### 5. Specialized Detectors

**Argument Swapping Detection:**
```prolog
detect_argument_order_swapped(Goal, Evidence) :-
    ground(Goal),
    Goal =.. [F, A1, A2 | Rest],
    Swapped =.. [F, A2, A1 | Rest],
    A1 \= A2,
    safe_call(Swapped),  % Swapped version succeeds!
    Evidence = [swapped_arguments].
```

**Arity Mismatch Detection:**
```prolog
detect_arity_mismatch(Goal, Evidence) :-
    functor(Goal, F, A),
    \+ clause(Goal, _),              % This arity doesn't exist
    current_predicate(F/OtherA),     % But another arity does
    OtherA \= A,
    Evidence = [arity_mismatch].
```

**Over-General Base Case:**
```prolog
detect_overly_general_base_case(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, true),       % Has fact
    term_variables(GenericGoal, Vars),
    length(Vars, A),                 % All arguments are variables!
    Evidence = [overly_general_base_case].
```

---

## Module Interconnection

### Dependency Flow

```
diagnosis_engine.pl
      │
      ├─ IMPORTS ─> builtin/1
      ├─ IMPORTS ─> solve_with_depth/2
      ├─ IMPORTS ─> contains_goal/2
      └─ IMPORTS ─> contains_recursive_call/2
                          │
                          ▼
                  meta_interpreter.pl
```

### How They Work Together

1. **Python calls meta_interpreter** for tracing and validation
2. **Python calls diagnosis_engine** for error diagnosis
3. **diagnosis_engine uses meta_interpreter utilities** for:
   - Checking if goals are built-in
   - Testing termination with depth limits
   - Analyzing clause bodies for recursive calls
   - Detecting goal patterns in bodies

### Shared Predicates Usage

| Predicate | Used By diagnosis_engine For |
|-----------|------------------------------|
| `builtin/1` | Identifying built-in predicates in evidence collection |
| `solve_with_depth/2` | Testing termination (infinite recursion detection) |
| `contains_goal/2` | Finding recursive calls in clause bodies |
| `contains_recursive_call/2` | Distinguishing base cases from recursive cases |

---

## Integration with Python

### PySwip Bridge

The Python layer uses **PySwip** to interact with SWI-Prolog:

```python
from pyswip import Prolog

prolog = Prolog()
prolog.consult("src/prolog/meta_interpreter.pl")
prolog.consult("src/prolog/diagnosis_engine.pl")
prolog.consult("student_code.pl")
```

### Key Python → Prolog Calls

#### 1. Execution Tracing

```python
# Query Prolog
query = f"trace_execution_with_failure({goal}, Trace)"
result = list(prolog.query(query, maxresult=1))

# Returns trace as Prolog term
trace = result[0]['Trace']
```

#### 2. Test Validation

```python
# Load test cases
prolog.assertz("test(factorial(0, X), [factorial(0, 1)])")

# Validate
goal_template = "factorial(_, _)"
query = f"validate_with_tests({goal_template}, Tests, Errors)"
result = list(prolog.query(query))
```

#### 3. Error Diagnosis

```python
query = f"generate_diagnoses({goal}, Diagnoses)"
result = list(prolog.query(query, maxresult=1))

# Returns ranked list of diagnoses with evidence
diagnoses = result[0]['Diagnoses']
```

### Data Flow

```
┌─────────────────────────────────────────┐
│  1. Python reads problem & student code │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  2. Python consults Prolog modules      │
│     - meta_interpreter.pl               │
│     - diagnosis_engine.pl               │
│     - student_code.pl                   │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  3. Python calls Prolog predicates      │
│     - trace_execution_with_failure/2    │
│     - validate_with_tests/3             │
│     - generate_diagnoses/2              │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  4. Prolog returns results              │
│     - Execution traces                  │
│     - Test failures                     │
│     - Ranked diagnoses with evidence    │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  5. Python formats and outputs          │
│     - Human-readable feedback           │
│     - Structured analysis               │
└─────────────────────────────────────────┘
```

---

## Execution Flow

### Complete Analysis Workflow

```
START
  │
  ├─ [1] Load student code into Prolog
  │      └─ prolog.consult("student_code.pl")
  │
  ├─ [2] Extract sample goal from problem/tests
  │      └─ e.g., factorial(3, X)
  │
  ├─ [3] TRACE EXECUTION
  │      ├─ Call: trace_execution_with_failure(factorial(3,X), Trace)
  │      ├─ Result: List of steps and failures
  │      └─ Store: Execution path with depth info
  │
  ├─ [4] VALIDATE TESTS (if test cases exist)
  │      ├─ Call: validate_with_tests(factorial(_,_), TestList, Errors)
  │      ├─ For each test: execute and compare results
  │      └─ Store: List of test_failure(...) terms
  │
  ├─ [5] DIAGNOSE ERRORS
  │      ├─ Call: generate_diagnoses(factorial(3,X), Diagnoses)
  │      ├─ For each error pattern:
  │      │   ├─ Collect evidence
  │      │   ├─ Calculate score
  │      │   └─ Create diagnosis
  │      ├─ Sort by evidence score
  │      └─ Store: Ranked diagnosis list
  │
  ├─ [6] FORMAT OUTPUT (Python)
  │      ├─ Format trace as readable string
  │      ├─ Display test results
  │      ├─ Show diagnoses with evidence
  │      └─ Optional: LLM natural language translation
  │
END (Write to output file)
```

### Example Execution

**Student Code (buggy):**
```prolog
factorial(N, 1).  % Overly general base case!
factorial(N, F) :-
    N > 0,
    N1 is N - 1,
    factorial(N1, F1),
    F is N * F1.
```

**Execution Flow:**

1. **Trace:**
   ```
   step(1, factorial(3, X))
   step(2, 3 > 0)
   step(3, factorial(2, F1))
   step(4, 2 > 0)
   step(5, factorial(1, F2))
   step(6, 1 > 0)
   step(7, factorial(0, F3))
   step(8, (0, 1))  ← Matched overly general base case!
   → Returns F3=1, then F2=1, F1=1, X=1 (WRONG!)
   ```

2. **Test Validation:**
   ```prolog
   test_failure(
     factorial(3, X),
     [factorial(3, 6)],
     [factorial(3, 1)]  % Wrong result!
   )
   ```

3. **Diagnoses:**
   ```prolog
   [
     diagnosis(
       overly_general_base_case,
       1,
       'Base case is too general and matches too many inputs',
       'Restrict the base case to the intended simplest input',
       [overly_general_base_case]
     )
   ]
   ```

---

## Key Algorithms

### 1. Meta-Circular Interpretation

**Purpose:** Execute student code while recording proof structure

**Algorithm:**
```prolog
solve_with_trace(Goal, Tree) :-
    if Goal = true then
        Tree = true
    else if Goal = (G1, G2) then
        Tree = (trace(G1), trace(G2))
    else if builtin(Goal) then
        execute Goal,
        Tree = builtin(Goal)
    else
        find clause(Goal, Body),
        trace Body → SubTree,
        Tree = proof(Goal, Body, SubTree)
```

**Why meta-circular?**
- It's Prolog code that interprets Prolog execution
- Allows deep introspection not possible with native execution
- Records complete proof derivation

### 2. Evidence-Based Scoring

**Purpose:** Rank diagnoses by strength of evidence

**Algorithm:**
```prolog
generate_diagnoses(Goal, Ranked) :-
    for each error_pattern(Pattern, Detector, Msg, Sugg):
        call Detector(Goal, Evidence),
        if Evidence is not empty:
            Score = sum of evidence_weight for each item in Evidence,
            create diagnosis(Pattern, Score, Msg, Sugg, Evidence)
    sort all diagnoses by Score descending,
    return Ranked
```

**Benefits:**
- No arbitrary confidence percentages
- Evidence is traceable and explainable
- Most likely errors appear first

### 3. Depth-Limited Solving

**Purpose:** Detect infinite recursion safely

**Algorithm:**
```prolog
solve_with_depth(Goal, MaxDepth) :-
    if MaxDepth ≤ 0 then
        fail (depth limit reached)
    else if Goal = true then
        succeed
    else if Goal = (G1, G2) then
        solve_with_depth(G1, MaxDepth),
        solve_with_depth(G2, MaxDepth - 1)
    else if builtin(Goal) then
        execute Goal
    else
        find clause(Goal, Body),
        solve_with_depth(Body, MaxDepth - 1)
```

**Depth limit = 100** balances:
- Catching infinite recursion quickly
- Allowing legitimate deep recursion

### 4. Recursive Call Progress Detection

**Purpose:** Check if recursive calls make progress toward base case

**Algorithm:**
```prolog
is_decreasing_call(OriginalGoal, RecursiveCall) :-
    extract first argument from OriginalGoal → OrigArg,
    extract first argument from RecursiveCall → RecArg,
    
    if OrigArg = [H|T] and RecArg = T then
        succeed  % List gets smaller
    else if OrigArg is number N and RecArg = N-1 then
        succeed  % Number decreases
    else if RecArg appears inside OrigArg then
        succeed  % Structural decomposition
    else
        fail  % No progress!
```

**Heuristics cover:**
- List recursion: `[H|T]` → `T`
- Number recursion: `N` → `N-1`
- Tree/structure recursion: variable from decomposition

---

## Error Detection Patterns

### Pattern Catalog

| Pattern | Evidence Collected | Key Detection Logic |
|---------|-------------------|---------------------|
| **missing_base_case** | missing_base_case_fact, non_terminating_execution | No clause with non-recursive body exists |
| **infinite_recursion** | non_terminating_execution, recursive_call_without_progress | Fails depth limit, recursive call doesn't decrease |
| **wrong_variable_binding** | unbound_variable_usage | Variable used in builtin before bound in head |
| **missing_clause** | no_matching_clause, unexpected_failure | No clause matches the goal's pattern |
| **non_decreasing_recursion** | recursive_call_without_progress, clause_never_succeeds | Recursive argument doesn't get smaller |
| **wrong_base_case** | wrong_base_case_fact | Base case exists but produces wrong result |
| **argument_order_swapped** | swapped_arguments | Swapping arguments makes goal succeed |
| **arity_mismatch** | arity_mismatch | Same functor exists with different arity |
| **overly_general_base_case** | overly_general_base_case | Base case clause has all variables |
| **cut_negation_misuse** | negation_with_unbound_var, unconditional_cut | Cut/negation used incorrectly |
| **operator_precedence_ambiguity** | ambiguous_operator_precedence | Mixed `,`, `;`, `->` without parentheses |

### Detection Examples

#### Example 1: Missing Base Case

**Buggy Code:**
```prolog
factorial(N, F) :-
    N > 0,
    N1 is N - 1,
    factorial(N1, F1),
    F is N * F1.
```

**Evidence Collected:**
- `missing_base_case_fact` - No clause with non-recursive body
- `non_terminating_execution` - Exceeds depth 100

**Diagnosis:**
```prolog
diagnosis(
    missing_base_case,
    2,
    'No base case found - likely infinite recursion',
    'Add a base case that matches simple inputs (e.g., empty list, zero)',
    [missing_base_case_fact, non_terminating_execution]
)
```

#### Example 2: Swapped Arguments

**Buggy Code:**
```prolog
append([], L, L).
append([H|T], L, [H|R]) :- append(L, T, R).  % L and T swapped!
```

**Detection Logic:**
```prolog
Goal = append([1,2], [3], X)
Swapped = append([3], [1,2], X)

% Original fails, but swapped succeeds!
\+ safe_call(append([1,2], [3], X)),
safe_call(append([3], [1,2], X))
```

**Evidence:** `[swapped_arguments]`

#### Example 3: Overly General Base Case

**Buggy Code:**
```prolog
factorial(N, 1).  % Matches ANY N!
factorial(N, F) :- ...
```

**Detection Logic:**
```prolog
clause(factorial(N, 1), true),  % Has fact
term_variables(factorial(N, 1), [N])  % All args are variables
```

**Evidence:** `[overly_general_base_case]`

---

## Best Practices

### For Maintainers

1. **Adding new error patterns:**
   ```prolog
   % 1. Add evidence weight
   evidence_weight(new_evidence_type, 1).
   
   % 2. Register pattern
   error_pattern(
       new_pattern,
       detect_new_pattern,
       'Error message',
       'Suggestion'
   ).
   
   % 3. Implement detector
   detect_new_pattern(Goal, Evidence) :-
       findall(E, evidence_for_new_pattern(Goal, E), Items),
       Items \= [],
       Evidence = Items.
   
   % 4. Define evidence collection
   evidence_for_new_pattern(Goal, new_evidence_type) :-
       % Detection logic here
       ...
   ```

2. **Testing changes:**
   - Add test case to `student_codes/`
   - Add expected output to `outputs/`
   - Run: `./run_all_examples.sh`

3. **Debugging Prolog code:**
   ```prolog
   % Use trace in SWI-Prolog
   ?- trace.
   ?- solve_with_trace(factorial(3, X), Tree).
   ```

### For Users

1. **Understanding output:**
   - Higher scored diagnoses are more likely
   - Evidence list shows why diagnosis was made
   - Multiple diagnoses possible (not mutually exclusive)

2. **Common pitfalls:**
   - Over-general base cases (`factorial(N, 1)`)
   - Missing base cases entirely
   - Arguments in wrong order
   - Wrong arity (`append/2` instead of `append/3`)

---

## Conclusion

The Prolog subsystem provides **deep introspection** of student code through:

1. **Meta-interpretation** - Execute code while recording proof structure
2. **Evidence-based diagnosis** - Rank errors by collected evidence
3. **Modular architecture** - Clear separation between execution and diagnosis
4. **Python integration** - Seamless bridging via PySwip

This architecture enables intelligent, explainable feedback that helps students understand and fix their Prolog code.

---

## NEW: DCG-Based Syntax Checker

### Overview

The new `syntax_checker.pl` module uses **Definite Clause Grammars (DCG)** and pattern matching to provide student-friendly syntax error detection.

### Why DCG Instead of Native Parser?

**Problem with SWI-Prolog's native parser:**
```
ERROR: syntax_error:2:16: Operator expected
```
Students don't understand what this means!

**Our DCG solution:**
```
📍 Line 2: ❌ Missing Period

  factorial(0, 1

  💡 Every Prolog clause must end with a period (.)
Add a period at the end of this line.
```

### Detected Syntax Errors

| Error Type | Detection Pattern | Student-Friendly Message |
|------------|------------------|-------------------------|
| `missing_period` | Clause without `.` | "Every Prolog clause must end with a period (.)" |
| `unmatched_parentheses` | `(` count ≠ `)` count | "Make sure every ( has a matching )" |
| `unmatched_brackets` | `[` count ≠ `]` count | "Make sure every [ has a matching ]" |
| `variable_lowercase` | Variable starts with lowercase | "Variables MUST start with uppercase: x → X" |
| `invalid_operator` | Uses `:=`, `==`, `!=`, `&&`, `\|\|` | "Common fixes: := → is, == → =, != → \\=" |
| `double_period` | Contains `..` | "Use only one period (.) at the end" |
| `space_in_atom` | Predicate name has space | "Remove space: fact orial → factorial" |
| `missing_clause_body` | `:-` without body | "Either remove :- or add goals after it" |

### Implementation

**Line-by-line checking:**
```prolog
check_lines(Lines, LineNum, Acc, Errors) :-
    for each line:
        skip comments and empty lines,
        detect errors using pattern matching,
        accumulate errors with line numbers
```

**Friendly message generation:**
```prolog
friendly_error_message(error(LineNum, ErrorType, Line), Message) :-
    error_explanation(ErrorType, Explanation, Suggestion),
    format readable message with emojis and clear guidance
```

### Integration with Python

```python
def check_syntax(self, log):
    # Load DCG syntax checker
    prolog.consult("syntax_checker.pl")
    
    # Check syntax
    results = prolog.query("check_syntax('student.pl', Errors)")
    
    # Format friendly messages
    for error in errors:
        message = get_friendly_message(error)
        log(message)
```

### Fallback Strategy

The system uses a **two-tier approach**:

1. **DCG Checker** - Catches common beginner mistakes with friendly messages
2. **SWI-Prolog Parser** - Catches anything DCG missed (fallback)

This ensures **zero false negatives** while providing educational feedback when possible.

### Example Output

**Test File (`syntax_invalid_operator.pl`):**
```prolog
factorial(0, 1).
factorial(N, F) :- N > 0, N1 := N-1, factorial(N1, F1), F is N*F1.
```

**DCG Checker Output:**
```
============================================================
❌ SYNTAX ERRORS FOUND
============================================================

Error #1:
📍 Line 3: ❌ Invalid Operator

  factorial(N, F) :- N > 0, N1 := N-1, ...

  💡 You are using an operator that doesn't exist in Prolog.
Common fixes:
  := → is (for arithmetic)
  == → = (for unification)
  != → \= (for inequality)
  && → , (for AND)
  || → ; (for OR)
```

### Benefits for Students

1. **Exact line numbers** - Know exactly where the problem is
2. **Clear explanations** - Understand what's wrong
3. **Actionable suggestions** - Know how to fix it
4. **Visual markers** - Emojis make errors easy to scan
5. **Educational** - Learn Prolog syntax rules

---

**Document Version:** 1.1  
**Last Updated:** February 10, 2026  
**Changes:** Added DCG-based syntax checker documentation  
**Maintained By:** Project Team

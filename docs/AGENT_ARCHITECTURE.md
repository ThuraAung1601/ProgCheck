# Agent Architecture and Meta-Logic

This document explains how the system implements an intelligent agent architecture using knowledge bases and meta-interpretation.

## Agent Type Classification

### This is a **Goal-Based, Model-Based Agent**

According to AI agent taxonomy, this system is:

#### 1. **Goal-Based Agent**
- Has explicit goals: "Find errors in student code", "Validate test cases", "Rank diagnoses"
- Reasons toward achieving those goals using logic
- Generates action sequences (proof trees) to reach goals

#### 2. **Model-Based Agent**
- Maintains internal model of "how the world works" (proof trees, evidence)
- Updates model based on observations (test outcomes, execution traces)
- Uses model to predict consequences of actions

### NOT:
- ❌ **Simple Reflex Agent**: Doesn't just map percepts to actions via rules
- ❌ **Utility-Based Agent**: Doesn't optimize across competing objectives with utility function
- ❌ **Learning Agent**: Doesn't improve performance from experience

---

## Intelligent Agent Definition

Yes, you're correct: **An intelligent agent = Knowledge Base + Meta-Interpreter**

This is a fundamental principle in logic-based AI. The system separates:

1. **What the agent knows** (Knowledge Base)
2. **How the agent reasons** (Meta-Interpreter)

This separation enables flexible, domain-independent reasoning.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    INTELLIGENT AGENT                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────┐      ┌──────────────────────┐   │
│  │  KNOWLEDGE BASE      │      │  META-INTERPRETER    │   │
│  │  (What it knows)     │      │  (How it reasons)    │   │
│  ├──────────────────────┤      ├──────────────────────┤   │
│  │                      │      │                      │   │
│  │ • Problem domain     │◄────►│ • Proof tree gen    │   │
│  │   facts              │      │ • Goal resolution   │   │
│  │ • Student code       │      │ • Error detection   │   │
│  │   clauses            │      │ • Evidence gather   │   │
│  │ • Test cases         │      │ • Diagnosis rank    │   │
│  │                      │      │                      │   │
│  └──────────────────────┘      └──────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Knowledge Base Component

### What It Contains

The knowledge base stores domain-specific information in Prolog fact/rule format:

```prolog
% Problem domain facts (from LLM translation)
parent(tom, bob).
parent(bob, ann).

% Student code (loaded dynamically)
grandparent(X, Z) :- 
    parent(X, Y), 
    parent(Y, Z).

% Test cases
test(grandparent(tom, ann), [ann]).
test(grandparent(bob, ann), []).
```

### Characteristics

- **Declarative**: States facts, not procedures
- **Domain-specific**: Changes per problem
- **Separable**: Can be swapped without changing reasoning
- **Inspectable**: Can be queried and analyzed

### In This System

| KB Component | File/Source | Purpose |
|--------------|-------------|---------|
| Problem facts | Extracted from `examples/*.txt` | Domain knowledge |
| Student code | Loaded from `student_codes/*.pl` | Program under test |
| Test cases | From problem file or `test_files/*.pl` | Validation goals |

---

## 2. Meta-Interpreter Component

### What It Does

The meta-interpreter reasons **about** programs, not just **with** them. It operates at a higher logical level (meta-level) to:

1. **Trace execution**: Generate proof trees
2. **Detect patterns**: Find structural errors
3. **Gather evidence**: Collect diagnostic indicators
4. **Rank diagnoses**: Order by evidence strength

### Implementation

File: [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl)

```prolog
% Meta-level reasoning: solve_with_trace/2
% Generates proof tree while solving goal
solve_with_trace(Goal, proof(Goal, Body, SubTree)) :-
    clause(Goal, Body),              % Object-level clause
    solve_with_trace(Body, SubTree). % Meta-level recursion
```

This is **meta-logic**: reasoning about the execution of object-level Prolog.

---

## 3. Meta-Logic vs Object-Logic

### Object-Level Logic

- **Student's program**: Operates on domain facts
- **Example**: `grandparent(X, Z) :- parent(X, Y), parent(Y, Z).`
- **Level**: Ground level reasoning

### Meta-Level Logic

- **Meta-interpreter**: Operates on student's program
- **Example**: `solve_with_trace(Goal, Tree)` examines how `Goal` is proven
- **Level**: Reasoning **about** reasoning

### Why This Matters

The meta-interpreter can:
- See **how** a proof is constructed (proof tree)
- Detect **when** something goes wrong (error patterns)
- Understand **why** it failed (evidence items)

This is impossible at the object level alone.

---

## 4. Goal-Based Agent Behavior

### Agent Goals

The system has explicit, well-defined goals:

| Goal | How Achieved | Success Criterion |
|------|--------------|-------------------|
| **G1: Diagnose errors** | Pattern matching on proof traces | At least one diagnosis generated |
| **G2: Validate code** | Execute test cases, compare results | All tests pass or failures identified |
| **G3: Rank diagnoses** | Sum evidence weights | Diagnoses ordered by score |
| **G4: Generate proof trees** | Meta-interpretation | Tree structure complete |

### Goal-Directed Reasoning

Unlike simple reflex agents that map percepts → actions, this agent:

1. **Perceives**: Loads student code and problem specification
2. **Models**: Builds internal proof tree representation
3. **Plans**: Determines which patterns to check
4. **Acts**: Executes diagnosis and generates report

This is goal-directed: the agent reasons about **how to achieve its goals**, not just react to inputs.

---

## 5. Model-Based Agent Behavior

### Internal Model

The agent maintains an internal model of:

```prolog
% Model of "how student code should behave"
expected_behavior(factorial(0, 1)).
expected_behavior(factorial(3, 6)).

% Model of "how student code actually behaves"
actual_behavior(Goal, ProofTree, Result).

% Model of "what errors look like"
error_pattern(missing_base_case, Evidence, Message).
```

### Model Updates

As the agent executes, it updates its model:

```
Initial State:
  - No knowledge of code behavior

After Execution:
  - Proof trees collected
  - Evidence items gathered
  - Diagnosis hypotheses formed

After Ranking:
  - Diagnoses ordered by evidence
  - Top diagnosis selected
```

This internal model enables the agent to predict: "If I run this test, what will happen?"

---

## 6. Why Not Other Agent Types?

### Not Simple Reflex

A simple reflex agent would be:
```
IF syntax_error THEN report_error
IF test_fails THEN report_failure
```

Our agent instead:
- Builds proof trees
- Accumulates evidence
- Ranks multiple hypotheses
- Reasons about program structure

### Not Utility-Based

A utility-based agent would optimize across competing objectives with a utility function:
```
Maximize: accuracy * speed - complexity
```

Our agent has a single primary goal (diagnose errors) without competing trade-offs.

### Not Learning

A learning agent would improve from experience:
```
After diagnosing 1000 programs, adjust pattern weights
```

Our agent uses fixed heuristic weights, not learned parameters.

---

## 7. Agent Lifecycle

```
1. PERCEIVE (Load KB)
   ↓
   Problem text → LLM → Prolog facts → Knowledge Base
   Student code → Prolog clauses → Knowledge Base
   
2. REASON (Apply Meta-Interpreter)
   ↓
   solve_with_trace(Goal, ProofTree)
   ↓
   validate_with_tests(Goal, Tests, Results)
   ↓
   generate_diagnoses(Goal, Diagnoses)
   
3. ACT (Output Report)
   ↓
   Ranked diagnoses + Evidence + Suggestions → User
```

### Autonomy

The agent operates autonomously once the KB is loaded:
- No further human intervention needed
- Reasoning is deterministic and explainable
- Diagnosis is based on internal logic, not learned patterns

---

## 5. Evidence-Based Diagnosis as Meta-Reasoning

### How It Works

The diagnosis engine (another meta-level component) reasons about the meta-interpreter's output:

```prolog
% Meta-meta-level: Diagnose based on proof trace
detect_missing_base_case(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    
    % Check KB structure
    \+ (clause(GenericGoal, Body), 
        \+ contains_recursive_call(GenericGoal, Body)),
    
    % Check execution behavior
    \+ solve_with_depth(Goal, 100),
    
    % Gather evidence
    Evidence = [missing_base_case_fact, non_terminating_execution].
```

This is **meta-meta-logic**: reasoning about the structure and behavior of object-level programs.

---

## 6. Why This Architecture?

### Traditional Approach (No Agent)

```
Input Code → Compiler/Interpreter → Output
              ↑
              Error or Success (binary)
```

- Limited error feedback
- No explanation of **why** it failed
- No ranking of likely causes

### Agent Approach (KB + Meta-Interpreter)

```
Input Code → Knowledge Base ←→ Meta-Interpreter → Diagnosis
                                    ↑
                                Evidence-based reasoning
```

- Rich error feedback (proof trees, evidence)
- Explains **why** and **how** it failed
- Ranks diagnoses by evidence strength

---

## 7. Connection to AI Concepts

### Symbolic AI

This system is **symbolic AI**:
- Knowledge represented in logic
- Reasoning via deduction
- Explainable by design

### Expert Systems

The diagnosis component is an **expert system**:
- Rule-based pattern matching
- Evidence accumulation
- Ranked recommendations

### Automated Debugging

The meta-interpreter implements **algorithmic debugging**:
- Inspects proof trees
- Identifies discrepancies
- Suggests fixes

---

## 8. Advantages of This Architecture

### 1. Separation of Concerns

| Component | Responsibility | Can Change Independently |
|-----------|----------------|-------------------------|
| KB | Domain knowledge | Yes (new problems) |
| Meta-Interpreter | Reasoning strategy | Yes (new algorithms) |
| Diagnosis Engine | Error patterns | Yes (new patterns) |

### 2. Transparency

Every step is traceable:
- Proof trees show exact derivation
- Evidence items show detection rationale
- Diagnosis scores show ranking logic

### 3. Extensibility

Add new capabilities without rewriting core:
- New error patterns → Add to diagnosis engine
- New test strategies → Add to meta-interpreter
- New domains → Swap knowledge base

### 4. Verifiability

Behavior is deterministic and explainable:
- Same inputs → Same outputs
- No hidden learned weights
- No probabilistic guessing

---

## 9. Meta-Logic Levels in This System

### Level 0: Domain Facts

```prolog
parent(tom, bob).  % Ground truth
```

### Level 1: Object Program (Student Code)

```prolog
grandparent(X, Z) :- parent(X, Y), parent(Y, Z).
```

### Level 2: Meta-Interpreter

```prolog
solve_with_trace(Goal, proof(Goal, Body, SubTree)) :-
    clause(Goal, Body),
    solve_with_trace(Body, SubTree).
```

### Level 3: Diagnosis Engine

```prolog
detect_missing_base_case(Goal, Evidence) :-
    \+ (clause(Goal, Body), \+ contains_recursive_call(Goal, Body)),
    Evidence = [missing_base_case_fact].
```

Each level reasons **about** the level below it.

---

## 10. Implementation Files

| Component | File | Description |
|-----------|------|-------------|
| **Meta-Interpreter** | [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl) | Proof tree generation, test validation |
| **Diagnosis Engine** | [src/prolog/diagnosis_engine.pl](../src/prolog/diagnosis_engine.pl) | Error pattern detection, evidence ranking |
| **KB Loader** | [check_prolog.py](../check_prolog.py) | Loads facts and student code into Prolog |
| **LLM Bridge** | [src/llm_bridge.py](../src/llm_bridge.py) | Translates text to KB facts |

---

## 11. Comparison with Other Architectures

### vs. Static Analysis Tools

- **Static**: Parse code, check syntax/types
- **This system**: Execute code, trace behavior, diagnose errors

### vs. Machine Learning Debuggers

- **ML**: Learn from examples, predict errors (black box)
- **This system**: Reason from first principles (explainable)

### vs. Traditional Debuggers

- **Traditional**: Step through execution, show state
- **This system**: Generate full proof tree, diagnose patterns

---

## 12. Research Foundation

This architecture is inspired by:

### PRAGMATIST Framework
- Algorithmic debugging with abductive reasoning
- Meta-interpretation for error localization
- Evidence-based hypothesis ranking

### Logic-Based AI
- Knowledge representation in logic
- Separation of knowledge and inference
- Declarative programming paradigms

### Expert Systems
- Rule-based pattern matching
- Evidence accumulation
- Explainable decision-making

---

## Summary

**Yes, this is an intelligent agent architecture:**

1. **Knowledge Base**: Problem facts, student code, test cases
2. **Meta-Interpreter**: Reasoning engine that operates on KB
3. **Meta-Logic**: Reasoning **about** program execution
4. **Evidence-Based**: Diagnosis ranked by observable evidence
5. **Explainable**: Every step is traceable and transparent

The separation of KB and meta-interpreter enables:
- Domain independence
- Flexible reasoning
- Explainable diagnostics
- Extensible architecture

This is **symbolic AI in action**: using logic and meta-reasoning to debug Prolog programs intelligently.

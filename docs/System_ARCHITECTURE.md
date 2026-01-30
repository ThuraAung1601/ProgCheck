# System Architecture

This project separates Prolog reasoning from natural-language translation. The Python layer orchestrates the flow but does not perform logic reasoning.

## Components

- Prolog reasoning layer: [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl)
- Evidence-based diagnosis: [src/prolog/diagnosis_engine.pl](../src/prolog/diagnosis_engine.pl)
- LLM translation bridge: [src/llm_bridge.py](../src/llm_bridge.py)
- Orchestrator and CLI: [check_prolog.py](../check_prolog.py)

## Flow

1. Problem text is translated into Prolog facts and tests.
2. The student code and knowledge base are loaded into SWI-Prolog.
3. The meta-interpreter produces proof trees and test outcomes.
4. The diagnosis engine gathers evidence and ranks error patterns.
5. The LLM translates proof trees and results into readable output.

## Design Rules

- The LLM never performs logical reasoning.
- The Prolog layer owns all reasoning and error detection.
- Diagnostics are ranked by evidence scores, not probabilities.

## Extension Points

- Add new reasoning predicates in [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl).
- Add new diagnosis patterns in [src/prolog/diagnosis_engine.pl](../src/prolog/diagnosis_engine.pl).
- Add or swap LLM providers in [src/llm_bridge.py](../src/llm_bridge.py).

# Prolog Debugging System with LLM Integration

Pattern-based Prolog debugging system for student programs. It separates logical reasoning (Prolog) from language translation (LLM) and ranks diagnoses by weighted evidence.

## Quick Start

See in the docs/HOW_TO_USE.md

```bash
pip install -r requirements.txt
# macOS: brew install swi-prolog
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_correct.pl --output outputs/factorial_correct.txt
```

## How It Works (High Level)

1. Problem text is translated into Prolog facts and tests.
2. The meta-interpreter generates proof trees and validates tests.
3. The diagnosis engine aggregates evidence into ranked error patterns.

See the architecture overview in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## LLM Providers

The default provider is Groq. A small Hugging Face model can be used as an alternative provider (local or Inference API), while keeping Groq as the default.

### LLM Transparency

When the LLM is used, **all input and output is logged in the output files** for transparency:

- **📤 LLM INPUT**: Shows exactly what problem text, student code, and analysis results are sent to the LLM
- **📥 LLM OUTPUT**: Shows the complete response from the LLM (test cases or natural language feedback)
- **Character counts**: Helps you understand the size of data being sent

This transparency allows students and instructors to:
- Understand what data is shared with the LLM
- Debug issues with test generation or feedback translation
- See how the system works end-to-end
- Build trust in the automated feedback process

**See a complete example:** [outputs/LLM_TRANSPARENCY_DEMO.txt](outputs/LLM_TRANSPARENCY_DEMO.txt)

Example snippet from output file:
```
📤 LLM INPUT (Test Case Generation):

Problem Text (234 chars):
----------------------------------------
[Your problem description here]
----------------------------------------

Student Code (187 chars):
[Student's Prolog code here]
----------------------------------------

⏳ Calling LLM API...

📥 LLM OUTPUT (Generated Test Cases):
test(factorial(0, 1), [factorial(0, 1)]).
test(factorial(1, 1), [factorial(1, 1)]).
...
```

## Project Structure

```
├── check_prolog.py
├── src/
│   ├── prolog/
│   │   ├── meta_interpreter.pl
│   │   └── diagnosis_engine.pl
│   └── llm_bridge.py
├── examples/
├── student_codes/
├── outputs/
├── docs/
│   ├── ARCHITECTURE.md
│   └── PROLOG_LINE_BY_LINE.md
└── requirements.txt
```

## Documentation

- **How to use**: [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md)
- **System overview**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Prolog architecture**: [docs/PROLOG_ARCHITECTURE.md](docs/PROLOG_ARCHITECTURE.md)
- **Syntax checker details**: [docs/SYNTAX_CHECKER.md](docs/SYNTAX_CHECKER.md)
- **LLM transparency feature**: [docs/LLM_TRANSPARENCY.md](docs/LLM_TRANSPARENCY.md)

## Dependencies

```
groq>=0.4.0
pyswip>=0.2.11
python-dotenv>=1.0.0
```

## Environment Variables

```
GROQ_API_KEY=your_key_here
```

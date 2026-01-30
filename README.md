# ProgCheck: Neuro-Symbolic Prolog Lab Assistant
## Phase-1 Bug Identification and Explanation

Pattern-based Prolog bug identification and explanation system for student programs.
It separates logical reasoning (Prolog) from language translation (LLM) and ranks diagnoses by weighted evidence.

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

- System overview: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Line-by-line explanation of Prolog modules: [docs/PROLOG_LINE_BY_LINE.md](docs/PROLOG_LINE_BY_LINE.md)

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

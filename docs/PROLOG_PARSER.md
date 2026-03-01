# Prolog Grammar-Based Parser

## Overview

The **prolog_parser.pl** module provides **grammar-based syntax checking** for Prolog student submissions using **Definite Clause Grammars (DCG)** instead of regex patterns. This approach is more accurate, maintainable, and provides better error messages.

## Architecture

### Components

1. **BNF Grammar** (`prolog_grammar.bnf`)
   - Formal grammar specification in Backus-Naur Form
   - Documents Prolog syntax rules
   - Defines error patterns to detect
   - Serves as reference documentation

2. **DCG Parser** (`prolog_parser.pl`)
   - Implements BNF grammar using DCG notation
   - Tokenizes Prolog source code
   - Builds Abstract Syntax Tree (AST)
   - Detects syntax errors with precise locations
   - Generates student-friendly error messages

### Advantages Over Regex

✅ **Proper nesting** - Handles nested structures like `factorial(fact(N))` correctly  
✅ **Context-aware** - Distinguishes between atoms, variables, and operators  
✅ **AST generation** - Creates structured parse tree for analysis  
✅ **Better errors** - Pinpoints exact location and type of error  
✅ **Extensible** - Easy to add new grammar rules  
✅ **Testable** - Can unit test each grammar rule independently  

## Grammar Structure

### Top-Level

```prolog
program([]) --> [].
program([Clause|Clauses]) --> clause(Clause), program(Clauses).
```

### Clauses

```prolog
clause(fact(Term)) --> term(Term), [period].
clause(rule(Head, Body)) --> term(Head), [neck], body(Body), [period].
clause(query(Body)) --> [query_start], body(Body), [period].
```

### Terms

```prolog
term(var(V)) --> [var(V)].
term(number(N)) --> [number(N)].
term(atom(A)) --> [atom(A)].
term(compound(Functor, Args)) --> compound_term(Functor, Args).
term(List) --> list(List).
```

## Error Detection

### Detected Errors

1. **Invalid Operators**
   - `:=` → should be `is`
   - `!=` → should be `\=`
   - `&&` → should be `,`
   - `||` → should be `;`

2. **Lowercase Variables**
   - `n` → should be `N`
   - `result` → should be `Result`
   - Detects likely variable names used as atoms

3. **Structural Errors**
   - Missing period at end of clause
   - Unmatched parentheses `(` `)`
   - Unmatched brackets `[` `]`
   - Missing clause body after `:-`
   - Trailing comma before period

4. **Parse Failures**
   - Unexpected tokens
   - Invalid term structure
   - Malformed lists or compounds

## Usage

### From Python (check_prolog.py)

```python
prolog = Prolog()
prolog.consult("src/prolog/prolog_parser.pl")

# Parse a file
result = list(prolog.query(f"parse_prolog_file('{filepath}', Result)"))
if 'errors(' in str(result):
    # Handle errors
    messages = list(prolog.query("format_parse_errors(..., Messages)"))
```

### From Prolog

```prolog
?- parse_prolog_file('student_code.pl', Result).
Result = ok([fact(factorial(0, 1)), rule(factorial(N, R), ...)]).

?- parse_prolog_string("factorial(n, R) :- R is 1.", Result).
Result = errors([error(lowercase_variable(n))]).

?- parse_prolog_string("X := 5.", Result).
Result = errors([error(invalid_operator(':='))]).
```

## Error Messages

### Student-Friendly Output

```
Error #1:
Invalid operator: :=
  Hint: Use "is" for arithmetic assignment (X is 5)

Error #2:
Variable 'n' starts with lowercase
  Hint: Variables must start with uppercase or underscore. Try: N

Error #3:
Missing period at end of clause
  Hint: Every Prolog fact or rule must end with a period (.)
```

## Token Stream

The parser first converts source code into tokens:

```prolog
factorial(0, 1).
→ [atom(factorial), lparen, number(0), comma, number(1), rparen, period]

factorial(N, R) :- N > 0.
→ [atom(factorial), lparen, var('N'), comma, var('R'), rparen, 
   neck, var('N'), op(>), number(0), period]
```

## AST Structure

Successful parse produces an Abstract Syntax Tree:

```prolog
ok([
    fact(compound(factorial, [number(0), number(1)])),
    rule(
        compound(factorial, [var('N'), var('R')]),
        conjunction(
            infix(>, var('N'), number(0)),
            compound(factorial, [var('N1'), var('R1')])
        )
    )
])
```

## Integration Points

1. **check_prolog.py** - Main orchestrator calls parser for syntax validation
2. **Meta-interpreter** - Can use AST for semantic analysis (future)
3. **Diagnosis engine** - Can analyze parse tree structure (future)

## Future Enhancements

- [ ] Line number tracking in AST nodes
- [ ] More sophisticated error recovery
- [ ] Operator precedence parsing
- [ ] DCG extensions for common Prolog dialects
- [ ] Semantic validation (undefined predicates, arity mismatches)
- [ ] Integration with meta-interpreter for full analysis

## Files

- `src/prolog/prolog_grammar.bnf` - Formal BNF grammar specification
- `src/prolog/prolog_parser.pl` - DCG implementation
- `check_prolog.py` - Python integration

## References

- SWI-Prolog DCG documentation
- ISO Prolog syntax specification
- Student error patterns from project testing

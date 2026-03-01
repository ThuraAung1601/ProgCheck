# LLM Transparency Feature - Implementation Summary

## What Was Added

The system now logs **all LLM interactions** in output files for complete transparency. Students and instructors can see exactly what data is sent to the LLM and what responses are received.

## Key Features

### 1. Test Case Generation Logging
When the LLM generates test cases (because they can't be extracted from the problem text):

```
📤 LLM INPUT (Test Case Generation):

Problem Text (412 chars):
----------------------------------------
[Complete problem description shown here]
----------------------------------------

Student Code (187 chars):
----------------------------------------
[Student's complete Prolog code shown here]
----------------------------------------

⏳ Calling LLM API (Groq Llama 3.3-70b)...

📥 LLM OUTPUT (Generated Test Cases):
----------------------------------------
test(factorial(0, 1), [factorial(0, 1)]).
test(factorial(5, 120), [factorial(5, 120)]).
...
----------------------------------------
```

### 2. Feedback Translation Logging
When the LLM translates technical analysis into student-friendly feedback:

```
📤 LLM INPUT (Feedback Translation):

Analysis Results (2841 chars):
----------------------------------------
[Complete diagnostic data from Prolog engine]
Pattern: MISSING_HELPER_PREDICATE
Evidence: undefined_predicate(append/3)
...
----------------------------------------

⏳ Calling LLM API for natural language feedback...

📥 LLM OUTPUT (Student-Friendly Feedback):
----------------------------------------
## 🔍 Analysis Results

Your base case is correct! However...
[Complete natural language feedback]
----------------------------------------
```

### 3. Test Case Display
Even when tests are extracted from the problem (no LLM needed), the system shows which tests are being used:

```
📋 Test Cases Being Used:
----------------------------------------
  1. test(factorial(0, 1), [factorial(0, 1)]).
  2. test(factorial(1, 1), [factorial(1, 1)]).
  3. test(factorial(5, 120), [factorial(5, 120)]).
----------------------------------------
```

## Benefits

### For Students
- **Understand the process**: See how their code is being analyzed
- **Privacy awareness**: Know exactly what data is sent to external services
- **Learn from examples**: See how natural language is translated to Prolog tests
- **Debug issues**: If feedback seems wrong, can trace back to what the LLM received

### For Instructors
- **Transparency**: Verify the system is working correctly
- **Trust**: See the complete workflow from input to output
- **Debugging**: Quickly identify if issues are in the LLM or the Prolog analysis
- **Quality control**: Review what students are exposed to

### For Developers
- **Debugging**: Trace complete data flow through the system
- **Optimization**: See token counts and optimize prompts
- **Testing**: Verify LLM integration is working correctly

## Implementation Details

### Modified Files
1. **check_prolog.py**
   - Enhanced `prepare_tests()` with LLM input/output logging
   - Enhanced `gen_feedback()` with LLM interaction logging
   - Added `run_analysis()` test case display formatting

2. **README.md**
   - Added "LLM Transparency" section with examples
   - Links to demo file

3. **docs/HOW_TO_USE.md**
   - Added detailed explanation of transparency features
   - Provided example output snippets

4. **outputs/LLM_TRANSPARENCY_DEMO.txt**
   - Complete example showing all transparency features
   - Reference for users to understand the format

### Code Patterns

**Visual Separators:**
- `=====` for major sections
- `-----` for subsections
- `📤` for inputs to LLM
- `📥` for outputs from LLM
- `⏳` for processing indicators
- `📋` for test case listings

**Character Counts:**
- Shows size of data being sent (e.g., "Problem Text (412 chars)")
- Helps users understand token usage
- Useful for debugging and optimization

## When LLM Logging Appears

The LLM sections **only appear when the API is actually called**:

### Test Generation
- ✅ Appears: When problem text doesn't contain explicit test patterns
- ❌ Doesn't appear: When tests can be extracted from problem text
- ❌ Doesn't appear: When tests are provided via `--test_cases` file

### Feedback Translation
- ✅ Appears: When GROQ_API_KEY environment variable is set
- ✅ Appears: When `--use-llm` flag is used
- ❌ Doesn't appear: When running without API key (raw analysis shown)

## Example Use Cases

### Case 1: Complete LLM Workflow
```bash
export GROQ_API_KEY="your-key-here"
python check_prolog.py \
    --problem examples/simple_reverse_problem.txt \
    --student_code student_codes/reverse_missing_append.pl \
    --output outputs/reverse_demo.txt
```
Result: Shows both test generation AND feedback translation LLM logs

### Case 2: Extracted Tests Only
```bash
python check_prolog.py \
    --problem examples/factorial_problem.txt \
    --student_code student_codes/factorial_no_base.pl \
    --output outputs/factorial_demo.txt
```
Result: Shows "Extracted from problem" message, no LLM test generation log

### Case 3: No LLM at All
```bash
python check_prolog.py \
    --problem examples/factorial_problem.txt \
    --student_code student_codes/factorial_correct.pl \
    --test_cases test_files/factorial_test.pl \
    --output outputs/factorial_demo.txt
```
Result: No LLM sections (tests provided, no API key for feedback)

## Testing the Feature

To verify the transparency logging works:

1. **Test with extracted tests** (no LLM for test generation):
   ```bash
   python check_prolog.py --problem examples/factorial_problem.txt \
       --student_code student_codes/factorial_no_base.pl \
       --output outputs/test1.txt
   ```
   Expected: No "📤 LLM INPUT (Test Case Generation)" section

2. **Test with LLM test generation** (requires API key):
   ```bash
   export GROQ_API_KEY="your-key"
   python check_prolog.py --problem examples/simple_reverse_problem.txt \
       --student_code student_codes/reverse_missing_append.pl \
       --output outputs/test2.txt
   ```
   Expected: Both LLM INPUT and OUTPUT sections for test generation

3. **Review the demo file**:
   ```bash
   cat outputs/LLM_TRANSPARENCY_DEMO.txt
   ```
   Expected: Complete example showing all transparency features

## Privacy & Security Notes

### What's Logged
- ✅ Complete problem text
- ✅ Complete student code
- ✅ Complete analysis results
- ✅ Complete LLM responses

### What's NOT Logged
- ❌ API keys (never logged)
- ❌ Network requests/responses (only the text content)
- ❌ Timestamps or user identifiers

### Best Practices
1. **Review output files** before sharing them (they contain complete student code)
2. **Inform students** that their code may be sent to external LLM services
3. **Use local LLMs** if privacy is a major concern (future feature)
4. **Don't commit API keys** to version control


## Conclusion

The LLM transparency feature makes the system more trustworthy and debuggable by showing exactly what happens at each step. Users can now:
- See what data is sent to external services
- Understand how test cases are generated
- Trace how feedback is created
- Debug issues in the LLM integration
- Learn from the system's workflow

This aligns with best practices for AI systems in education: transparency, explainability, and user control.

# ProgCheck Test Suite

Academic-level test suite covering unit, integration, and acceptance testing for all functional and non-functional requirements.

## Structure

```
tests/
├── pytest/                      # Python unit & integration tests
│   ├── conftest.py              # Shared fixtures (in-memory FakeDB)
│   ├── test_models.py           # ZODB data model unit tests
│   ├── test_auth_routes.py      # Authentication API integration tests
│   ├── test_lab_routes.py       # Lab / submission API integration tests
│   └── test_prolog_checker.py   # PrologChecker unit + integration tests
├── robot/                       # Robot Framework acceptance tests
│   ├── resources/common.resource
│   ├── auth.robot               # Registration / login / security
│   ├── lab_management.robot     # Classroom, lab, question, submission
│   └── prolog_submission.robot  # Prolog pipeline end-to-end
├── prolog/                      # SWI-Prolog plunit tests
│   ├── test_meta_interpreter.pl # meta_interpreter.pl unit tests
│   └── test_diagnosis_engine.pl # diagnosis_engine.pl unit tests
├── pytest.ini
└── requirements-test.txt
```

Frontend Jest tests live inside the React source tree:
```
webui/frontend/src/__tests__/
├── utils/prologParser.test.js   # prologParser utility unit tests
├── pages/LoginPage.test.js      # Login page component + RTL tests
└── api.test.js                  # API integration contract tests
```

## Running the tests

### 1. Python (pytest)
```bash
pip install -r tests/requirements-test.txt
pytest tests/pytest/ -v
```

Skip tests needing SWI-Prolog when it is not installed (auto-skipped via marker).

### 2. Jest (frontend)
```bash
cd webui/frontend
npm test -- --watchAll=false
```

### 3. Robot Framework (requires running server on port 8000)
```bash
# Terminal 1 — start server
python start_server.py

# Terminal 2 — run acceptance tests
robot --outputdir tests/robot/results tests/robot/
```

### 4. Prolog (SWI-Prolog plunit)
```bash
swipl -g "run_tests, halt" tests/prolog/test_meta_interpreter.pl
swipl -g "run_tests, halt" tests/prolog/test_diagnosis_engine.pl
```

## Requirement traceability

| Requirement | Test files |
|---|---|
| UFR-1 (register/login) | test_auth_routes.py, auth.robot |
| UFR-2 (logout) | auth.robot TC-AUTH-010 |
| UFR-3 (view labs) | test_lab_routes.py, lab_management.robot |
| UFR-4 (problem statement) | test_lab_routes.py, prologParser.test.js |
| UFR-5 (submit code) | test_lab_routes.py, prolog_submission.robot |
| UFR-6 (edit/resubmit) | test_lab_routes.py TestSubmissions |
| UFR-7 (pass/fail results) | test_prolog_checker.py, prolog_submission.robot |
| UFR-8 (syntax errors) | test_prolog_checker.py, prolog_submission.robot TC-PRL-002/003 |
| UFR-9 (proof trees/traces) | test_prolog_checker.py, prolog_submission.robot TC-PRL-005 |
| UFR-10 (ranked diagnosis) | test_prolog_checker.py, api.test.js, test_diagnosis_engine.pl |
| UFR-11 (submission history) | test_lab_routes.py, api.test.js |
| UFR-12 (instructor classroom) | lab_management.robot TC-LAB-001 |
| UFR-13 (instructor lab questions) | lab_management.robot TC-LAB-006 |
| UFR-14 (view student results) | lab_management.robot TC-LAB-012, api.test.js |
| SFR-1 (account management) | test_auth_routes.py |
| SFR-2 (role-based access) | test_auth_routes.py, auth.robot |
| SFR-3 (classroom management) | test_lab_routes.py, lab_management.robot |
| SFR-4 (lab question assignment) | test_lab_routes.py TestLabQuestions |
| SFR-5 (persistence) | test_lab_routes.py, test_models.py |
| SFR-6 (syntax parsing) | test_prolog_checker.py TestSyntaxCheck |
| SFR-7 (consult modules) | test_prolog_checker.py, test_meta_interpreter.pl |
| SFR-8 (extract test cases) | test_prolog_checker.py TestExtractTests |
| SFR-10 (evaluate tests) | test_prolog_checker.py, test_diagnosis_engine.pl |
| SFR-11 (proof trees) | test_meta_interpreter.pl, prolog_submission.robot |
| SFR-12 (rank diagnoses) | test_diagnosis_engine.pl, api.test.js |
| SFR-13 (depth/time limits) | test_prolog_checker.py, test_diagnosis_engine.pl |
| SNFR-1 (5-second budget) | auth.robot, lab_management.robot, prolog_submission.robot |
| SNFR-3 (determinism) | test_prolog_checker.py, test_meta_interpreter.pl |
| SNFR-4 (no infinite loops) | test_prolog_checker.py, prolog_submission.robot TC-PRL-014 |
| SNFR-8 (no credential leakage) | test_prolog_checker.py TestLLMDegradation, prolog_submission.robot TC-PRL-013 |
| SNFR-10 (LLM degradation) | test_prolog_checker.py TestLLMDegradation, api.test.js |
| SNFR-11 (no password in plaintext) | test_auth_routes.py, test_models.py, auth.robot TC-AUTH-006 |

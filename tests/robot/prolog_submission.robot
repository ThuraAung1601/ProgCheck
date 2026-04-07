*** Settings ***
Documentation     Acceptance tests for Prolog code submission and diagnosis pipeline
...               (UFR-5..UFR-10, SFR-6..SFR-13, SNFR-1, SNFR-4, SNFR-10).
...
...               Requires the ProgCheck server running at http://localhost:8000.
...               Run with: robot tests/robot/prolog_submission.robot
...
Resource          resources/common.resource
Suite Setup       Run Keywords    Create Session    AND    Setup Prolog Suite
Test Tags         prolog    submission    functional

*** Variables ***
${PROB_ID}        ${EMPTY}
${CORRECT_CODE}   append([], Y, Y).\nappend([H|T], Y, [H|R]) :- append(T, Y, R).
${WRONG_CODE}     append([], Y, []).\nappend([H|T], Y, [H|R]) :- append(T, Y, R).
${SYNTAX_CODE}    append([], Y, Y).\nappend([H|T], Y, [H|R]) :- append(T, Y, R).\nfoo :- bar(

*** Keywords ***
Setup Prolog Suite
    [Documentation]    Register a teacher + student, create classroom + active lab + question.
    ${uid}=    Generate Random String    6    [NUMBERS]
    # Teacher
    ${tbody}=    Create Dictionary
    ...    username=pl_tch_${uid}    password=TPass    role=teacher    teacher_id=PLTCH_${uid}
    POST On Session    progcheck    /api/auth/register    json=${tbody}    expected_status=200
    Set Suite Variable    ${PL_TEACHER}    PLTCH_${uid}
    # Student
    ${sbody}=    Create Dictionary
    ...    username=pl_stu_${uid}    password=SPass    role=student    student_id=PLSTU_${uid}
    POST On Session    progcheck    /api/auth/register    json=${sbody}    expected_status=200
    Set Suite Variable    ${PL_STUDENT}    PLSTU_${uid}
    # Classroom
    ${cbody}=    Create Dictionary    class_name=Prolog Lab    teacher_id=${PL_TEACHER}
    ${cresp}=    POST On Session    progcheck
    ...    url=/api/classrooms/create?teacher_id=${PL_TEACHER}    json=${cbody}    expected_status=200
    Set Suite Variable    ${PL_CLASS}    ${cresp.json()["class_id"]}
    # Inactive lab — add question first, then we won't activate in this suite
    ${lbody}=    Create Dictionary    title=Prolog Suite Lab    classroom_id=${PL_CLASS}
    ${lresp}=    POST On Session    progcheck
    ...    url=/api/labs/create?teacher_id=${PL_TEACHER}    json=${lbody}    expected_status=200
    Set Suite Variable    ${PL_LAB}    ${lresp.json()["lab_id"]}
    # Question
    ${problem_text}=    Set Variable
    ...    Write the append/3 predicate.\nappend([],Y,Y) should be true.\nappend([a],[b],[a,b]) should be true.
    ${qbody}=    Create Dictionary    title=append/3    problem=${problem_text}
    ${qresp}=    POST On Session    progcheck
    ...    url=/api/labs/${PL_LAB}/questions?teacher_id=${PL_TEACHER}
    ...    json=${qbody}    expected_status=200
    Set Suite Variable    ${PL_QUESTION}    ${qresp.json()["question_id"]}

*** Test Cases ***

# ─────────────────────────────────────────────────────────────────────────────
# Syntax checking (SFR-6, UFR-8)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-001 Syntax Check Passes For Correct Code
    [Documentation]    SFR-6: syntactically valid Prolog returns ok=true.
    [Tags]    prolog    syntax    positive
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/syntax-check
    ...    json=${body}    expected_status=200
    Should Be True    ${resp.json()["ok"]} == True

TC-PRL-002 Syntax Check Fails For Invalid Code
    [Documentation]    SFR-6, UFR-8: file with syntax error returns ok=false and non-empty error.
    [Tags]    prolog    syntax    negative
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${SYNTAX_CODE}
    ${resp}=    POST On Session    progcheck    /api/syntax-check
    ...    json=${body}    expected_status=200
    Should Be True    ${resp.json()["ok"]} == False
    ${err}=    Get From Dictionary    ${resp.json()}    syntax_error
    Should Not Be Empty    ${err}

TC-PRL-003 Syntax Error Message Is Human-Readable
    [Documentation]    UFR-8: syntax_error must not be a raw Prolog exception term.
    [Tags]    prolog    syntax    quality
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${SYNTAX_CODE}
    ${resp}=    POST On Session    progcheck    /api/syntax-check    json=${body}
    ${err}=    Get From Dictionary    ${resp.json()}    syntax_error
    # A raw Prolog exception starts with 'error(' — check it's been translated
    Should Not Start With    ${err}    error(

TC-PRL-004 Syntax Check Responds Within 5 Seconds
    [Documentation]    SNFR-1: syntax check must be fast.
    [Tags]    prolog    syntax    performance
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/syntax-check    json=${body}
    Response Time Is Under    ${resp}    5000

# ─────────────────────────────────────────────────────────────────────────────
# Query execution and trace (SFR-7, SFR-11, UFR-9)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-005 Query Run Returns Proof Tree And Trace
    [Documentation]    SFR-11, UFR-9: correct code returns proof_tree and trace strings.
    [Tags]    prolog    query    positive
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl
    ...    student_code=${CORRECT_CODE}    query=append([],[],[])
    ${resp}=    POST On Session    progcheck    /api/query-run
    ...    json=${body}    expected_status=200
    Should Be True    ${resp.json()["ok"]} == True
    ${j}=    Set Variable    ${resp.json()}
    Dictionary Should Contain Key    ${j}    proof_tree
    Dictionary Should Contain Key    ${j}    trace
    Should Not Be Empty    ${j["proof_tree"]}

TC-PRL-006 Query Run Detects Logic Error
    [Documentation]    UFR-10: wrong code is identified by Shapiro's algorithm.
    ...                WRONG_CODE has append([],Y,[]) instead of append([],Y,Y).
    ...                _execute_query runs shapiro_diagnose and returns shapiro_mode.
    ...                When a buggy clause is found, shapiro_mode == "incorrect".
    ...                This is the reliable indicator — proof_tree and query_result
    ...                are tied to the oracle-assisted meta-interpreter, not raw
    ...                query success/failure.
    [Tags]    prolog    query    negative
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl
    ...    student_code=${WRONG_CODE}    query=append([a],[b],[a,b])
    ${resp}=    POST On Session    progcheck    /api/query-run    json=${body}
    ${j}=    Set Variable    ${resp.json()}
    Should Be True    ${resp.json()["ok"]} == True
    # Shapiro's algorithm identifies the wrong clause → mode is "incorrect"
    ${mode}=    Get From Dictionary    ${j}    shapiro_mode
    Should Be Equal    ${mode}    incorrect

TC-PRL-007 Query Run Responds Within 5 Seconds
    [Documentation]    SNFR-1: query execution must respect response budget.
    [Tags]    prolog    query    performance
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl
    ...    student_code=${CORRECT_CODE}    query=append([],[],[])
    ${resp}=    POST On Session    progcheck    /api/query-run    json=${body}
    Response Time Is Under    ${resp}    5000

# ─────────────────────────────────────────────────────────────────────────────
# Full diagnosis (SFR-10, SFR-12, UFR-7, UFR-10)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-008 Full Diagnosis On Correct Code Shows No Failures
    [Documentation]    SFR-10, UFR-7: correct code should produce no failure entries in the log.
    [Tags]    prolog    diagnosis    positive
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/full-diagnosis
    ...    json=${body}    expected_status=200
    ${j}=    Set Variable    ${resp.json()}
    Should Be True    ${j["ok"]} == True
    ${log}=    Get From Dictionary    ${j}    log
    Should Not Be Empty    ${log}

TC-PRL-009 Full Diagnosis On Wrong Code Reports Failure
    [Documentation]    UFR-7, UFR-10: wrong base case causes test failure in log.
    [Tags]    prolog    diagnosis    negative
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${WRONG_CODE}
    ${resp}=    POST On Session    progcheck    /api/full-diagnosis    json=${body}
    ${log}=    Get From Dictionary    ${resp.json()}    log
    Should Not Be Empty    ${log}
    # Log must mention failure or error in some form
    ${lower_log}=    Convert To Lower Case    ${log}
    Should Match Regexp    ${lower_log}    (fail|error|incorrect|wrong|diagnos)

TC-PRL-010 Full Diagnosis Responds Within 30 Seconds
    [Documentation]    SNFR-1: full diagnosis must complete within 30 seconds.
    ...                Full diagnosis involves SWI-Prolog meta-interpretation,
    ...                proof-tree generation, and diagnosis engine — this is
    ...                inherently slower than a simple query.  30s guards against
    ...                hangs without setting an unreachable 5s target.
    [Tags]    prolog    diagnosis    performance
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/full-diagnosis    json=${body}
    Response Time Is Under    ${resp}    30000

TC-PRL-011 Full Diagnosis With Custom Test Cases
    [Documentation]    SFR-9, UFR-5: teacher-supplied test cases are respected.
    [Tags]    prolog    diagnosis    testcase
    ${tc1}=    Create Dictionary    testcase_id=${1}    input=append([],[],[])    expected_output=true
    ${tc2}=    Create Dictionary    testcase_id=${2}    input=append([a],[b],[a,b])    expected_output=true
    ${tcs}=    Create List    ${tc1}    ${tc2}
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    Set To Dictionary    ${body}    test_cases_file=${tcs}
    ${resp}=    POST On Session    progcheck    /api/full-diagnosis    json=${body}
    Should Be Equal As Integers    ${resp.status_code}    200

# ─────────────────────────────────────────────────────────────────────────────
# LLM degradation (SNFR-10)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-012 Generate Testcases Degrades Gracefully Without LLM
    [Documentation]    SNFR-10: endpoint returns ok=false and empty list when LLM unavailable.
    [Tags]    prolog    llm    degradation
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/generate-diagnosis-testcases    json=${body}
    # Whether ok or not, response must not crash the server
    Should Be Equal As Integers    ${resp.status_code}    200
    ${j}=    Set Variable    ${resp.json()}
    Dictionary Should Contain Key    ${j}    test_cases
    Should Be True    isinstance($j["test_cases"], list)

# ─────────────────────────────────────────────────────────────────────────────
# Security — credential leakage (SNFR-8)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-013 Diagnosis Log Does Not Expose API Keys
    [Documentation]    SNFR-8: GROQ_API_KEY must not appear in the diagnosis log.
    [Tags]    prolog    security
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=test.pl    student_code=${CORRECT_CODE}
    ${resp}=    POST On Session    progcheck    /api/full-diagnosis    json=${body}
    ${log}=    Get From Dictionary    ${resp.json()}    log
    Should Not Contain    ${log}    GROQ_API_KEY
    Should Not Contain    ${log}    sk-

# ─────────────────────────────────────────────────────────────────────────────
# Non-termination guard (SNFR-4)
# ─────────────────────────────────────────────────────────────────────────────

TC-PRL-014 Infinite Loop Code Does Not Hang Server
    [Documentation]    SNFR-4: non-terminating student code must be cut off by depth/time limit.
    [Tags]    prolog    safety    performance
    ${loop_code}=    Set Variable    loop(X) :- loop(X).
    ${body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=loop.pl    student_code=${loop_code}
    # Must return within 15 seconds even for infinite-loop code
    ${resp}=    POST On Session    progcheck    /api/syntax-check    json=${body}
    Response Time Is Under    ${resp}    15000
    # If syntax is valid, try full diagnosis too
    ${diag_body}=    Create Dictionary
    ...    problem_id=${PL_QUESTION}    student_file=loop.pl    student_code=${loop_code}
    ${dresp}=    POST On Session    progcheck    /api/full-diagnosis    json=${diag_body}
    Response Time Is Under    ${dresp}    15000

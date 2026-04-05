*** Settings ***
Documentation     Shared keywords and variables for ProgCheck Robot Framework tests.
Library           RequestsLibrary
Library           Collections
Library           String
Library           OperatingSystem
Library           DateTime

*** Variables ***
${BASE_URL}         http://localhost:8000
${CONTENT_TYPE}     application/json

# Test user identities
${STUDENT_ID}       TEST_STU_001
${STUDENT_NAME}     testStudent
${STUDENT_PASS}     TestPass123

${TEACHER_ID}       TEST_TCH_001
${TEACHER_NAME}     testTeacher
${TEACHER_PASS}     TeachPass456

# Sample Prolog code snippets
${CORRECT_APPEND}
...    append([], Y, Y).\n
...    append([H|T], Y, [H|R]) :- append(T, Y, R).

${WRONG_BASE_APPEND}
...    append([], Y, []).\n
...    append([H|T], Y, [H|R]) :- append(T, Y, R).

${SYNTAX_ERROR_CODE}
...    factorial(0, 1).\n
...    factorial(N, F :- N > 0, N1 is N-1, factorial(N1, F1), F is N*F1.

*** Keywords ***

Create Session
    [Documentation]    Open a requests session to the ProgCheck API server.
    RequestsLibrary.Create Session    progcheck    ${BASE_URL}    verify=False

Register Student
    [Documentation]    Register a student account and return the auth token.
    [Arguments]    ${student_id}=${STUDENT_ID}    ${name}=${STUDENT_NAME}    ${password}=${STUDENT_PASS}
    ${body}=    Create Dictionary
    ...    username=${name}    password=${password}
    ...    role=student    student_id=${student_id}
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=200
    ${token}=    Get From Dictionary    ${resp.json()}    token
    RETURN    ${token}

Register Teacher
    [Documentation]    Register a teacher account and return the auth token.
    [Arguments]    ${teacher_id}=${TEACHER_ID}    ${name}=${TEACHER_NAME}    ${password}=${TEACHER_PASS}
    ${body}=    Create Dictionary
    ...    username=${name}    password=${password}
    ...    role=teacher    teacher_id=${teacher_id}
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=200
    ${token}=    Get From Dictionary    ${resp.json()}    token
    RETURN    ${token}

Login Student
    [Arguments]    ${name}=${STUDENT_NAME}    ${password}=${STUDENT_PASS}
    ${body}=    Create Dictionary    username=${name}    password=${password}
    ${resp}=    POST On Session    progcheck    /api/auth/login/student    json=${body}
    ...    expected_status=200
    RETURN    ${resp.json()}

Login Teacher
    [Arguments]    ${name}=${TEACHER_NAME}    ${password}=${TEACHER_PASS}
    ${body}=    Create Dictionary    username=${name}    password=${password}
    ${resp}=    POST On Session    progcheck    /api/auth/login/teacher    json=${body}
    ...    expected_status=200
    RETURN    ${resp.json()}

Create Classroom
    [Documentation]    Teacher creates a classroom; returns class_id.
    [Arguments]    ${teacher_id}    ${class_name}=Prolog 101
    ${body}=    Create Dictionary    class_name=${class_name}    teacher_id=${teacher_id}
    ${resp}=    POST On Session    progcheck    /api/classrooms/create?teacher_id=${teacher_id}
    ...    json=${body}    expected_status=200
    ${class_id}=    Get From Dictionary    ${resp.json()}    class_id
    RETURN    ${class_id}

Create Lab
    [Documentation]    Teacher creates a lab inside a classroom; returns lab_id.
    [Arguments]    ${teacher_id}    ${classroom_id}    ${title}=Test Lab
    ...            ${active_time}=${EMPTY}    ${complete_time}=${EMPTY}
    ${body}=    Create Dictionary    title=${title}    classroom_id=${classroom_id}
    Run Keyword If    '${active_time}' != ''
    ...    Set To Dictionary    ${body}    active_time=${active_time}
    Run Keyword If    '${complete_time}' != ''
    ...    Set To Dictionary    ${body}    complete_time=${complete_time}
    ${resp}=    POST On Session    progcheck
    ...    /api/labs/create?teacher_id=${teacher_id}
    ...    json=${body}    expected_status=200
    ${lab_id}=    Get From Dictionary    ${resp.json()}    lab_id
    RETURN    ${lab_id}

Add Lab Question
    [Arguments]    ${teacher_id}    ${lab_id}    ${title}    ${problem}
    ${body}=    Create Dictionary    title=${title}    problem=${problem}
    ${resp}=    POST On Session    progcheck
    ...    /api/labs/${lab_id}/questions?teacher_id=${teacher_id}
    ...    json=${body}    expected_status=200
    ${qid}=    Get From Dictionary    ${resp.json()}    question_id
    RETURN    ${qid}

Submit Code
    [Arguments]    ${student_id}    ${question_id}    ${code}
    ${body}=    Create Dictionary
    ...    student_id=${student_id}    question_id=${question_id}    code_file=${code}
    ${resp}=    POST On Session    progcheck    /api/labs/submit
    ...    json=${body}    expected_status=200
    RETURN    ${resp.json()}

Response Time Is Under
    [Documentation]    Fail if the last HTTP response took longer than threshold (ms).
    [Arguments]    ${resp}    ${max_ms}=5000
    ${elapsed_ms}=    Evaluate    ${resp.elapsed.total_seconds()} * 1000
    Should Be True    ${elapsed_ms} < ${max_ms}
    ...    Response took ${elapsed_ms}ms, expected < ${max_ms}ms

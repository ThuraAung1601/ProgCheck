*** Settings ***
Documentation     Acceptance tests for user authentication (UFR-1, UFR-2, SFR-1, SFR-2).
...
...               Requires the ProgCheck server running at http://localhost:8000.
...               Run with: robot tests/robot/auth.robot
...
Resource          resources/common.resource
Suite Setup       Create Session
Test Tags         auth    functional

*** Variables ***
${UNIQUE_SID}     AROBOT_STU_${EMPTY}
${UNIQUE_TID}     AROBOT_TCH_${EMPTY}

*** Test Cases ***

# ─────────────────────────────────────────────────────────────────────────────
# Registration (UFR-1, SFR-1)
# ─────────────────────────────────────────────────────────────────────────────

TC-AUTH-001 Student Registration Returns Token
    [Documentation]    UFR-1: A new student can register and receives a non-empty auth token.
    [Tags]    auth    registration    positive
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${body}=    Create Dictionary
    ...    username=student_${uid}    password=Pass123
    ...    role=student    student_id=TST_${uid}
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    Status Should Be    200    ${resp}
    Dictionary Should Contain Key    ${resp.json()}    token
    ${token}=    Get From Dictionary    ${resp.json()}    token
    Should Not Be Empty    ${token}
    Should Be Equal    ${resp.json()["user"]["role"]}    student

TC-AUTH-002 Teacher Registration Returns Token
    [Documentation]    UFR-1: A new teacher can register and receives a valid token.
    [Tags]    auth    registration    positive
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${body}=    Create Dictionary
    ...    username=teacher_${uid}    password=TPass456
    ...    role=teacher    teacher_id=TTCH_${uid}
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    Status Should Be    200    ${resp}
    Should Be Equal    ${resp.json()["user"]["role"]}    teacher

TC-AUTH-003 Duplicate Student Registration Rejected
    [Documentation]    SFR-1: Registering the same student_id twice returns 409 Conflict.
    [Tags]    auth    registration    negative
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${body}=    Create Dictionary
    ...    username=dup_${uid}    password=Pass123
    ...    role=student    student_id=DUP_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${resp2}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=any
    Should Be Equal As Integers    ${resp2.status_code}    409

TC-AUTH-004 Missing Student ID Rejected
    [Documentation]    SFR-1: student_id is mandatory; omitting it returns 400.
    [Tags]    auth    registration    negative
    ${body}=    Create Dictionary
    ...    username=noid    password=pass    role=student
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=any
    Should Be Equal As Integers    ${resp.status_code}    400

TC-AUTH-005 Invalid Role Rejected
    [Documentation]    SFR-2, SNFR-4: Roles other than student/teacher are rejected.
    [Tags]    auth    registration    security    negative
    ${body}=    Create Dictionary
    ...    username=hacker    password=pw    role=admin
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=any
    Should Be True    ${resp.status_code} >= 400

TC-AUTH-006 Response Does Not Expose Password Hash
    [Documentation]    SNFR-11: bcrypt hash must not appear in the registration response.
    [Tags]    auth    security
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${body}=    Create Dictionary
    ...    username=sec_${uid}    password=mysecret    role=student    student_id=SEC_${uid}
    ${resp}=    POST On Session    progcheck    /api/auth/register    json=${body}
    ...    expected_status=200
    Should Not Contain    ${resp.text}    mysecret
    Should Not Contain    ${resp.text}    $2b$

# ─────────────────────────────────────────────────────────────────────────────
# Login (UFR-1, SFR-1)
# ─────────────────────────────────────────────────────────────────────────────

TC-AUTH-007 Student Login With Valid Credentials
    [Documentation]    UFR-1: registered student can log in and receives a token.
    [Tags]    auth    login    positive
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${name}=    Set Variable    stu_${uid}
    ${body}=    Create Dictionary
    ...    username=${name}    password=Pass123
    ...    role=student    student_id=LOG_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${login}=    Create Dictionary    username=${name}    password=Pass123
    ${resp}=    POST On Session    progcheck    /api/auth/login/student    json=${login}
    ...    expected_status=200
    Dictionary Should Contain Key    ${resp.json()}    token

TC-AUTH-008 Login With Wrong Password Returns 401
    [Documentation]    UFR-1: incorrect password must be rejected with 401.
    [Tags]    auth    login    negative
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${name}=    Set Variable    wrongpw_${uid}
    ${body}=    Create Dictionary
    ...    username=${name}    password=correctpw
    ...    role=student    student_id=WPWT_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${login}=    Create Dictionary    username=${name}    password=wrongpw
    ${resp}=    POST On Session    progcheck    /api/auth/login/student    json=${login}
    ...    expected_status=any
    Should Be Equal As Integers    ${resp.status_code}    401

TC-AUTH-009 Student Cannot Login On Teacher Endpoint
    [Documentation]    SFR-2: student credentials must fail on the teacher login endpoint.
    [Tags]    auth    login    role    negative
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${name}=    Set Variable    cross_${uid}
    ${body}=    Create Dictionary
    ...    username=${name}    password=Pass123
    ...    role=student    student_id=CRSS_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${login}=    Create Dictionary    username=${name}    password=Pass123
    ${resp}=    POST On Session    progcheck    /api/auth/login/teacher    json=${login}
    ...    expected_status=any
    Should Be Equal As Integers    ${resp.status_code}    401

TC-AUTH-010 Login Response Structure Is Correct
    [Documentation]    SFR-1: login response must include user.id, user.username, user.role, token.
    [Tags]    auth    login    contract
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${name}=    Set Variable    struct_${uid}
    ${body}=    Create Dictionary
    ...    username=${name}    password=Pass123
    ...    role=student    student_id=STCT_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${login}=    Create Dictionary    username=${name}    password=Pass123
    ${resp}=    POST On Session    progcheck    /api/auth/login/student    json=${login}
    ...    expected_status=200
    ${j}=    Set Variable    ${resp.json()}
    Dictionary Should Contain Key    ${j}    token
    Dictionary Should Contain Key    ${j}    user
    Dictionary Should Contain Key    ${j["user"]}    id
    Dictionary Should Contain Key    ${j["user"]}    username
    Dictionary Should Contain Key    ${j["user"]}    role

# ─────────────────────────────────────────────────────────────────────────────
# Performance (SNFR-1)
# ─────────────────────────────────────────────────────────────────────────────

TC-AUTH-011 Login Responds Within 5 Seconds
    [Documentation]    SNFR-1: login must respond within the 5-second budget.
    [Tags]    auth    performance
    ${uid}=    Generate Random String    8    [NUMBERS]
    ${name}=    Set Variable    perf_${uid}
    ${body}=    Create Dictionary
    ...    username=${name}    password=Pass123
    ...    role=student    student_id=PERF_${uid}
    POST On Session    progcheck    /api/auth/register    json=${body}    expected_status=200
    ${login}=    Create Dictionary    username=${name}    password=Pass123
    ${resp}=    POST On Session    progcheck    /api/auth/login/student    json=${login}
    ...    expected_status=200
    Response Time Is Under    ${resp}    5000

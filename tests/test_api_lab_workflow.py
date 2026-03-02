import importlib
from pathlib import Path
import sys
import types

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import src.storage.zodb_store as zodb_store


@pytest.fixture()
def api_context(tmp_path, monkeypatch):
    db_path = tmp_path / "test_zodb.fs"
    monkeypatch.setenv("ZODB_PATH", str(db_path))

    if "groq" not in sys.modules:
        groq_stub = types.ModuleType("groq")

        class _GroqStub:  # pragma: no cover
            def __init__(self, *args, **kwargs):
                pass

        groq_stub.Groq = _GroqStub
        sys.modules["groq"] = groq_stub

    if zodb_store._STORE is not None:
        zodb_store._STORE.close()
        zodb_store._STORE = None

    import backend.main as backend_main

    backend_main = importlib.reload(backend_main)
    client = TestClient(backend_main.app)

    try:
        yield client, backend_main
    finally:
        backend_main.store.close()
        zodb_store._STORE = None


def _register_and_login(client: TestClient, user_id: str, role: str) -> str:
    if role == "instructor":
        register_path = "/auth/register/instructor"
        body = {"instructor_id": user_id, "name": "Instructor", "password": "pass1234"}
    else:
        register_path = "/auth/register/student"
        body = {"student_id": user_id, "name": "Student", "password": "pass1234"}

    register_res = client.post(register_path, json=body)
    assert register_res.status_code == 200

    login_res = client.post("/auth/login", json={"user_id": user_id, "password": "pass1234"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return f"Bearer {token}"


def test_add_student_returns_warning_when_already_enrolled(api_context):
    client, _ = api_context
    instructor_auth = _register_and_login(client, "inst1", "instructor")
    _register_and_login(client, "stu1", "student")

    classroom_res = client.post(
        "/classrooms",
        headers={"Authorization": instructor_auth},
        json={"class_name": "KRR", "class_size": 30},
    )
    assert classroom_res.status_code == 200
    class_id = classroom_res.json()["class_id"]

    add_first = client.post(
        f"/classrooms/{class_id}/students",
        headers={"Authorization": instructor_auth},
        json={"student_id": "stu1"},
    )
    assert add_first.status_code == 200
    assert add_first.json()["status"] == "added"

    add_second = client.post(
        f"/classrooms/{class_id}/students",
        headers={"Authorization": instructor_auth},
        json={"student_id": "stu1"},
    )
    assert add_second.status_code == 200
    assert add_second.json()["status"] == "already_enrolled"
    assert add_second.json()["message"] == "Student already enrolled"


def test_submit_and_display_result_support_open_lab_timeout_and_enhanced_feedback(api_context, monkeypatch):
    client, backend_main = api_context
    instructor_auth = _register_and_login(client, "inst2", "instructor")
    student_auth = _register_and_login(client, "stu2", "student")

    classroom_res = client.post(
        "/classrooms",
        headers={"Authorization": instructor_auth},
        json={"class_name": "Logic", "class_size": 20},
    )
    assert classroom_res.status_code == 200
    class_id = classroom_res.json()["class_id"]

    add_res = client.post(
        f"/classrooms/{class_id}/students",
        headers={"Authorization": instructor_auth},
        json={"student_id": "stu2"},
    )
    assert add_res.status_code == 200

    create_lab_res = client.post(
        "/labs",
        headers={"Authorization": instructor_auth},
        json={"class_id": class_id, "lab_id": 1, "title": "Lab 1", "description": "Basics"},
    )
    assert create_lab_res.status_code == 200

    create_question_res = client.post(
        "/labs/questions",
        headers={"Authorization": instructor_auth},
        json={
            "class_id": class_id,
            "lab_id": 1,
            "question_number": 1,
            "problem_text": "p(a) should be true",
            "test_cases": ["test(p(a), [p(a)])."],
        },
    )
    assert create_question_res.status_code == 200
    question_id = create_question_res.json()["question_id"]

    open_lab_res = client.get(
        f"/labs/{class_id}/1/open",
        headers={"Authorization": student_auth},
    )
    assert open_lab_res.status_code == 200
    assert len(open_lab_res.json()["questions"]) == 1

    fake_timeout = backend_main.StudentAnalyzeResponse(
        status="logic_error",
        analysis={"error": "execution timeout"},
        feedback="Execution timeout detected",
        used_test_cases=["test(p(a), [p(a)])."],
        execution_traces=[],
        logs=["Execution timeout"],
    )

    monkeypatch.setattr(backend_main, "_run_analysis_internal", lambda **_: fake_timeout)

    submit_res = client.post(
        f"/labs/questions/{question_id}/submit",
        headers={"Authorization": student_auth},
        json={"student_code": "p(a).", "use_llm": False, "include_logs": True},
    )
    assert submit_res.status_code == 200
    submit_body = submit_res.json()
    assert submit_body["status"] == "execution_timeout"
    submission_id = submit_body["submission_id"]

    missing_res = client.get(
        "/submissions/submission-99999",
        headers={"Authorization": student_auth},
    )
    assert missing_res.status_code == 404
    assert missing_res.json()["detail"] == "Result not found"

    monkeypatch.setenv("GROQ_API_KEY", "fake-key")
    import src.llm_bridge as llm_bridge

    monkeypatch.setattr(
        llm_bridge,
        "translate_to_natural_language",
        lambda analysis, problem_text, student_code, api_key: "Enhanced feedback",
    )

    display_res = client.get(
        f"/submissions/{submission_id}?enhance_feedback=true",
        headers={"Authorization": student_auth},
    )
    assert display_res.status_code == 200
    assert display_res.json()["explanation"] == "Enhanced feedback"

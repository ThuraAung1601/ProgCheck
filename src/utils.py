import re
from pathlib import Path
from typing import Any, List, Optional, Tuple



def normalize_goal_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)


def extract_evidence_items(diagnoses: Any) -> List[str]:
    if diagnoses is None:
        return []
    text = normalize_goal_text(diagnoses)
    matches = re.findall(r"diagnosis\([^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*(\[[^\]]*\])\)", text)
    return matches or []


def parse_diagnoses_text(diagnoses_text: Any) -> List[Tuple[str, str]]:
    if not diagnoses_text:
        return []
    text = normalize_goal_text(diagnoses_text)
    if not text or text == "[]":
        return []
    matches = re.findall(
        r"diagnosis\([^,]+,\s*[^,]+,\s*'([^']+)',\s*'([^']+)',\s*\[[^\]]*\]\)",
        text,
    )
    return [(m[0], m[1]) for m in matches]


def summarize_failed_tests(error_text: Any) -> Optional[str]:
    if not error_text:
        return None
    text = normalize_goal_text(error_text)
    goals = re.findall(r"test_failure\((.+?),\s*\[", text)
    if not goals:
        return None
    unique_goals: List[str] = []
    for g in (g.strip() for g in goals):
        if g not in unique_goals:
            unique_goals.append(g)
    preview = ", ".join(unique_goals[:4])
    if len(unique_goals) > 4:
        preview += ", ..."
    return f"Tests failed for: {preview}."


def human_error_type(error_type: Optional[str]) -> str:
    if not error_type:
        return "Unknown Syntax Error"
    mapping = {
        "invalid_operator": "Invalid Operator",
        "missing_period": "Missing Period",
        "unmatched_parentheses": "Unmatched Parentheses",
        "unmatched_brackets": "Unmatched Brackets",
        "variable_lowercase": "Variable Starts Lowercase",
        "double_period": "Double Period",
        "space_in_atom": "Space in Atom",
        "missing_clause_body": "Missing Clause Body",
        "parser_error": "Parser Error",
        "unknown": "Unknown Syntax Error",
    }
    return mapping.get(error_type, error_type.replace("_", " ").title())
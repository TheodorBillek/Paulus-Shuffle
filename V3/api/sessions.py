from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import Any, Dict, FrozenSet, List, Optional, Set, Tuple

from fastapi import APIRouter, HTTPException, status

from core.db import get_db
from core.engine import EngineInput, SeatingEngine
from core.models import AssignmentOut, AssignmentPatch, GenerateRequest, SessionOut

router = APIRouter(tags=["sessions"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# List / Get
# ---------------------------------------------------------------------------

@router.get("/api/classes/{class_id}/sessions", response_model=List[SessionOut])
def list_sessions(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM sessions WHERE class_id=? ORDER BY created_at DESC",
            (class_id,),
        ).fetchall()
    return [_session_out(r) for r in rows]


@router.get("/api/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found")
    return _session_out(row)


@router.get("/api/sessions/{session_id}/assignments", response_model=List[AssignmentOut])
def get_assignments(session_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT student_id, seat_id, is_solo FROM assignments WHERE session_id=?",
            (session_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------

@router.post(
    "/api/classes/{class_id}/sessions/generate",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
)
def generate_session(class_id: int, body: GenerateRequest):
    with get_db() as db:
        cls = db.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
        if cls is None:
            raise HTTPException(404, "Class not found")
        cls = dict(cls)

        students = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM students WHERE class_id=? AND is_active=1", (class_id,)
            ).fetchall()
        ]
        if not students:
            raise HTTPException(422, "No active students in this class")

        seats = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM seats WHERE class_id=?", (class_id,)
            ).fetchall()
        ]

        rules = [
            dict(r)
            for r in db.execute(
                "SELECT * FROM rules WHERE class_id=?", (class_id,)
            ).fetchall()
        ]
        for rule in rules:
            rule["config"] = json.loads(rule["config"])
            rule["enabled"] = bool(rule["enabled"])

        # Load position weights
        student_ids = [s["id"] for s in students]
        seat_ids = [s["id"] for s in seats]
        pos_rows = db.execute(
            f"""SELECT student_id, seat_id, weight FROM student_seat_weights
                WHERE student_id IN ({','.join('?'*len(student_ids))})""",
            student_ids,
        ).fetchall() if student_ids else []
        position_weights: Dict[Tuple[int, int], int] = {
            (r["student_id"], r["seat_id"]): r["weight"] for r in pos_rows
        }

        # Load pair weights
        pair_rows = db.execute(
            f"""SELECT student1_id, student2_id, weight FROM student_pair_weights
                WHERE student1_id IN ({','.join('?'*len(student_ids))})
                   OR student2_id IN ({','.join('?'*len(student_ids))})""",
            student_ids + student_ids,
        ).fetchall() if student_ids else []
        pair_weights: Dict[Tuple[int, int], int] = {
            (r["student1_id"], r["student2_id"]): r["weight"] for r in pair_rows
        }

        # Load history pairs — look back N sessions per no_repeat config
        no_repeat_rule = next((r for r in rules if r["rule_type"] == "no_repeat"), None)
        sessions_back = 1
        if no_repeat_rule and isinstance(no_repeat_rule["config"], dict):
            sessions_back = no_repeat_rule["config"].get("sessions_back", 1)

        prev_sessions = db.execute(
            "SELECT id FROM sessions WHERE class_id=? ORDER BY created_at DESC LIMIT ?",
            (class_id, sessions_back),
        ).fetchall()
        history_pairs: Set[FrozenSet[int]] = set()
        last_rows: Dict[int, int] = {}

        for sess in prev_sessions:
            asgn_rows = db.execute(
                "SELECT student_id, seat_id FROM assignments WHERE session_id=?",
                (sess["id"],),
            ).fetchall()
            # Rebuild table pairs for history
            asgn_map = {r["student_id"]: r["seat_id"] for r in asgn_rows if r["seat_id"]}
            reverse_asgn = {v: k for k, v in asgn_map.items()}
            # Build table groups
            table_map: Dict[Tuple[int, int], Dict[str, int]] = {}
            for seat in seats:
                key = (seat["row_idx"], seat["col_idx"])
                table_map.setdefault(key, {})[seat["side"]] = seat["id"]
            for sides in table_map.values():
                sl = sides.get("L")
                sr = sides.get("R")
                s1 = reverse_asgn.get(sl) if sl else None
                s2 = reverse_asgn.get(sr) if sr else None
                if s1 and s2:
                    history_pairs.add(frozenset([s1, s2]))
            # Last rows (only from the most recent session)
            if not last_rows:
                for r in asgn_rows:
                    seat = next((s for s in seats if s["id"] == r["seat_id"]), None)
                    if seat:
                        last_rows[r["student_id"]] = seat["row_idx"]

        # Hard-constraint overrides from rule configs
        pin_config = next((r["config"] for r in rules if r["rule_type"] == "pin_to_seat" and r["enabled"]), {})
        solo_config = next((r["config"] for r in rules if r["rule_type"] == "seat_alone" and r["enabled"]), {})

        pin_overrides: Dict[int, int] = {
            int(k): int(v) for k, v in pin_config.items()
            if k.isdigit() and str(v).isdigit()
        } if isinstance(pin_config, dict) else {}

        solo_overrides: Set[int] = {
            int(k) for k in (solo_config.get("students", []) if isinstance(solo_config, dict) else [])
        }

    # Run engine (outside DB context to avoid holding the connection)
    engine = SeatingEngine(
        EngineInput(
            students=students,
            seats=seats,
            position_weights=position_weights,
            pair_weights=pair_weights,
            rules=rules,
            history_pairs=history_pairs,
            last_rows=last_rows,
            mode=body.mode,
            use_position_weights=body.use_position_weights,
            use_pair_weights=body.use_pair_weights,
            pin_overrides=pin_overrides,
            solo_overrides=solo_overrides,
        )
    )
    result = engine.generate()

    # Persist session
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO sessions (class_id, label, created_at, algorithm_mode, warnings) VALUES (?,?,?,?,?)",
            (class_id, body.label, _now(), body.mode, json.dumps(result.warnings)),
        )
        session_id = cur.lastrowid

        for student_id, seat_id in result.assignment.items():
            is_solo = student_id in result.solo_students
            db.execute(
                "INSERT INTO assignments (session_id, student_id, seat_id, is_solo) VALUES (?,?,?,?)",
                (session_id, student_id, seat_id, int(is_solo)),
            )
        for student_id in result.unassigned_students:
            db.execute(
                "INSERT INTO assignments (session_id, student_id, seat_id, is_solo) VALUES (?,?,NULL,0)",
                (session_id, student_id),
            )

        sess_row = db.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()

    return {
        "session": _session_out(sess_row),
        "assignment": {str(k): v for k, v in result.assignment.items()},
        "solo_students": result.solo_students,
        "unassigned_students": result.unassigned_students,
        "warnings": result.warnings,
        "score": result.score,
    }


# ---------------------------------------------------------------------------
# Manual drag-and-drop update
# ---------------------------------------------------------------------------

@router.patch("/api/sessions/{session_id}/assignments")
def patch_assignments(session_id: int, patches: List[AssignmentPatch]):
    with get_db() as db:
        row = db.execute("SELECT id FROM sessions WHERE id=?", (session_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Session not found")
        for p in patches:
            db.execute(
                "UPDATE assignments SET seat_id=? WHERE session_id=? AND student_id=?",
                (p.seat_id, session_id, p.student_id),
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/api/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: int):
    with get_db() as db:
        db.execute("DELETE FROM sessions WHERE id=?", (session_id,))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_out(row) -> dict:
    d = dict(row)
    d["warnings"] = json.loads(d.get("warnings", "[]"))
    return d

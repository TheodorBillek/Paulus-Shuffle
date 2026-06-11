from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status

from typing import Any, Dict, List

from core.db import get_db, seed_default_rules, seed_default_seats
from core.models import ClassCreate, ClassOut, ClassUpdate, RuleUpdate, SeatOut, SeatToggle

router = APIRouter(prefix="/api/classes", tags=["classes"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_class(row) -> dict:
    return dict(row)


# ---------------------------------------------------------------------------
# Classes CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ClassOut])
def list_classes():
    with get_db() as db:
        rows = db.execute("SELECT * FROM classes ORDER BY name").fetchall()
    return [dict(r) for r in rows]


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(body: ClassCreate):
    now = _now()
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO classes (name, description, grid_rows, grid_cols, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (body.name, body.description, body.grid_rows, body.grid_cols, now, now),
        )
        class_id = cur.lastrowid
        seed_default_rules(db, class_id)
        seed_default_seats(db, class_id, body.grid_rows, body.grid_cols)
        row = db.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
    return dict(row)


@router.get("/{class_id}", response_model=ClassOut)
def get_class(class_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Class not found")
    return dict(row)


@router.put("/{class_id}", response_model=ClassOut)
def update_class(class_id: int, body: ClassUpdate):
    with get_db() as db:
        existing = db.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
        if existing is None:
            raise HTTPException(404, "Class not found")
        fields = body.model_dump(exclude_none=True)
        if not fields:
            return dict(existing)

        old_rows = existing["grid_rows"]
        old_cols = existing["grid_cols"]
        new_rows = fields.get("grid_rows", old_rows)
        new_cols = fields.get("grid_cols", old_cols)

        set_clause = ", ".join(f"{k}=?" for k in fields)
        values = list(fields.values()) + [_now(), class_id]
        db.execute(f"UPDATE classes SET {set_clause}, updated_at=? WHERE id=?", values)

        # Expand seat grid if layout grew
        if new_rows > old_rows or new_cols > old_cols:
            seed_default_seats(db, class_id, new_rows, new_cols)

        row = db.execute("SELECT * FROM classes WHERE id=?", (class_id,)).fetchone()
    return dict(row)


@router.delete("/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: int):
    with get_db() as db:
        db.execute("DELETE FROM classes WHERE id=?", (class_id,))


# ---------------------------------------------------------------------------
# Seats
# ---------------------------------------------------------------------------

@router.get("/{class_id}/seats", response_model=List[SeatOut])
def list_seats(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM seats WHERE class_id=? ORDER BY row_idx, col_idx, side",
            (class_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.patch("/{class_id}/seats/{seat_id}", response_model=SeatOut)
def toggle_seat(class_id: int, seat_id: int, body: SeatToggle):
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM seats WHERE id=? AND class_id=?", (seat_id, class_id)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Seat not found")
        db.execute("UPDATE seats SET is_active=? WHERE id=?", (int(body.is_active), seat_id))
        row = db.execute("SELECT * FROM seats WHERE id=?", (seat_id,)).fetchone()
    return dict(row)


@router.post("/{class_id}/seats/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_seats(class_id: int):
    """Re-activate all seats for this class."""
    with get_db() as db:
        db.execute("UPDATE seats SET is_active=1 WHERE class_id=?", (class_id,))


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

@router.get("/{class_id}/rules")
def list_rules(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM rules WHERE class_id=? ORDER BY rule_type",
            (class_id,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/{class_id}/rules/{rule_type}")
def update_rule(class_id: int, rule_type: str, body: RuleUpdate):
    import json
    with get_db() as db:
        row = db.execute(
            "SELECT id FROM rules WHERE class_id=? AND rule_type=?",
            (class_id, rule_type),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Rule not found")
        db.execute(
            "UPDATE rules SET enabled=?, priority=?, config=? WHERE class_id=? AND rule_type=?",
            (int(body.enabled), body.priority, json.dumps(body.config), class_id, rule_type),
        )
        row = db.execute(
            "SELECT * FROM rules WHERE class_id=? AND rule_type=?",
            (class_id, rule_type),
        ).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# Position weights (per student)
# ---------------------------------------------------------------------------

@router.get("/{class_id}/weights/positions/{student_id}")
def get_position_weights(class_id: int, student_id: int):
    with get_db() as db:
        rows = db.execute(
            """SELECT ssw.seat_id, ssw.weight
               FROM student_seat_weights ssw
               JOIN seats s ON s.id = ssw.seat_id
               WHERE ssw.student_id=? AND s.class_id=?""",
            (student_id, class_id),
        ).fetchall()
    return {str(r["seat_id"]): r["weight"] for r in rows}


@router.put("/{class_id}/weights/positions/{student_id}")
def set_position_weights(class_id: int, student_id: int, body: Dict[str, int]):
    """body: {seat_id: weight}. Omitted seats revert to default (50)."""
    with get_db() as db:
        # Validate student belongs to class
        st = db.execute(
            "SELECT id FROM students WHERE id=? AND class_id=?", (student_id, class_id)
        ).fetchone()
        if st is None:
            raise HTTPException(404, "Student not found in class")
        # Delete existing weights for this student in this class
        db.execute(
            """DELETE FROM student_seat_weights WHERE student_id=?
               AND seat_id IN (SELECT id FROM seats WHERE class_id=?)""",
            (student_id, class_id),
        )
        for seat_id_str, weight in body.items():
            if not (0 <= weight <= 100):
                raise HTTPException(422, f"Weight {weight} out of range")
            db.execute(
                """INSERT INTO student_seat_weights (student_id, seat_id, weight)
                   VALUES (?,?,?)
                   ON CONFLICT(student_id, seat_id) DO UPDATE SET weight=excluded.weight""",
                (student_id, int(seat_id_str), weight),
            )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Pair weights (per student)
# ---------------------------------------------------------------------------

@router.get("/{class_id}/weights/pairs/{student_id}")
def get_pair_weights(class_id: int, student_id: int):
    with get_db() as db:
        rows = db.execute(
            """SELECT student1_id, student2_id, weight, is_override
               FROM student_pair_weights
               WHERE student1_id=? OR student2_id=?""",
            (student_id, student_id),
        ).fetchall()
    result = {}
    for r in rows:
        other = r["student2_id"] if r["student1_id"] == student_id else r["student1_id"]
        result[str(other)] = {"weight": r["weight"], "is_override": bool(r["is_override"])}
    return result


@router.put("/{class_id}/weights/pairs/{student_id}")
def set_pair_weight(class_id: int, student_id: int, body: Dict[str, Any]):
    """body: {other_student_id: int, weight: int, is_override: bool}"""
    from core.models import PairWeightUpdate
    parsed = PairWeightUpdate(**body)
    s1 = min(student_id, parsed.other_student_id)
    s2 = max(student_id, parsed.other_student_id)
    with get_db() as db:
        db.execute(
            """INSERT INTO student_pair_weights (student1_id, student2_id, weight, is_override)
               VALUES (?,?,?,?)
               ON CONFLICT(student1_id, student2_id)
               DO UPDATE SET weight=excluded.weight, is_override=excluded.is_override""",
            (s1, s2, parsed.weight, int(parsed.is_override)),
        )
    return {"ok": True}

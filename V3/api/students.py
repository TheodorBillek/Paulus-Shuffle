from __future__ import annotations
import csv
import io
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File, status

from core.db import get_db
from core.models import StudentCreate, StudentOut, StudentUpdate

router = APIRouter(tags=["students"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/api/classes/{class_id}/students", response_model=List[StudentOut])
def list_students(class_id: int):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM students WHERE class_id=? ORDER BY name",
            (class_id,),
        ).fetchall()
    return [_row(r) for r in rows]


@router.post(
    "/api/classes/{class_id}/students",
    response_model=StudentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_student(class_id: int, body: StudentCreate):
    with get_db() as db:
        cls = db.execute("SELECT id FROM classes WHERE id=?", (class_id,)).fetchone()
        if cls is None:
            raise HTTPException(404, "Class not found")
        cur = db.execute(
            "INSERT INTO students (class_id, name, gender, notes, is_active, created_at) VALUES (?,?,?,?,1,?)",
            (class_id, body.name.strip(), body.gender.upper(), body.notes, _now()),
        )
        row = db.execute("SELECT * FROM students WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row(row)


@router.put("/api/students/{student_id}", response_model=StudentOut)
def update_student(student_id: int, body: StudentUpdate):
    with get_db() as db:
        existing = db.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
        if existing is None:
            raise HTTPException(404, "Student not found")
        fields = body.model_dump(exclude_none=True)
        if "is_active" in fields:
            fields["is_active"] = int(fields["is_active"])
        if not fields:
            return _row(existing)
        set_clause = ", ".join(f"{k}=?" for k in fields)
        db.execute(
            f"UPDATE students SET {set_clause} WHERE id=?",
            [*fields.values(), student_id],
        )
        row = db.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    return _row(row)


@router.delete("/api/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(student_id: int):
    with get_db() as db:
        db.execute("DELETE FROM students WHERE id=?", (student_id,))


@router.post(
    "/api/classes/{class_id}/students/import",
    status_code=status.HTTP_201_CREATED,
)
def import_students_csv(class_id: int, file: UploadFile = File(...)):
    """
    CSV format: name,gender  (header row optional, gender: M/F/X or blank).
    Returns counts of imported and skipped rows.
    """
    with get_db() as db:
        cls = db.execute("SELECT id FROM classes WHERE id=?", (class_id,)).fetchone()
        if cls is None:
            raise HTTPException(404, "Class not found")

        content = file.file.read().decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(content))

        imported = 0
        skipped = 0
        now = _now()

        for row_num, row in enumerate(reader):
            if not row:
                continue
            name_raw = row[0].strip()
            if not name_raw or name_raw.lower() in ("name", "student"):
                continue  # header or blank
            gender_raw = row[1].strip().upper() if len(row) > 1 else "X"
            gender = gender_raw if gender_raw in ("M", "F", "X") else "X"

            if len(name_raw) > 100:
                skipped += 1
                continue

            try:
                db.execute(
                    "INSERT INTO students (class_id, name, gender, notes, is_active, created_at) VALUES (?,?,?,?,1,?)",
                    (class_id, name_raw, gender, "", now),
                )
                imported += 1
            except Exception:
                skipped += 1

    return {"imported": imported, "skipped": skipped}


def _row(r) -> dict:
    d = dict(r)
    d["is_active"] = bool(d["is_active"])
    return d

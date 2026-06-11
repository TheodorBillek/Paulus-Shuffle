from __future__ import annotations
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from core.db import get_db
from core.pdf import generate_pdf

router = APIRouter(tags=["export"])


@router.get("/api/sessions/{session_id}/export/pdf")
def export_pdf(
    session_id: int,
    fmt: str = Query("visual", pattern="^(visual|list)$"),
):
    with get_db() as db:
        sess = db.execute(
            "SELECT s.*, c.name AS class_name, c.grid_rows, c.grid_cols "
            "FROM sessions s JOIN classes c ON c.id=s.class_id WHERE s.id=?",
            (session_id,),
        ).fetchone()
        if sess is None:
            raise HTTPException(404, "Session not found")
        sess = dict(sess)

        students = {
            r["id"]: dict(r)
            for r in db.execute(
                "SELECT * FROM students WHERE class_id=?", (sess["class_id"],)
            ).fetchall()
        }
        seats = {
            r["id"]: dict(r)
            for r in db.execute(
                "SELECT * FROM seats WHERE class_id=?", (sess["class_id"],)
            ).fetchall()
        }
        assignments = db.execute(
            "SELECT student_id, seat_id FROM assignments WHERE session_id=? AND seat_id IS NOT NULL",
            (session_id,),
        ).fetchall()
        assignment = {r["student_id"]: r["seat_id"] for r in assignments}

    import json
    warnings = json.loads(sess.get("warnings", "[]"))

    pdf_bytes = generate_pdf(
        class_name=sess["class_name"],
        session_label=sess["label"],
        session_date=sess["created_at"][:10],
        students_by_id=students,
        seats_by_id=seats,
        assignment=assignment,
        grid_rows=sess["grid_rows"],
        grid_cols=sess["grid_cols"],
        warnings=warnings,
        fmt=fmt,
    )

    filename = f"paulus-shuffle-{session_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

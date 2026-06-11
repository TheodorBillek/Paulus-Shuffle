from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from core.export import sessions_to_csv, sessions_to_xlsx
from core.models import ExportHistoryRequest, PdfRequest
from core.pdf import generate_pdf

router = APIRouter(prefix="/api", tags=["export"])


@router.post("/export/pdf")
def export_pdf(body: PdfRequest):
    data = generate_pdf(
        class_name=body.class_name,
        session_label=body.session_label,
        session_date=body.session_date,
        assignment=body.assignment,
        solo_students=body.solo_students,
        students=[s.model_dump() for s in body.students],
        seats=[s.model_dump() for s in body.seats],
        warnings=body.warnings,
    )
    filename = f"seating-{body.session_date[:10]}.pdf"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/xlsx")
def export_xlsx(body: ExportHistoryRequest):
    data = sessions_to_xlsx(
        sessions=body.sessions,
        students=[s.model_dump() for s in body.students],
        seats=[s.model_dump() for s in body.seats],
    )
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="seating-history.xlsx"'},
    )


@router.post("/export/csv")
def export_csv(body: ExportHistoryRequest):
    data = sessions_to_csv(
        sessions=body.sessions,
        students=[s.model_dump() for s in body.students],
        seats=[s.model_dump() for s in body.seats],
    )
    return Response(
        content=data.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="seating-history.csv"'},
    )

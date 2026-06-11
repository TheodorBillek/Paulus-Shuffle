from __future__ import annotations
from io import BytesIO
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer


TEAL = colors.HexColor("#0f766e")
TEAL_LIGHT = colors.HexColor("#ccfbf1")
TEAL_DARK = colors.HexColor("#134e4a")
BLOCKED = colors.HexColor("#e2e8f0")
STRIPE = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#cbd5e1")


def generate_pdf(
    class_name: str,
    session_label: str,
    session_date: str,
    assignment: Dict[str, Optional[str]],
    solo_students: List[str],
    students: List[dict],
    seats: List[dict],
    warnings: List[str] = [],
) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Heading1"],
        fontSize=14, textColor=TEAL_DARK, spaceAfter=2 * mm,
    )
    sub_style = ParagraphStyle(
        "sub", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#64748b"), spaceAfter=4 * mm,
    )
    warn_style = ParagraphStyle(
        "warn", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#d97706"),
    )
    cell_style = ParagraphStyle(
        "cell", parent=styles["Normal"],
        fontSize=8, leading=11, alignment=1,
    )
    solo_style = ParagraphStyle(
        "solo", parent=styles["Normal"],
        fontSize=7, leading=10, alignment=1, textColor=colors.HexColor("#64748b"),
    )

    students_by_id = {s["id"]: s for s in students}
    reverse = {v: k for k, v in assignment.items() if v is not None}

    tables_map: Dict[tuple, Dict[str, dict]] = {}
    for seat in seats:
        key = (seat["row_idx"], seat["col_idx"])
        tables_map.setdefault(key, {})[seat["side"]] = seat

    if not tables_map:
        doc.build([Paragraph("No seating data.", styles["Normal"])])
        return buf.getvalue()

    max_row = max(k[0] for k in tables_map)
    max_col = max(k[1] for k in tables_map)

    page_w = landscape(A4)[0] - 30 * mm
    col_w = page_w / (max_col + 2)

    grid_data = [[""] + [f"Table {c + 1}" for c in range(max_col + 1)]]

    for row in range(max_row + 1):
        cells = [f"Row {row + 1}"]
        for col in range(max_col + 1):
            table_seats = tables_map.get((row, col))
            if not table_seats:
                cells.append("")
                continue

            def name_for(side: str) -> str:
                seat = table_seats.get(side)
                if seat is None:
                    return "—"
                if not seat.get("is_active", True):
                    return "■"
                sid = reverse.get(seat["id"])
                if sid is None:
                    return ""
                s = students_by_id.get(sid)
                return s["name"] if s else "?"

            l_name = name_for("L")
            r_name = name_for("R")
            cells.append(f"{l_name}\n{r_name}")
        grid_data.append(cells)

    col_widths = [col_w * 0.6] + [col_w] * (max_col + 1)
    table = Table(grid_data, colWidths=col_widths, rowHeights=None)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 1), (0, -1), TEAL_LIGHT),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (1, 1), (-1, -1), [colors.white, STRIPE]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))

    label = session_label or session_date
    elements = [
        Paragraph(class_name, title_style),
        Paragraph(f"Session: {label}  ·  {session_date}", sub_style),
        Paragraph("▼  TEACHER / BOARD  ▼", sub_style),
        table,
    ]
    if warnings:
        elements.append(Spacer(1, 4 * mm))
        for w in warnings:
            elements.append(Paragraph(f"⚠  {w}", warn_style))

    doc.build(elements)
    return buf.getvalue()

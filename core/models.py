from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class StudentIn(BaseModel):
    id: str
    name: str
    gender: str = "X"
    is_active: bool = True


class SeatIn(BaseModel):
    id: str
    row_idx: int
    col_idx: int
    side: str
    is_active: bool = True


class RuleIn(BaseModel):
    rule_type: str
    enabled: bool
    priority: int = Field(5, ge=1, le=10)
    config: Dict[str, Any] = {}


class GenerateRequest(BaseModel):
    students: List[StudentIn]
    seats: List[SeatIn]
    rules: List[RuleIn]
    history_pairs: List[List[str]] = []
    last_rows: Dict[str, int] = {}
    mode: str = "weighted"
    use_position_weights: bool = True
    use_pair_weights: bool = True
    position_weights: Dict[str, Dict[str, int]] = {}
    pair_weights: Dict[str, Dict[str, int]] = {}
    pin_overrides: Dict[str, str] = {}
    solo_overrides: List[str] = []


class GenerateResponse(BaseModel):
    assignment: Dict[str, Optional[str]]
    solo_students: List[str]
    unassigned_students: List[str]
    warnings: List[str]
    score: float


class PdfRequest(BaseModel):
    class_name: str
    session_label: str
    session_date: str
    assignment: Dict[str, Optional[str]]
    solo_students: List[str]
    students: List[StudentIn]
    seats: List[SeatIn]
    warnings: List[str] = []


class ExportHistoryRequest(BaseModel):
    sessions: List[Dict[str, Any]]
    students: List[StudentIn]
    seats: List[SeatIn]

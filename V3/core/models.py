from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class ClassCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = ""
    grid_rows: int = Field(5, ge=1, le=20)
    grid_cols: int = Field(4, ge=1, le=10)


class ClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    grid_rows: Optional[int] = Field(None, ge=1, le=20)
    grid_cols: Optional[int] = Field(None, ge=1, le=10)


class ClassOut(BaseModel):
    id: int
    name: str
    description: str
    grid_rows: int
    grid_cols: int
    created_at: str
    updated_at: str


class StudentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    gender: str = Field("X", pattern="^[MFX]$")
    notes: str = ""


class StudentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = Field(None, pattern="^[MFX]$")
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class StudentOut(BaseModel):
    id: int
    class_id: int
    name: str
    gender: str
    notes: str
    is_active: bool
    created_at: str


class SeatOut(BaseModel):
    id: int
    class_id: int
    row_idx: int
    col_idx: int
    side: str
    is_active: bool


class SeatToggle(BaseModel):
    is_active: bool


class PositionWeightUpdate(BaseModel):
    weights: Dict[str, int]  # {seat_id: weight 0-100}

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, v: Dict[str, int]) -> Dict[str, int]:
        for k, w in v.items():
            if not k.isdigit():
                raise ValueError(f"Key {k!r} must be a numeric seat id")
            if not (0 <= w <= 100):
                raise ValueError(f"Weight {w} out of range 0-100")
        return v


class PairWeightUpdate(BaseModel):
    other_student_id: int
    weight: int = Field(..., ge=0, le=100)
    is_override: bool = False


class RuleUpdate(BaseModel):
    enabled: bool
    priority: int = Field(..., ge=1, le=10)
    config: Dict[str, Any] = {}


class GenerateRequest(BaseModel):
    mode: str = Field("weighted", pattern="^(weighted|random)$")
    label: str = ""
    use_position_weights: bool = True
    use_pair_weights: bool = True


class AssignmentPatch(BaseModel):
    student_id: int
    seat_id: Optional[int]  # None = unassign


class SessionOut(BaseModel):
    id: int
    class_id: int
    label: str
    created_at: str
    algorithm_mode: str
    warnings: List[str]


class AssignmentOut(BaseModel):
    student_id: int
    seat_id: Optional[int]
    is_solo: bool

from __future__ import annotations
from typing import Dict, FrozenSet, Set, Tuple

from fastapi import APIRouter

from core.engine import EngineInput, SeatingEngine
from core.models import GenerateRequest, GenerateResponse

router = APIRouter(prefix="/api", tags=["generate"])


@router.post("/generate", response_model=GenerateResponse)
def generate(body: GenerateRequest) -> GenerateResponse:
    position_weights: Dict[Tuple[str, str], int] = {
        (sid, seat_id): w
        for sid, seat_map in body.position_weights.items()
        for seat_id, w in seat_map.items()
    }

    pair_weights: Dict[Tuple[str, str], int] = {}
    for sid_a, partners in body.pair_weights.items():
        for sid_b, w in partners.items():
            key = tuple(sorted([sid_a, sid_b]))
            pair_weights[key] = w

    history_pairs: Set[FrozenSet[str]] = {frozenset(p) for p in body.history_pairs}

    engine = SeatingEngine(
        EngineInput(
            students=[s.model_dump() for s in body.students],
            seats=[s.model_dump() for s in body.seats],
            position_weights=position_weights,
            pair_weights=pair_weights,
            rules=[r.model_dump() for r in body.rules],
            history_pairs=history_pairs,
            last_rows=body.last_rows,
            mode=body.mode,
            use_position_weights=body.use_position_weights,
            use_pair_weights=body.use_pair_weights,
            pin_overrides=body.pin_overrides,
            solo_overrides=set(body.solo_overrides),
        )
    )
    result = engine.generate()

    return GenerateResponse(
        assignment=result.assignment,
        solo_students=result.solo_students,
        unassigned_students=result.unassigned_students,
        warnings=result.warnings,
        score=result.score,
    )

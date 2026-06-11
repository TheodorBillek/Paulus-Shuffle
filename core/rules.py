from __future__ import annotations
import math
from abc import ABC, abstractmethod
from typing import Any, Dict, FrozenSet, List, Set, Tuple


class BaseRule(ABC):
    rule_type: str

    @abstractmethod
    def penalty(
        self,
        assignment: Dict[str, str],
        reverse: Dict[str, str],
        students_by_id: Dict[str, dict],
        seats_by_id: Dict[str, dict],
        table_pairs: List[Tuple[str, str]],
        history_pairs: Set[FrozenSet[str]],
        config: dict,
    ) -> float: ...


class NoRepeatRule(BaseRule):
    rule_type = "no_repeat"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        p = 0.0
        for seat_l, seat_r in table_pairs:
            s1 = reverse.get(seat_l)
            s2 = reverse.get(seat_r)
            if s1 and s2 and frozenset([s1, s2]) in history_pairs:
                p += 100.0
        return p


class GenderMixingRule(BaseRule):
    rule_type = "gender_mixing"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        target = config.get("min_mixed_ratio", 0.5)
        mixed = total = 0
        for seat_l, seat_r in table_pairs:
            s1 = reverse.get(seat_l)
            s2 = reverse.get(seat_r)
            if s1 and s2:
                g1 = students_by_id[s1]["gender"]
                g2 = students_by_id[s2]["gender"]
                if "X" not in (g1, g2):
                    total += 1
                    if g1 != g2:
                        mixed += 1
        if total == 0:
            return 0.0
        shortfall = max(0.0, target - mixed / total)
        return shortfall * 200.0


class RowProgressionRule(BaseRule):
    rule_type = "row_progression"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        last_rows: Dict[str, int] = config.get("last_rows", {})
        p = 0.0
        for student_id, seat_id in assignment.items():
            seat = seats_by_id.get(seat_id)
            if seat and student_id in last_rows and seat["row_idx"] == last_rows[student_id]:
                p += 20.0
        return p


class PositionalRule(BaseRule):
    rule_type = "positional"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        constraints: Dict[str, dict] = config.get("constraints", {})
        p = 0.0
        for sid, bounds in constraints.items():
            seat_id = assignment.get(sid)
            if seat_id is None:
                continue
            seat = seats_by_id.get(seat_id)
            if not seat:
                continue
            row = seat["row_idx"]
            if row < bounds.get("min_row", 0) or row > bounds.get("max_row", 999):
                p += 50.0
        return p


class VicinityRule(BaseRule):
    rule_type = "vicinity"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        separation: Dict[str, List[str]] = config.get("separation_pairs", {})
        min_dist: float = config.get("min_distance", 2.0)
        p = 0.0

        def coords(seat_id: str):
            s = seats_by_id.get(seat_id)
            if not s:
                return None
            return (s["row_idx"], s["col_idx"] * 2 + (0 if s["side"] == "L" else 1))

        for sid, avoid_ids in separation.items():
            seat1 = assignment.get(sid)
            if not seat1:
                continue
            c1 = coords(seat1)
            if not c1:
                continue
            for avoid_id in avoid_ids:
                seat2 = assignment.get(avoid_id)
                if not seat2:
                    continue
                c2 = coords(seat2)
                if not c2:
                    continue
                dist = math.hypot(c1[0] - c2[0], c1[1] - c2[1])
                if dist < min_dist:
                    p += (min_dist - dist) * 40.0
        return p


class FrontRowsFirstRule(BaseRule):
    rule_type = "front_rows_first"

    def penalty(self, assignment, reverse, students_by_id, seats_by_id, table_pairs, history_pairs, config):
        if not assignment:
            return 0.0
        occupied_rows: set = set()
        for seat_id in assignment.values():
            seat = seats_by_id.get(seat_id)
            if seat:
                occupied_rows.add(seat["row_idx"])
        if len(occupied_rows) < 2:
            return 0.0
        gap_penalty = config.get("gap_penalty", 80.0)
        p = 0.0
        for row in range(min(occupied_rows), max(occupied_rows)):
            if row not in occupied_rows:
                p += gap_penalty
        return p


RULE_REGISTRY: Dict[str, BaseRule] = {
    cls.rule_type: cls()  # type: ignore[abstract]
    for cls in [
        NoRepeatRule, GenderMixingRule, RowProgressionRule,
        PositionalRule, VicinityRule, FrontRowsFirstRule,
    ]
}

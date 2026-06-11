from __future__ import annotations
import math
import random
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Set, Tuple

from .rules import RULE_REGISTRY


@dataclass
class EngineInput:
    students: List[dict]
    seats: List[dict]
    position_weights: Dict[Tuple[str, str], int]
    pair_weights: Dict[Tuple[str, str], int]
    rules: List[dict]
    history_pairs: Set[FrozenSet[str]]
    last_rows: Dict[str, int]
    mode: str = "weighted"
    use_position_weights: bool = True
    use_pair_weights: bool = True
    pin_overrides: Dict[str, str] = field(default_factory=dict)
    solo_overrides: Set[str] = field(default_factory=set)


@dataclass
class EngineResult:
    assignment: Dict[str, str]
    solo_students: List[str]
    unassigned_students: List[str]
    score: float
    warnings: List[str]


class SeatingEngine:
    _MAX_ITER = 35_000
    _T0 = 14.0
    _COOLING = 0.9997

    def __init__(self, inp: EngineInput) -> None:
        self.inp = inp
        self.students_by_id: Dict[str, dict] = {
            s["id"]: s for s in inp.students if s.get("is_active", True)
        }
        self.seats_by_id: Dict[str, dict] = {
            s["id"]: s for s in inp.seats if s.get("is_active", True)
        }
        self.table_pairs: List[Tuple[str, str]] = self._build_table_pairs()
        self._no_repeat_enabled = any(
            r["rule_type"] == "no_repeat" and r["enabled"] for r in inp.rules
        )

    def generate(self) -> EngineResult:
        warnings: List[str] = []
        assignment: Dict[str, str] = {}
        used_seats: Set[str] = set()
        used_students: Set[str] = set()

        for sid, seat_id in self.inp.pin_overrides.items():
            if sid in self.students_by_id and seat_id in self.seats_by_id:
                assignment[sid] = seat_id
                used_seats.add(seat_id)
                used_students.add(sid)
            else:
                warnings.append(f"Pin ignored: student or seat not found")

        solo_students: List[str] = []
        for sid in self.inp.solo_overrides:
            if sid in used_students or sid not in self.students_by_id:
                continue
            slot = self._reserve_solo_table(used_seats)
            if slot is not None:
                seat_id, partner_id = slot
                assignment[sid] = seat_id
                used_seats.add(seat_id)
                if partner_id:
                    used_seats.add(partner_id)
                used_students.add(sid)
                solo_students.append(sid)
            else:
                name = self.students_by_id[sid]["name"]
                warnings.append(f"No free table for solo student {name}")

        remaining_students = [s for s in self.students_by_id if s not in used_students]
        remaining_seats = [s for s in self.seats_by_id if s not in used_seats]

        front_first = any(
            r["rule_type"] == "front_rows_first" and r["enabled"] for r in self.inp.rules
        )
        if front_first:
            remaining_seats = self._front_row_seats(len(remaining_students), remaining_seats)

        unassigned: List[str] = []
        if len(remaining_students) > len(remaining_seats):
            overflow = len(remaining_students) - len(remaining_seats)
            warnings.append(f"{overflow} student(s) could not be seated — not enough active seats")
            random.shuffle(remaining_students)
            unassigned = remaining_students[len(remaining_seats):]
            remaining_students = remaining_students[:len(remaining_seats)]

        shuffled_s = remaining_students.copy()
        random.shuffle(shuffled_s)
        compact = self._compact_seat_order(set(remaining_seats), front_first=front_first)
        for sid, seat_id in zip(shuffled_s, compact):
            assignment[sid] = seat_id

        if len(remaining_students) >= 2:
            assignment = self._anneal(assignment, remaining_students)

        reverse = {v: k for k, v in assignment.items()}
        for seat_l, seat_r in self.table_pairs:
            s1 = reverse.get(seat_l)
            s2 = reverse.get(seat_r)
            if (s1 is None) != (s2 is None):
                sid = s1 if s1 is not None else s2
                if sid not in solo_students:
                    solo_students.append(sid)
                    name = self.students_by_id[sid]["name"]
                    warnings.append(f"{name} is seated alone (odd count)")

        warnings.extend(self._collect_rule_warnings(assignment))
        return EngineResult(
            assignment=assignment,
            solo_students=solo_students,
            unassigned_students=unassigned,
            score=self._score(assignment),
            warnings=warnings,
        )

    def _anneal(self, initial: Dict[str, str], movable: List[str]) -> Dict[str, str]:
        assignment = initial.copy()
        best = assignment.copy()
        best_score = self._score(assignment)
        current_score = best_score
        T = self._T0
        for _ in range(self._MAX_ITER):
            s1, s2 = random.sample(movable, 2)
            assignment[s1], assignment[s2] = assignment[s2], assignment[s1]
            new_score = self._score(assignment)
            delta = new_score - current_score
            if delta > 0 or (T > 0.01 and random.random() < math.exp(delta / T)):
                current_score = new_score
                if new_score > best_score:
                    best_score = new_score
                    best = assignment.copy()
            else:
                assignment[s1], assignment[s2] = assignment[s2], assignment[s1]
            T *= self._COOLING
        return best

    def _score(self, assignment: Dict[str, str]) -> float:
        inp = self.inp
        reverse: Dict[str, str] = {v: k for k, v in assignment.items()}
        score = 0.0

        if inp.use_position_weights and inp.mode == "weighted":
            for sid, seat_id in assignment.items():
                score += inp.position_weights.get((sid, seat_id), 50) / 100.0

        for seat_l, seat_r in self.table_pairs:
            if reverse.get(seat_l) is not None and reverse.get(seat_r) is not None:
                score += 1.0

        if inp.use_pair_weights and inp.mode == "weighted":
            for seat_l, seat_r in self.table_pairs:
                s1 = reverse.get(seat_l)
                s2 = reverse.get(seat_r)
                if s1 is None or s2 is None:
                    continue
                key = tuple(sorted([s1, s2]))
                base_w = inp.pair_weights.get(key, 50)
                effective_w = 0 if (self._no_repeat_enabled and frozenset([s1, s2]) in inp.history_pairs) else base_w
                score += effective_w / 100.0

        for rule in inp.rules:
            if not rule["enabled"]:
                continue
            rt = rule["rule_type"]
            if rt in ("pin_to_seat", "seat_alone"):
                continue
            rule_inst = RULE_REGISTRY.get(rt)
            if rule_inst is None:
                continue
            cfg = rule.get("config", {})
            if rt == "row_progression":
                cfg = {**cfg, "last_rows": inp.last_rows}
            penalty = rule_inst.penalty(
                assignment, reverse,
                self.students_by_id, self.seats_by_id,
                self.table_pairs, inp.history_pairs, cfg,
            )
            score -= penalty * (rule["priority"] / 10.0)

        return score

    def _front_row_seats(self, n_students: int, available: List[str]) -> List[str]:
        by_row: Dict[int, List[str]] = {}
        for seat_id in available:
            row = self.seats_by_id[seat_id]["row_idx"]
            by_row.setdefault(row, []).append(seat_id)
        selected: List[str] = []
        for row in sorted(by_row.keys()):
            selected.extend(by_row[row])
            if len(selected) >= n_students:
                break
        return selected

    def _compact_seat_order(self, seat_set: Set[str], front_first: bool = False) -> List[str]:
        if front_first:
            pairs_ordered = sorted(self.table_pairs, key=lambda p: self.seats_by_id[p[0]]["row_idx"])
        else:
            pairs_ordered = self.table_pairs.copy()
            random.shuffle(pairs_ordered)
        ordered: List[str] = []
        for seat_l, seat_r in pairs_ordered:
            if seat_l in seat_set:
                ordered.append(seat_l)
            if seat_r in seat_set:
                ordered.append(seat_r)
        for s in seat_set:
            if s not in ordered:
                ordered.append(s)
        return ordered

    def _build_table_pairs(self) -> List[Tuple[str, str]]:
        tables: Dict[Tuple[int, int], Dict[str, str]] = {}
        for seat in self.seats_by_id.values():
            key = (seat["row_idx"], seat["col_idx"])
            tables.setdefault(key, {})[seat["side"]] = seat["id"]
        return [
            (sides["L"], sides["R"])
            for sides in tables.values()
            if "L" in sides and "R" in sides
        ]

    def _reserve_solo_table(self, used_seats: Set[str]) -> Optional[Tuple[str, Optional[str]]]:
        for seat_l, seat_r in self.table_pairs:
            if seat_l not in used_seats and seat_r not in used_seats:
                return seat_l, seat_r
        for seat in self.seats_by_id:
            if seat not in used_seats:
                return seat, None
        return None

    def _collect_rule_warnings(self, assignment: Dict[str, str]) -> List[str]:
        reverse: Dict[str, str] = {v: k for k, v in assignment.items()}
        warnings: List[str] = []

        if self._no_repeat_enabled:
            for seat_l, seat_r in self.table_pairs:
                s1 = reverse.get(seat_l)
                s2 = reverse.get(seat_r)
                if s1 and s2 and frozenset([s1, s2]) in self.inp.history_pairs:
                    n1 = self.students_by_id[s1]["name"]
                    n2 = self.students_by_id[s2]["name"]
                    warnings.append(f"Repeat pair (unavoidable): {n1} & {n2}")

        gender_rule = next(
            (r for r in self.inp.rules if r["rule_type"] == "gender_mixing" and r["enabled"]), None
        )
        if gender_rule:
            mixed = total = 0
            for seat_l, seat_r in self.table_pairs:
                s1 = reverse.get(seat_l)
                s2 = reverse.get(seat_r)
                if s1 and s2:
                    g1 = self.students_by_id[s1]["gender"]
                    g2 = self.students_by_id[s2]["gender"]
                    if "X" not in (g1, g2):
                        total += 1
                        if g1 != g2:
                            mixed += 1
            if total > 0 and mixed / total < 0.5:
                warnings.append(f"Gender mixing below 50% ({mixed}/{total} mixed pairs)")

        return warnings

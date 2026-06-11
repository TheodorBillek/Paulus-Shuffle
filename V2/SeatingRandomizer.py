from dataclasses import dataclass
from typing import Optional
from datetime import datetime
from pathlib import Path
import random
import csv
import math


class SeatingRandomizer:
    # Bug fix: cap brute-force attempts to prevent infinite loops
    MAX_ATTEMPTS = 50_000

    @dataclass
    class Student:
        name: str
        gender: str
        neighbour: Optional[str] = None

    def __init__(self, students_file: Path, pairing_file: Path, rules: dict):
        self.students_file = Path(students_file)
        self.pairing_file = Path(pairing_file)
        self.rules = rules
        self.students = self.load_csv_students()
        self.last_pairs = self.load_pairing_csv() or set()

    def load_csv_students(self) -> list["SeatingRandomizer.Student"]:
        students = []
        with self.students_file.open(newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            for row in reader:
                students.append(
                    self.Student(name=row["name"], gender=row["gender"], neighbour=None)
                )
        return students

    def store_pairing_csv(self, pairs: Optional[set[frozenset[str]]]) -> None:
        if not pairs:
            return
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = self.pairing_file.with_name(
            f"{self.pairing_file.stem}_{timestamp}{self.pairing_file.suffix}"
        )
        with filepath.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            for pair in pairs:
                writer.writerow(list(pair))

    def load_pairing_csv(self) -> Optional[set[frozenset[str]]]:
        if not self.pairing_file.exists():
            return None
        loaded_pairs: set[frozenset[str]] = set()
        with self.pairing_file.open(newline="", encoding="utf-8") as file:
            reader = csv.reader(file)
            for row in reader:
                if len(row) == 2:
                    loaded_pairs.add(frozenset(row))
        return loaded_pairs if loaded_pairs else None

    def _total_possible_pairs(self) -> int:
        n = len(self.students)
        return n * (n - 1) // 2

    def randomize_neighbours(
        self,
    ) -> tuple[
        list[tuple["SeatingRandomizer.Student", Optional["SeatingRandomizer.Student"]]],
        float,
        list[str],  # warnings
    ]:
        warnings: list[str] = []

        # --- Bug fix: uneven number of students ---
        # Pick one student at random to sit alone; the rest pair up normally.
        solo_student: Optional[SeatingRandomizer.Student] = None
        working_students = self.students[:]
        if len(working_students) % 2 == 1:
            solo_student = random.choice(working_students)
            working_students = [s for s in working_students if s is not solo_student]
            warnings.append(
                f"Odd number of students — {solo_student.name} will sit alone."
            )

        def _shuffle(students):
            s = students[:]
            random.shuffle(s)
            return s

        def _get_pairs(students):
            return [(students[i], students[i + 1]) for i in range(0, len(students) - 1, 2)]

        # --- Bug fix: insufficient students for gender rule ---
        # The rule requires ≥ half of pairs to be mixed-gender.
        # That's only satisfiable when the minority gender count ≥ ceil(pair_count / 2).
        pair_count = len(working_students) // 2
        boys  = sum(1 for s in working_students if s.gender.strip().upper() != "F")
        girls = sum(1 for s in working_students if s.gender.strip().upper() == "F")
        gender_satisfiable = min(boys, girls) >= math.ceil(pair_count / 2)

        active_rules = dict(self.rules)
        if not gender_satisfiable and active_rules.get("different_gender_pairing"):
            active_rules["different_gender_pairing"] = False
            warnings.append(
                f"Gender rule disabled: not enough of one gender "
                f"({boys} boy(s), {girls} girl(s)) to satisfy it."
            )

        # --- Bug fix: exhausted pairings (infinite loop) ---
        # If every possible pair has already been used, reset history and start fresh.
        total_possible = self._total_possible_pairs()
        if len(self.last_pairs) >= total_possible:
            self.last_pairs = set()
            warnings.append(
                "All possible pairings have been used — history has been reset."
            )

        def _validate(students, last_pairs, rules) -> bool:
            def _rule_no_repeat(students, last_pairs) -> bool:
                if not last_pairs:
                    return True
                for s1, s2 in _get_pairs(students):
                    if frozenset([s1.name, s2.name]) in last_pairs:
                        return False
                return True

            def _rule_different_gender_pairing(students) -> bool:
                pairs = _get_pairs(students)
                if not pairs:
                    return True
                mixed = sum(1 for s1, s2 in pairs if s1.gender != s2.gender)
                return mixed >= len(pairs) / 2

            RULE_FUNCTIONS = {
                "no_repeat": _rule_no_repeat,
                "different_gender_pairing": _rule_different_gender_pairing,
            }

            for rule_name, enabled in rules.items():
                if not enabled:
                    continue
                rule_func = RULE_FUNCTIONS[rule_name]
                if rule_name == "no_repeat":
                    if not rule_func(students, last_pairs):
                        return False
                else:
                    if not rule_func(students):
                        return False
            return True

        start_time = datetime.now()
        shuffled = _shuffle(working_students)
        attempts = 0

        while not _validate(shuffled, self.last_pairs, active_rules):
            shuffled = _shuffle(working_students)
            attempts += 1
            if attempts >= self.MAX_ATTEMPTS:
                # Fallback: relax no_repeat so we always terminate
                active_rules["no_repeat"] = False
                warnings.append(
                    f"Could not find a no-repeat arrangement after {self.MAX_ATTEMPTS} "
                    "attempts — no_repeat rule was relaxed for this round."
                )
                break

        stop_time = datetime.now()

        pairs = _get_pairs(shuffled)
        for s1, s2 in pairs:
            s1.neighbour = s2.name
            s2.neighbour = s1.name

        # Append solo student (if any) with None as the second seat
        if solo_student is not None:
            solo_student.neighbour = None
            pairs.append((solo_student, None))

        self.last_pairs = {
            frozenset([s1.name, s2.name]) for s1, s2 in pairs if s2 is not None
        }
        self.store_pairing_csv(self.last_pairs)

        return pairs, (stop_time - start_time).total_seconds(), warnings

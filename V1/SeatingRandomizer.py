from dataclasses import dataclass
from typing import Optional, Set
from datetime import datetime
from pathlib import Path
import random
import csv


class SeatingRandomizer:
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

    def randomize_neighbours(
        self,
    ) -> tuple[
        list[tuple["SeatingRandomizer.Student", "SeatingRandomizer.Student"]], float
    ]:
        def _shuffle(students: list[self.Student]) -> list[self.Student]:
            shuffled = students[:]
            random.shuffle(shuffled)
            return shuffled

        def _get_pairs(
            students: list[self.Student],
        ) -> list[tuple[self.Student, self.Student]]:
            return [
                (students[i], students[i + 1]) for i in range(0, len(students) - 1, 2)
            ]

        def _validate(
            rules: dict,
            students: list[self.Student],
            last_pairs: Optional[set[frozenset[str]]] = None,
        ) -> bool:
            def _rule_no_repeat(
                students: list[self.Student], last_pairs: Optional[set[frozenset[str]]]
            ) -> bool:
                if not last_pairs:
                    return True
                for s1, s2 in _get_pairs(students):
                    if frozenset([s1.name, s2.name]) in last_pairs:
                        return False
                return True

            def _rule_different_gender_pairing(students: list[self.Student]) -> bool:
                pairs = _get_pairs(students)
                if not pairs:
                    return True
                mixed_count = sum(1 for s1, s2 in pairs if s1.gender != s2.gender)
                return mixed_count >= len(pairs) / 2

            RULE_FUNCTIONS = {
                "no_repeat": _rule_no_repeat,
                "different_gender_pairing": _rule_different_gender_pairing,
            }

            for rule_name, enabled in rules.items():
                if not enabled:
                    continue
                rule_func = RULE_FUNCTIONS[rule_name]
                if rule_name == "no_repeat":
                    valid = rule_func(students, last_pairs)
                else:
                    valid = rule_func(students)
                if not valid:
                    return False

            return True

        start_time = datetime.now()
        shuffled = _shuffle(self.students)
        while not _validate(self.rules, shuffled, self.last_pairs):
            shuffled = _shuffle(self.students)
        stop_time = datetime.now()

        pairs = _get_pairs(shuffled)
        for s1, s2 in pairs:
            s1.neighbour = s2.name
            s2.neighbour = s1.name

        self.last_pairs = {frozenset([s1.name, s2.name]) for s1, s2 in pairs}
        self.store_pairing_csv(self.last_pairs)

        return pairs, (stop_time - start_time).total_seconds()


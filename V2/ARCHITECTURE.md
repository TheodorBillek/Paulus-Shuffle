# Paulus Shuffle V2 — Architecture Plan

> This is the agreed design before implementation begins.
> Nothing in this file is written code — it is a blueprint.

---

## 1. Decisions Made

| Question             | Decision                                 | Reason                                                                                                          |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| UI library           | **PySide6**                              | LGPL — free for school/non-commercial use. Nearly identical API to PyQt6. More reliable DnD than customtkinter. |
| History              | **Automatic `history.json`**             | No manual loading. App tracks rounds silently. Teacher never touches it.                                        |
| Multi-class          | **Designed for it, not yet implemented** | File layout supports it; UI class-switcher is a later task.                                                     |
| Per-student settings | **JSON config**                          | CSV stays simple (`name, gender` only).                                                                         |
| Config format        | **Plain JSON**                           | Import/export supported in UI.                                                                                  |
| PDF export           | **reportlab**                            | Reliable, well-documented, no system dependencies.                                                              |

---

## 2. Core Concept: The Grid

A classroom is a **matrix of seats**, not a flat list of pairs.

```
Row 0:  [Table 0: L R]  [Table 1: L R]  [Table 2: L R]
Row 1:  [Table 0: L R]  [Table 1: L R]  [Table 2: L R]
Row 2:  [Table 0: L R]  [Table 1: L R]  [Table 2: L R]
```

- A **seat** is addressed by `(row, table, side)` where side ∈ {L, R}.
- A **table** holds 2 seats. One may be empty (solo student, or gap in layout).
- A **row** holds N tables. N is set by the teacher.
- The grid is rectangular: all rows have the same number of tables.

### Neighbour Scopes

| Scope                                         | What it covers                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Table neighbour** (always tracked)          | The other seat at the same table. The primary pairing unit for no_repeat and gender rules.                             |
| **Extended neighbour** (optional, toggleable) | The seats immediately to the left and right of your table in the same row — i.e. the nearest seats on adjacent tables. |
| **Vicinity** (for proximity rules)            | All 8 cells surrounding your seat in the grid (left, right, front, back, 4 diagonals). Used for trouble-maker rules.   |

---

## 3. Data Models

### `Student`

```
name:     str
gender:   str  ("M" / "F" / "X")
```

All per-student behaviour settings (pinned, solo, positional) live in config, not in the student file.

### `Seat`

```
row:      int
table:    int
side:     "L" | "R"
student:  Student | None
pinned:   bool   (algorithm will not move this seat)
```

### `Classroom`

```
rows:           int
tables_per_row: int
seats:          dict[(row, table, side) → Seat]

get_table_neighbour(seat)      → Seat | None
get_extended_neighbours(seat)  → list[Seat]
get_vicinity(seat)             → list[Seat]   # 8-directional
get_all_pairs()                → list[(Seat, Seat)]  # only table-neighbour pairs
```

### `History`

Stored in `history.json`. One entry per round.

```json
{
  "rounds": [
    {
      "date": "2026-04-09T10:30:00",
      "pairs": [
        ["Alice", "Bob"],
        ["Carol", "Dave"]
      ],
      "rows": { "Alice": 0, "Bob": 0, "Carol": 1, "Dave": 1 }
    }
  ]
}
```

- `pairs`: table-neighbour pairs that round (for no_repeat)
- `rows`: which row each student sat in (for row_progression rule)

---

## 4. Rules System

Every rule is a class with:

- `name: str`
- `priority: int` (higher = relaxed first when no solution found; 0 = never relaxed)
- `enabled: bool`
- `validate(classroom, history) → bool`

Rules are tried in priority order when relaxing. The engine keeps relaxing lowest-priority rules until a valid arrangement is found or all rules are relaxed.

### Rule catalogue

| Rule              | Priority default | Description                                                                                                |
| ----------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `no_repeat`       | 2                | No table-neighbour pair from the last round repeats.                                                       |
| `gender_mixing`   | 3                | ≥ half of all table pairs must be mixed-gender. Skipped automatically if gender counts make it impossible. |
| `row_progression` | 4                | Each student must sit in a different row than their previous round.                                        |
| `pin_to_seat`     | 0                | A named student is locked to a specific (row, table, side). Never relaxed.                                 |
| `seat_alone`      | 0                | A named student always gets a solo seat (no table neighbour). Never relaxed.                               |
| `positional`      | 1                | A named student must (or must not) sit in a specified row range.                                           |
| `vicinity`        | 1                | Two named students must not appear within each other's 8-cell vicinity. For trouble makers.                |

---

## 5. Config File Schema (`config.json`)

```json
{
  "classroom": {
    "rows": 5,
    "tables_per_row": 4,
    "neighbour_scope": "table"
  },
  "rules": [
    { "name": "no_repeat", "enabled": true, "priority": 2 },
    { "name": "gender_mixing", "enabled": true, "priority": 3 },
    { "name": "row_progression", "enabled": false, "priority": 4 },
    {
      "name": "pin_to_seat",
      "enabled": false,
      "priority": 0,
      "params": {
        "student": "Alice Example",
        "row": 0,
        "table": 0,
        "side": "L"
      }
    },
    {
      "name": "seat_alone",
      "enabled": false,
      "priority": 0,
      "params": { "student": "Carol Example" }
    },
    {
      "name": "positional",
      "enabled": false,
      "priority": 1,
      "params": { "student": "Dave Example", "mode": "must", "rows": [0, 1] }
    },
    {
      "name": "vicinity",
      "enabled": false,
      "priority": 1,
      "params": { "students": ["Eve Example", "Frank Example"] }
    }
  ]
}
```

`neighbour_scope`: `"table"` (default) or `"extended"` (table + adjacent tables in same row).

---

## 6. Algorithm (Engine)

```
Input:  students list, classroom config, history, rules (ordered by priority desc)
Output: populated Classroom, warnings list

1. Apply pinned seats (place pinned students first, mark those seats locked).
2. Apply seat_alone (reserve solo seats).
3. Shuffle remaining students.
4. Assign to remaining seats left-to-right, row by row.
5. Validate all enabled rules.
6. If invalid: re-shuffle and retry (up to MAX_ATTEMPTS = 50 000).
7. If still invalid after MAX_ATTEMPTS:
   - Relax the lowest-priority rule that is not priority-0.
   - Reset attempt counter, retry.
   - Repeat until valid or all relaxable rules are off → return best effort + warnings.
8. Save round to history.json.
9. Return Classroom + warnings.
```

---

## 7. File & Module Structure

```
V2/
├── main.py              # Entry point — launches PySide6 app
├── classroom.py         # Classroom, Seat data models + neighbour helpers
├── student.py           # Student dataclass
├── engine.py            # Seating algorithm
├── rules.py             # All Rule classes + registry
├── config.py            # Load/save config.json
├── history.py           # Load/save history.json
│
├── gui/
│   ├── main_window.py   # Top-level PySide6 window, navigation
│   ├── grid_view.py     # Visual drag-and-drop seating grid (Canvas/QGraphicsScene)
│   ├── rule_builder.py  # Form-based rule editor
│   ├── settings_page.py # Classroom layout + app-wide settings
│   └── export.py        # PDF export via reportlab
│
├── config.json          # Default config (shipped with app)
├── history.json         # Auto-managed (created on first run, never shipped)
├── requirements.txt
├── build.bat
│
├── sample/
│   └── students.csv     # Sample student list (name, gender)
│
├── ARCHITECTURE.md      # This file
└── ToDo.md
```

### Designed for multi-class (not yet implemented)

The intent is that each class is a **folder** containing its own `config.json`, `history.json`, and `students.csv`. The app will eventually have a class-switcher that opens/closes class folders. For now, the app works on one class at a time from a single working directory.

---

## 8. UI Screens

### Main Window

- Sidebar or tab bar: **Seating** | **Rules** | **Settings**
- Status bar: current class name, last generated date, any active warnings.

### Seating Screen (primary)

- Visual grid of the classroom. Each seat cell shows: student name + gender indicator (colour or icon).
- Empty seats: greyed-out blank cell.
- Controls: **Generate**, **Export PDF**, **Import Students**, **Load Config**, **Save Config**.
- Drag-and-drop: drag a student from one cell to another. Pinned cells visually marked and reject drops.
- Select a row or column → move all at once.

### Rules Screen

- List of all rules with enable/disable toggle and priority field.
- "Add rule" opens a form for that rule type (student picker, row range, etc.).
- Save writes back to `config.json`.

### Settings Screen

- Classroom layout: rows, tables per row.
- Neighbour scope: Table only / Extended (table + adjacent).
- Simple mode toggle: hides Rules screen and advanced settings.

---

## 9. Dependencies

```
PySide6>=6.6.0
reportlab>=4.0.0
pillow>=10.0.0       # icon handling

# Build only:
# pyinstaller>=6.0.0
```

---

## 10. Open Items (not yet decided — flag before implementing)

- Simple mode: which rules/settings should be hidden? Needs teacher input.
- PDF layout: portrait vs landscape, font size, how much info per cell?
- History retention: keep all rounds forever, or cap at N rounds?

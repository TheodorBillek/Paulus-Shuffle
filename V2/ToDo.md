# To-Do — V2

> **V2 is a complete rewrite.** The data model moves from a flat pairs/list to a **grid (matrix) of tables**.
> UI library: **PyQt6** (replaces customtkinter — needed for reliable drag-and-drop).
> Rules stored in a **JSON config file** (importable/exportable).

---

## Architecture Notes (decisions made, not tasks)

- A **table** = 2 seats (left + right). A **row** = multiple tables side-by-side.
- **Neighbour** = table partner only (default), OR table partner + the person immediately left/right on an adjacent table (extended mode — toggleable setting).
- **Vicinity** = all 8 surrounding grid cells (left, right, front, back, 4 diagonals). Used for trouble-maker proximity rules.
- **Gender** must be shown visually on every seat cell in the diagram.
- **Empty seats** render as blank/greyed-out — keep it minimal.
- Classroom layout (rows × tables per row) is always teacher-specified; sensible defaults are provided.

---

## Bug Fixes (carried over from V1 — already fixed in V2 core)

- [x] **Infinite loop on exhausted pairings** — Precomputes total possible pairs; if all are exhausted, resets history. Also caps brute-force at 50 000 attempts and relaxes no_repeat as a final fallback.
- [x] **Uneven number of students** — Randomly picks one student to sit alone each round; shown as "(solo)" in the results. Solo student is excluded from the saved pairings CSV.
- [x] **Insufficient students for gender rule** — Checks satisfiability before shuffling (minority gender count ≥ ⌈pairs/2⌉); disables the rule and shows a warning when it cannot be met.

---

## Multi-Class Support (designed for, not yet implemented)

- [ ] **Class folder model** — Each class is a folder containing its own `config.json`, `history.json`, and `students.csv`. Engine and GUI are already designed to work with a single working-directory class; this task adds the switcher on top.
- [ ] **Class switcher UI** — Dropdown or sidebar list to open/close class folders within the app. "New class" creates a new folder with a default config.

---

## Foundation — Grid Data Model

- [ ] **Classroom grid model (`classroom.py`)** — Replace the flat list with a proper `Classroom` class: rows × tables per row, each table holding a left-seat and right-seat. A seat holds a reference to a `Student` or is empty. Expose helpers: `get_table_neighbour(seat)`, `get_extended_neighbours(seat)`, `get_vicinity(seat)`.
- [ ] **Student model update** — Extend `Student` with: `row`, `table`, `side` (L/R), `gender` (M/F/Other), `pinned` (bool), `solo` (bool).
- [ ] **Grid-based algorithm** — Rewrite `SeatingRandomizer` to work on the grid: assign students to seats in the grid, validate rules spatially, and return a `Classroom` object rather than a flat list of pairs.

---

## Config & Rules

- [ ] **JSON config file** — Define schema for `config.json`: classroom layout (rows, tables_per_row, neighbour_scope), list of rules with enabled flag and priority weight. Support import/export from the UI.
- [ ] **Rule weighting / priority system** — Each rule has a numeric priority. When no valid arrangement is found within MAX_ATTEMPTS, relax rules from lowest priority first. Non-negotiable rules get priority 0 (never relaxed).
- [ ] **Rule: no_repeat** — Already exists conceptually; adapt to grid model. Uses table-neighbour pairs as the repeat unit.
- [ ] **Rule: gender_mixing** — Already exists; adapt to grid model.
- [ ] **Rule: row_progression** — Student must be placed in a different row than their last seating. Stored per-student in history.
- [ ] **Rule: pin_to_seat** — A specific student is locked to a specific grid cell (row, table, side). Algorithm never moves them.
- [ ] **Rule: seat_alone** — A specific student is always assigned a solo seat (table with only one occupant). Configured per-student.
- [ ] **Rule: positional** — Grid-area constraints, e.g. "this student must sit in the front 2 rows" or "must not sit in the back row."
- [ ] **Rule: vicinity (proximity)** — Two named students must not appear within each other's 8-cell vicinity. Used for trouble makers. Multiple pairs can be configured.

---

## User Interface (PyQt6)

- [ ] **Drag-and-drop seating grid** — Main view is a visual classroom grid. Each cell is a seat. Students can be dragged between seats. Workflow: configure layout → load students → Generate → manually adjust.
  - Drag individual students between seats
  - Pin a student or entire row/column (Generate won't move them)
  - Move an entire row or column at once
- [ ] **Gender display on grid** — Each occupied seat shows the student's gender visually (colour tint, icon, or label). Keep it minimal.
- [ ] **Visual seating diagram with export** — Display the final arrangement as a clean grid. Export to PDF (using reportlab or similar — reliability over aesthetics). Must work reliably.
- [ ] **GUI rule builder** — Create, edit, and delete rules through a form-based interface rather than editing JSON directly. Changes write back to config.json.
- [ ] **Config import/export UI** — Buttons to load a config.json from disk or save the current config to a file.
- [ ] **General settings page** — Classroom layout (rows, tables per row, neighbour scope), language, rule defaults.
- [ ] **Simple mode toggle** — Hides advanced features (vicinity rules, positional rules, priority weights) for less experienced users.

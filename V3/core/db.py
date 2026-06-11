import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "paulus.db"

_SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS classes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    grid_rows   INTEGER NOT NULL DEFAULT 5,
    grid_cols   INTEGER NOT NULL DEFAULT 4,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    gender     TEXT    NOT NULL DEFAULT 'X' CHECK(gender IN ('M','F','X')),
    notes      TEXT    NOT NULL DEFAULT '',
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS seats (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    row_idx   INTEGER NOT NULL,
    col_idx   INTEGER NOT NULL,
    side      TEXT    NOT NULL CHECK(side IN ('L','R')),
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(class_id, row_idx, col_idx, side)
);

CREATE TABLE IF NOT EXISTS student_seat_weights (
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    seat_id    INTEGER NOT NULL REFERENCES seats(id)    ON DELETE CASCADE,
    weight     INTEGER NOT NULL DEFAULT 50 CHECK(weight BETWEEN 0 AND 100),
    PRIMARY KEY (student_id, seat_id)
);

CREATE TABLE IF NOT EXISTS student_pair_weights (
    student1_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    student2_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    weight      INTEGER NOT NULL DEFAULT 50 CHECK(weight BETWEEN 0 AND 100),
    is_override INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (student1_id, student2_id),
    CHECK(student1_id < student2_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id       INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    label          TEXT    NOT NULL DEFAULT '',
    created_at     TEXT    NOT NULL,
    algorithm_mode TEXT    NOT NULL DEFAULT 'weighted',
    warnings       TEXT    NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS assignments (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    seat_id    INTEGER          REFERENCES seats(id),
    is_solo    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS rules (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    rule_type TEXT    NOT NULL,
    enabled   INTEGER NOT NULL DEFAULT 1,
    priority  INTEGER NOT NULL DEFAULT 5,
    config    TEXT    NOT NULL DEFAULT '{}',
    UNIQUE(class_id, rule_type)
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

_DEFAULT_RULES = [
    ("no_repeat",       1, 8,  "{}"),
    ("gender_mixing",   1, 5,  "{}"),
    ("row_progression", 0, 3,  "{}"),
    ("positional",      0, 7,  "{}"),
    ("vicinity",        0, 6,  "{}"),
    ("front_rows_first",0, 6,  "{}"),
    ("pin_to_seat",     0, 10, "{}"),
    ("seat_alone",      0, 10, "{}"),
]


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.executescript(_SCHEMA)


@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def seed_default_rules(db: sqlite3.Connection, class_id: int) -> None:
    for rule_type, enabled, priority, config in _DEFAULT_RULES:
        db.execute(
            """INSERT OR IGNORE INTO rules (class_id, rule_type, enabled, priority, config)
               VALUES (?, ?, ?, ?, ?)""",
            (class_id, rule_type, enabled, priority, config),
        )


def seed_default_seats(db: sqlite3.Connection, class_id: int, rows: int, cols: int) -> None:
    for row in range(rows):
        for col in range(cols):
            for side in ("L", "R"):
                db.execute(
                    """INSERT OR IGNORE INTO seats (class_id, row_idx, col_idx, side, is_active)
                       VALUES (?, ?, ?, ?, 1)""",
                    (class_id, row, col, side),
                )

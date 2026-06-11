# Paulus Shuffle V3 — Roadmap & Future Work

## Multi-User / SaaS Architecture

The current build is single-user (no auth). The planned upgrade path:

### Phase 1 — Auth & Multi-Teacher
- Add user accounts (email + password, bcrypt hashed)
- Each class is owned by a teacher
- JWT-based session auth
- Simple login page added to the SPA

### Phase 2 — School Organisations
- Introduce an `organisations` table (one per school)
- Teachers belong to one or more organisations
- Org-level admin role can:
  - Import all students school-wide from a CSV or SIS export
  - Manage teacher accounts
  - Set org-wide defaults (classroom size, rules)
- When creating a class, teacher can select students from the school-wide roster
  instead of typing names manually

### Phase 3 — Full SaaS
- Migrate from SQLite → PostgreSQL (see note below)
- Multi-region support
- Billing / subscription tiers
- School admin dashboard

---

## Database Migration — SQLite → PostgreSQL

The schema is designed to be portable. Migration steps when ready:
1. Export SQLite data via `sqlite3 paulus.db .dump > dump.sql`
2. Adapt dialect (INTEGER PRIMARY KEY → SERIAL, TEXT dates → TIMESTAMPTZ)
3. Swap `sqlite3` for `asyncpg` or `psycopg2` in `core/db.py`
4. Add a `DATABASE_URL` env var and update the connection factory

All queries use standard SQL — no SQLite-specific features.

---

## Image Support

Planned: teacher can upload a photo per student.
- Store image as a file on disk (`data/images/{student_id}.jpg`)
- Or base64-encoded blob in the `students` table
- Display in the classroom grid chips and the PDF export
- Note: images in PDFs add significant size; add a "compact PDF" toggle

---

## Other Planned Features

- **Undo/Redo** for manual drag-and-drop changes in the grid
- **Print-optimised CSS** as an alternative to PDF export
- **Admin import all students** to then be selected by teachers so they dont have to import all students
- **Seat labels** — custom labels per seat (e.g., "Window", "Door", "Handicap")
- **Multiple classrooms per class** — a class can have saved layouts for different rooms
- **API key auth** for headless/server use

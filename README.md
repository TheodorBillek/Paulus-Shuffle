# Shuffle Service

A smart classroom seating randomizer. Stateless FastAPI web app — all class data lives in your browser's localStorage, nothing is stored server-side.

## Features

- Drag-and-drop seating grid
- Configurable soft rules: no-repeat pairs, gender mixing, row progression, front-rows-first, proximity separation, row restrictions
- Hard overrides: pin to seat, seat alone
- Classroom editor with per-seat blocking
- Student CSV import/export
- Export to CSV, XLSX, or PDF
- Full-screen presentation mode
- EN / DE language support

## Running

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Then open `http://localhost:8000`.

## License

[AGPL-3.0](LICENSE.txt) — free to use and fork, forks must remain open source.  
A [commercial license](LICENSE-COMMERCIAL.txt) is available for closed-source or proprietary use.

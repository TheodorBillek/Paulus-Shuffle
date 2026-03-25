# Paulus Shuffle

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

A smart classroom seating tool that pairs students fairly every session.
Avoids repeating pairs from the previous session and ensures at least half of all pairs are mixed-gender.

---

## Features

- Import student lists from a CSV file
- Load previous session's pairings to prevent repetition
- Randomise seating with two built-in rules:
  - **No repeat** — no pair from the last session appears again
  - **Gender balance** — at least half of all pairs must be mixed-gender
- Download the new pairings as a CSV, ready for next session
- Modern dark-themed GUI — no terminal required

---

## Running from source

**Requirements:** Python 3.10+

```bash
pip install -r requirements.txt
python gui.py
```

---

## Building a standalone executable (Windows)

**Step 1 — install build tools**

```bash
pip install -r requirements.txt
pip install pyinstaller
```

**Step 2 — generate the app icon**

```bash
python create_icon.py
```

This creates `icon.png` and `icon.ico` in the project root.

**Step 3 — build**

```bash
build.bat
```

The finished executable is at `dist\paulus-shuffle.exe`.
No Python installation required to run it.

---

## Workflow

1. Click **Import Students** and select your `input.csv`
2. Click **Import Last Pairings** and select your `last_pairs.csv` *(skip on first run)*
3. Click **Randomise** to generate new seating pairs
4. Click **Download Pairings** to save the result — use this file as next session's *Last Pairings*

---

## CSV Format

**Students (`input.csv`)**

```csv
name,gender
Alice Example,F
Bob Example,M
```

**Pairings (`last_pairs.csv`)**

```csv
Alice Example,Bob Example
Carol Example,Dave Example
```

See the `sample/` folder for example files.

---

## Project Structure

```
├── SeatingRandomizer.py   # Core randomisation engine
├── gui.py                 # Graphical user interface
├── create_icon.py         # Generates icon.png / icon.ico (run before building)
├── build.bat              # Windows build script → dist/paulus-shuffle.exe
├── requirements.txt       # Python dependencies
├── sample/
│   ├── input.csv          # Example student list
│   └── last_pairs.csv     # Example pairing data
└── old/                   # Design sketches & early notes
```

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).
See [LICENSE.txt](LICENSE.txt) for the full text.

Copyright (C) 2026 Theodor Billek

---

## Credits

This README was written by **Claude Sonnet 4.6**, Anthropic's AI model.

> _Written with [Claude Code](https://claude.ai/claude-code) — Anthropic's official CLI for Claude. Note: all other code without this tag was written by the project author._

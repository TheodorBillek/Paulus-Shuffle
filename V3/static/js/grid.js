'use strict';

/* ═══════════════════════════════════════════════════════════════════
   Grid — classroom renderer + drag-and-drop + weight editor overlay
   ═══════════════════════════════════════════════════════════════════ */

const Grid = (() => {

  // ── State ──────────────────────────────────────────────────────────
  let _seats          = [];   // [{id, row_idx, col_idx, side, is_active}]
  let _students       = {};   // {id: {id, name, gender, is_active}}
  let _assignment     = {};   // {student_id: seat_id}
  let _soloSet        = new Set();
  let _onAssignChange = null; // callback({student_id, seat_id})
  let _onSeatToggle   = null; // callback(seat_id, is_active)
  let _layoutEditMode = false;
  let _weightMode     = false;
  let _posWeights     = {};   // {seat_id: weight} for currently selected student

  // ── Public ─────────────────────────────────────────────────────────

  function render(opts = {}) {
    const {
      seats, students, assignment, soloSet = new Set(),
      onAssignChange, onSeatToggle,
      layoutEditMode = false, weightMode = false, posWeights = {},
    } = opts;

    _seats          = seats || _seats;
    _students       = students || _students;
    _assignment     = assignment || _assignment;
    _soloSet        = soloSet;
    _onAssignChange = onAssignChange || _onAssignChange;
    _onSeatToggle   = onSeatToggle   || _onSeatToggle;
    _layoutEditMode = layoutEditMode;
    _weightMode     = weightMode;
    _posWeights     = posWeights;

    const container = document.getElementById('classroom-grid');
    container.innerHTML = '';

    // Teacher bar
    const tb = document.createElement('div');
    tb.className = 'teacher-bar';
    tb.setAttribute('data-i18n', 'teacher_front');
    tb.textContent = I18n.t('teacher_front');
    container.appendChild(tb);

    // Group seats into tables keyed by (row, col)
    const tables = _groupTables(_seats);
    const maxRow  = _seats.length ? Math.max(..._seats.map(s => s.row_idx)) : 0;
    const colsPerRow = {};
    for (const seat of _seats) {
      if (!colsPerRow[seat.row_idx] || seat.col_idx > colsPerRow[seat.row_idx]) {
        colsPerRow[seat.row_idx] = seat.col_idx;
      }
    }

    for (let row = 0; row <= maxRow; row++) {
      const maxCol = colsPerRow[row] ?? 0;
      const rowDiv = document.createElement('div');
      rowDiv.className = 'classroom-row';
      rowDiv.dataset.row = row;

      const numEl = document.createElement('div');
      numEl.className = 'row-number';
      numEl.textContent = row + 1;
      rowDiv.appendChild(numEl);

      for (let col = 0; col <= maxCol; col++) {
        const key = `${row},${col}`;
        const table = tables[key];
        if (!table) continue;
        rowDiv.appendChild(_buildTable(table, row, col));
      }
      container.appendChild(rowDiv);
    }
  }

  function updateAssignment(assignment) {
    _assignment = assignment;
    // Re-render only the chips (faster than full re-render)
    document.querySelectorAll('.seat-slot').forEach(slot => {
      const seatId = parseInt(slot.dataset.seatId);
      const prev = slot.querySelector('.student-chip');
      if (prev) prev.remove();
      const sid = _studentAtSeat(seatId);
      if (sid) slot.appendChild(_buildChip(sid, seatId));
      slot.classList.toggle('drag-over', false);
    });

    document.querySelectorAll('.unassigned-chip').forEach(c => c.remove());
    _renderUnassigned();
  }

  function setWeightMode(enabled, posWeights = {}) {
    _weightMode = enabled;
    _posWeights = posWeights;
    // Refresh weight badges on seat slots
    document.querySelectorAll('.weight-seat-val').forEach(el => el.remove());
    document.querySelectorAll('.seat-slot').forEach(slot => {
      const seatId = parseInt(slot.dataset.seatId);
      _applyWeightStyle(slot, seatId);
    });
  }

  // ── Internal helpers ───────────────────────────────────────────────

  function _groupTables(seats) {
    const map = {};
    for (const seat of seats) {
      const key = `${seat.row_idx},${seat.col_idx}`;
      if (!map[key]) map[key] = { L: null, R: null, row: seat.row_idx, col: seat.col_idx };
      map[key][seat.side] = seat;
    }
    return map;
  }

  function _buildTable(table, row, col) {
    const div = document.createElement('div');
    div.className = 'classroom-table';
    div.dataset.row = row;
    div.dataset.col = col;

    for (const side of ['L', 'R']) {
      const seat = table[side];
      if (seat) {
        div.appendChild(_buildSlot(seat));
      } else {
        // Seat doesn't exist — empty placeholder
        const ph = document.createElement('div');
        ph.className = 'seat-slot';
        div.appendChild(ph);
      }
    }
    return div;
  }

  function _buildSlot(seat) {
    const slot = document.createElement('div');
    slot.className = 'seat-slot';
    slot.dataset.seatId = seat.id;
    slot.dataset.side = seat.side;

    if (!seat.is_active) {
      slot.classList.add('seat-disabled');
      if (_layoutEditMode) {
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', () => _onSeatToggle?.(seat.id, true));
      }
      return slot;
    }

    if (_layoutEditMode) {
      // In layout edit mode, click to disable
      slot.style.cursor = 'pointer';
      slot.title = 'Click to disable seat';
      slot.addEventListener('click', () => _onSeatToggle?.(seat.id, false));
    } else {
      _setupDropTarget(slot);
    }

    _applyWeightStyle(slot, seat.id);

    const sid = _studentAtSeat(seat.id);
    if (sid) {
      slot.appendChild(_buildChip(sid, seat.id));
    }

    return slot;
  }

  function _applyWeightStyle(slot, seatId) {
    slot.removeAttribute('data-weight');
    if (_weightMode && _posWeights) {
      const w = _posWeights[seatId] ?? 50;
      if (w >= 70) slot.dataset.weight = 'high';
      else if (w <= 30) slot.dataset.weight = 'low';
    }
  }

  function _buildChip(studentId, seatId) {
    const student = _students[studentId];
    if (!student) return document.createTextNode('');

    const chip = document.createElement('div');
    chip.className = `student-chip gender-${student.gender.toLowerCase()}`;
    chip.draggable = !_layoutEditMode;
    chip.dataset.studentId = studentId;
    chip.dataset.fromSeatId = seatId;

    const nameEl = document.createElement('div');
    nameEl.className = 'chip-name';
    nameEl.textContent = _truncate(student.name, 18);
    chip.appendChild(nameEl);

    const genderEl = document.createElement('div');
    genderEl.className = 'chip-gender';
    genderEl.textContent = student.gender;
    chip.appendChild(genderEl);

    if (_soloSet.has(studentId)) {
      const badge = document.createElement('div');
      badge.className = 'chip-solo-badge';
      badge.textContent = '1';
      chip.appendChild(badge);
    }

    if (_weightMode && _posWeights) {
      const w = _posWeights[seatId] ?? 50;
      const badge = document.createElement('div');
      badge.className = 'seat-weight-badge';
      badge.textContent = w;
      chip.appendChild(badge);
    }

    _setupDragSource(chip);
    return chip;
  }

  function _studentAtSeat(seatId) {
    for (const [sid, seat] of Object.entries(_assignment)) {
      if (seat === seatId) return parseInt(sid);
    }
    return null;
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────

  let _dragStudentId = null;
  let _dragFromSeat  = null;  // null = from unassigned panel

  function _setupDragSource(chip) {
    chip.addEventListener('dragstart', e => {
      _dragStudentId = parseInt(chip.dataset.studentId);
      _dragFromSeat  = chip.dataset.fromSeatId ? parseInt(chip.dataset.fromSeatId) : null;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragStudentId);
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      _clearDropHighlights();
    });
  }

  function _setupDropTarget(slot) {
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const targetSeatId = parseInt(slot.dataset.seatId);
      _handleDrop(targetSeatId);
    });
  }

  function _handleDrop(targetSeatId) {
    if (_dragStudentId === null) return;
    const occupant = _studentAtSeat(targetSeatId);

    if (_dragFromSeat !== null) {
      // From a seat — swap
      _assignment[_dragStudentId] = targetSeatId;
      if (occupant !== null) {
        _assignment[occupant] = _dragFromSeat;
        _onAssignChange?.([
          { student_id: _dragStudentId, seat_id: targetSeatId },
          { student_id: occupant,       seat_id: _dragFromSeat },
        ]);
      } else {
        _onAssignChange?.([
          { student_id: _dragStudentId, seat_id: targetSeatId },
        ]);
      }
    } else {
      // From unassigned panel
      if (occupant !== null) {
        // Swap: occupant goes to unassigned
        delete _assignment[occupant];
        _onAssignChange?.([
          { student_id: _dragStudentId, seat_id: targetSeatId },
          { student_id: occupant,       seat_id: null },
        ]);
      } else {
        _onAssignChange?.([
          { student_id: _dragStudentId, seat_id: targetSeatId },
        ]);
      }
      _assignment[_dragStudentId] = targetSeatId;
    }

    updateAssignment(_assignment);
    _dragStudentId = null;
    _dragFromSeat  = null;
  }

  function _clearDropHighlights() {
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  // ── Unassigned panel ───────────────────────────────────────────────

  function _renderUnassigned() {
    const list = document.getElementById('unassigned-list');
    if (!list) return;

    const assignedIds = new Set(Object.keys(_assignment).map(Number));
    const unassigned  = Object.values(_students).filter(s => s.is_active && !assignedIds.has(s.id));

    for (const student of unassigned.sort((a, b) => a.name.localeCompare(b.name))) {
      const chip = document.createElement('div');
      chip.className = `unassigned-chip gender-${student.gender.toLowerCase()}`;
      chip.draggable = true;
      chip.dataset.studentId = student.id;
      chip.dataset.fromSeatId = '';
      chip.textContent = _truncate(student.name, 16);
      _setupDragSource(chip);
      list.appendChild(chip);
    }

    // Unassigned list itself is also a drop target (to un-seat a student)
    list.addEventListener('dragover', e => {
      e.preventDefault();
      list.classList.add('drag-over');
    });
    list.addEventListener('dragleave', () => list.classList.remove('drag-over'));
    list.addEventListener('drop', e => {
      e.preventDefault();
      list.classList.remove('drag-over');
      if (_dragStudentId !== null && _dragFromSeat !== null) {
        delete _assignment[_dragStudentId];
        _onAssignChange?.([{ student_id: _dragStudentId, seat_id: null }]);
        updateAssignment(_assignment);
        _dragStudentId = null;
        _dragFromSeat  = null;
      }
    });
  }

  function initUnassigned(students, assignment) {
    _students   = students;
    _assignment = assignment;
    _renderUnassigned();
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function _truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  return { render, updateAssignment, setWeightMode, initUnassigned };
})();

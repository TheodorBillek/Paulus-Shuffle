'use strict';

const Grid = (() => {
  let _seats = [];
  let _students = {};
  let _assignment = {};
  let _soloSet = new Set();
  let _editMode = false;
  let _onAssign = null;
  let _onSeatToggle = null;

  let _containerId = 'classroom-grid';
  let _dragStudentId = null;
  let _dragFromSeatId = null;

  // ── Public API ────────────────────────────────────────────────────

  function render(opts) {
    const { seats, students, assignment, soloSet, editMode, onAssign, onSeatToggle, containerId } = opts;
    _seats        = seats || _seats;
    _students     = students || _students;
    _assignment   = assignment ? { ...assignment } : _assignment;
    _soloSet      = soloSet || new Set();
    _editMode     = editMode || false;
    _onAssign     = onAssign || _onAssign;
    _onSeatToggle = onSeatToggle || _onSeatToggle;
    _containerId  = containerId || 'classroom-grid';
    _paint();
  }

  function updateAssignment(assignment) {
    _assignment = { ...assignment };
    _paint();
  }

  // ── Rendering ─────────────────────────────────────────────────────

  function _paint() {
    const container = document.getElementById(_containerId);
    if (!container) return;
    container.innerHTML = '';

    const teacherBar = document.createElement('div');
    teacherBar.className = 'teacher-bar';
    teacherBar.textContent = '▼  ' + I18n.t('teacher_front') + '  ▼';
    container.appendChild(teacherBar);

    // group seats into tables: {row: {col: {L: seat, R: seat}}}
    const tables = {};
    for (const seat of _seats) {
      if (!tables[seat.row_idx]) tables[seat.row_idx] = {};
      if (!tables[seat.row_idx][seat.col_idx]) tables[seat.row_idx][seat.col_idx] = {};
      tables[seat.row_idx][seat.col_idx][seat.side] = seat;
    }

    const maxRow = Math.max(..._seats.map(s => s.row_idx), 0);
    const maxCol = Math.max(..._seats.map(s => s.col_idx), 0);

    for (let row = 0; row <= maxRow; row++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      for (let col = 0; col <= maxCol; col++) {
        const tbl = tables[row]?.[col];
        if (!tbl) continue;
        const tableEl = _buildTable(row, col, tbl);
        rowEl.appendChild(tableEl);
      }
      container.appendChild(rowEl);
    }
  }

  function _buildTable(row, col, tbl) {
    const tableEl = document.createElement('div');
    tableEl.className = 'grid-table';
    tableEl.dataset.row = row;
    tableEl.dataset.col = col;

    for (const side of ['L', 'R']) {
      const seat = tbl[side];
      if (!seat) continue;
      const cell = _buildCell(seat);
      tableEl.appendChild(cell);
    }
    return tableEl;
  }

  function _buildCell(seat) {
    const cell = document.createElement('div');
    cell.className = 'grid-seat';
    cell.dataset.seatId = seat.id;

    const label = document.createElement('span');
    label.className = 'seat-label';
    label.textContent = `${seat.row_idx + 1}${seat.side}`;
    cell.appendChild(label);

    if (!seat.is_active) {
      cell.classList.add('blocked');
      if (_editMode) {
        const badge = document.createElement('span');
        badge.className = 'seat-state-badge';
        badge.textContent = '✕';
        cell.appendChild(badge);
        cell.classList.add('edit-active');
        cell.addEventListener('click', () => _onSeatToggle?.(seat.id));
      }
      return cell;
    }

    if (_editMode) {
      cell.classList.add('edit-active');
      const badge = document.createElement('span');
      badge.className = 'seat-state-badge';
      badge.textContent = '●';
      cell.appendChild(badge);
      cell.addEventListener('click', () => _onSeatToggle?.(seat.id));
      return cell;
    }

    // Find student in this seat
    const reverse = _buildReverse();
    const studentId = reverse[seat.id];

    if (studentId) {
      const student = _students[studentId];
      cell.appendChild(_buildChip(student, studentId, seat.id));
      if (_soloSet.has(studentId)) cell.classList.add('solo-indicator');
    } else {
      cell.classList.add('empty');
      _addDropTarget(cell, seat.id);
    }

    return cell;
  }

  function _buildChip(student, studentId, seatId) {
    const chip = document.createElement('div');
    chip.className = 'student-chip';
    chip.draggable = true;
    chip.dataset.studentId = studentId;
    chip.dataset.fromSeat = seatId;

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = student?.name || '?';

    const gender = document.createElement('span');
    gender.className = `chip-gender chip-gender-${student?.gender || 'X'}`;
    gender.textContent = student?.gender || 'X';

    chip.appendChild(name);
    chip.appendChild(gender);

    chip.addEventListener('dragstart', e => {
      _dragStudentId = studentId;
      _dragFromSeatId = seatId;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      _dragStudentId = null;
      _dragFromSeatId = null;
    });

    return chip;
  }

  function _addDropTarget(cell, seatId) {
    cell.addEventListener('dragover', e => {
      if (!_dragStudentId) return;
      e.preventDefault();
      cell.classList.add('drag-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      if (!_dragStudentId) return;
      _handleDrop(_dragStudentId, _dragFromSeatId, seatId);
    });
  }

  function _handleDrop(studentId, fromSeatId, toSeatId) {
    const reverse = _buildReverse();
    const occupant = reverse[toSeatId]; // student already in target seat (or undefined)

    const newAssignment = { ..._assignment };

    // Remove student from old seat
    if (fromSeatId) {
      newAssignment[studentId] = toSeatId;
    } else {
      // Coming from unassigned panel
      newAssignment[studentId] = toSeatId;
    }

    // Swap if occupied
    if (occupant && occupant !== studentId) {
      if (fromSeatId) {
        newAssignment[occupant] = fromSeatId;
      } else {
        delete newAssignment[occupant];
      }
    }

    _assignment = newAssignment;
    _paint();
    _onAssign?.(newAssignment);
  }

  // ── Unassigned panel ──────────────────────────────────────────────

  function renderUnassigned(unassignedIds, students) {
    const list = document.getElementById('unassigned-list');
    if (!list) return;
    list.innerHTML = '';

    if (!unassignedIds.length) {
      list.innerHTML = '<div class="placeholder-msg" style="padding:12px 0;font-size:11px;">All seated</div>';
      return;
    }

    for (const sid of unassignedIds) {
      const student = students[sid];
      if (!student) continue;
      const chip = document.createElement('div');
      chip.className = 'unassigned-chip';
      chip.draggable = true;
      chip.dataset.studentId = sid;

      const gender = document.createElement('span');
      gender.className = `chip-gender chip-gender-${student.gender || 'X'}`;
      gender.textContent = student.gender || 'X';

      const name = document.createElement('span');
      name.textContent = student.name;

      chip.appendChild(gender);
      chip.appendChild(name);

      chip.addEventListener('dragstart', e => {
        _dragStudentId = sid;
        _dragFromSeatId = null;
        chip.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        _dragStudentId = null;
        _dragFromSeatId = null;
      });

      list.appendChild(chip);
    }

    // Drop target on grid seats (re-bind after unassigned changes)
    document.querySelectorAll('.grid-seat.empty').forEach(cell => {
      cell.addEventListener('dragover', e => { if (_dragStudentId) { e.preventDefault(); cell.classList.add('drag-over'); } });
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (!_dragStudentId) return;
        _handleDrop(_dragStudentId, null, cell.dataset.seatId);
      });
    });
  }

  // Also allow dragging a student back to the unassigned panel
  function bindUnassignedDrop() {
    const panel = document.getElementById('unassigned-list');
    if (!panel) return;
    panel.addEventListener('dragover', e => { if (_dragStudentId) e.preventDefault(); });
    panel.addEventListener('drop', e => {
      e.preventDefault();
      if (!_dragStudentId || !_dragFromSeatId) return;
      const newAssignment = { ..._assignment };
      delete newAssignment[_dragStudentId];
      _assignment = newAssignment;
      _paint();
      _onAssign?.(newAssignment);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function _buildReverse() {
    const r = {};
    for (const [sid, seatId] of Object.entries(_assignment)) {
      if (seatId) r[seatId] = sid;
    }
    return r;
  }

  // ── Present mode grid (simplified, no DnD) ───────────────────────

  function renderPresent(opts) {
    const { seats, students, assignment, soloSet, container } = opts;
    container.innerHTML = '';

    const teacherBar = document.createElement('div');
    teacherBar.className = 'teacher-bar';
    teacherBar.style.fontSize = '16px';
    teacherBar.style.padding = '12px';
    teacherBar.textContent = '▼  TEACHER / BOARD  ▼';
    container.appendChild(teacherBar);

    const reverse = {};
    for (const [sid, seatId] of Object.entries(assignment || {})) {
      if (seatId) reverse[seatId] = sid;
    }

    const tables = {};
    for (const seat of seats) {
      if (!tables[seat.row_idx]) tables[seat.row_idx] = {};
      if (!tables[seat.row_idx][seat.col_idx]) tables[seat.row_idx][seat.col_idx] = {};
      tables[seat.row_idx][seat.col_idx][seat.side] = seat;
    }

    const maxRow = Math.max(...seats.map(s => s.row_idx), 0);
    const maxCol = Math.max(...seats.map(s => s.col_idx), 0);

    for (let row = 0; row <= maxRow; row++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      rowEl.style.gap = '20px';
      rowEl.style.marginBottom = '16px';

      for (let col = 0; col <= maxCol; col++) {
        const tbl = tables[row]?.[col];
        if (!tbl) continue;
        const tableEl = document.createElement('div');
        tableEl.className = 'grid-table';
        tableEl.style.border = '2px solid #e2e8f0';

        for (const side of ['L', 'R']) {
          const seat = tbl[side];
          if (!seat) continue;
          const cell = document.createElement('div');
          cell.className = 'grid-seat';
          cell.style.width = '130px';
          cell.style.minHeight = '70px';

          if (!seat.is_active) {
            cell.classList.add('blocked');
          } else {
            const sid = reverse[seat.id];
            if (sid && students[sid]) {
              const s = students[sid];
              const name = document.createElement('div');
              name.style.cssText = 'font-size:16px;font-weight:600;text-align:center;line-height:1.3;';
              name.textContent = s.name;

              const g = document.createElement('span');
              g.className = `chip-gender chip-gender-${s.gender || 'X'}`;
              g.style.fontSize = '11px';
              g.textContent = s.gender || 'X';

              cell.appendChild(name);
              cell.appendChild(g);
              if (soloSet?.has(sid)) {
                const solo = document.createElement('div');
                solo.style.cssText = 'font-size:10px;color:#94a3b8;margin-top:2px;';
                solo.textContent = '(solo)';
                cell.appendChild(solo);
              }
            } else {
              cell.classList.add('empty');
            }
          }
          tableEl.appendChild(cell);
        }
        rowEl.appendChild(tableEl);
      }
      container.appendChild(rowEl);
    }
  }

  return { render, updateAssignment, renderUnassigned, bindUnassignedDrop, renderPresent };
})();

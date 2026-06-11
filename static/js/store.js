'use strict';

const Store = (() => {
  const KEY = 'ps_v4';

  const DEFAULT_RULES = [
    { rule_type: 'no_repeat',        enabled: true,  priority: 8,  config: { sessions_back: 1 } },
    { rule_type: 'gender_mixing',    enabled: true,  priority: 5,  config: { min_mixed_ratio: 0.5 } },
    { rule_type: 'row_progression',  enabled: false, priority: 3,  config: {} },
    { rule_type: 'front_rows_first', enabled: false, priority: 6,  config: {} },
    { rule_type: 'vicinity',         enabled: false, priority: 6,  config: { separation_pairs: {}, min_distance: 2 } },
    { rule_type: 'positional',       enabled: false, priority: 7,  config: { constraints: {} } },
    { rule_type: 'pin_to_seat',      enabled: false, priority: 10, config: {} },
    { rule_type: 'seat_alone',       enabled: false, priority: 10, config: { students: [] } },
  ];

  function _load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{"classes":[]}');
    } catch {
      return { classes: [] };
    }
  }

  function _save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function _buildSeats(rows, cols) {
    const seats = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const side of ['L', 'R']) {
          seats.push({ id: newId(), row_idx: r, col_idx: c, side, is_active: true });
        }
      }
    }
    return seats;
  }

  function newId() {
    return crypto.randomUUID();
  }

  function getClasses() {
    return _load().classes || [];
  }

  function getClass(id) {
    return _load().classes.find(c => c.id === id) || null;
  }

  function createClass(name, description, rows, cols) {
    const cls = {
      id: newId(),
      name: name.trim(),
      description: description || '',
      grid_rows: rows,
      grid_cols: cols,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      seats: _buildSeats(rows, cols),
      students: [],
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
      sessions: [],
      positionWeights: {},
      pairWeights: {},
    };
    const data = _load();
    data.classes.push(cls);
    _save(data);
    return cls;
  }

  function saveClass(cls) {
    cls.updated_at = new Date().toISOString();
    const data = _load();
    const idx = data.classes.findIndex(c => c.id === cls.id);
    if (idx >= 0) data.classes[idx] = cls;
    else data.classes.push(cls);
    _save(data);
  }

  function deleteClass(id) {
    const data = _load();
    data.classes = data.classes.filter(c => c.id !== id);
    _save(data);
  }

  function resetSeats(cls) {
    cls.seats = _buildSeats(cls.grid_rows, cls.grid_cols);
    cls.positionWeights = {};
    saveClass(cls);
  }

  function addStudent(cls, name, gender, notes, extras = {}) {
    const student = {
      id: newId(),
      name: name.trim(),
      gender: gender || 'X',
      notes: notes || '',
      is_active: true,
      created_at: new Date().toISOString(),
      ...extras,
    };
    cls.students.push(student);
    saveClass(cls);
    return student;
  }

  function updateStudent(cls, id, updates) {
    const s = cls.students.find(s => s.id === id);
    if (s) Object.assign(s, updates);
    saveClass(cls);
  }

  function deleteStudent(cls, id) {
    cls.students = cls.students.filter(s => s.id !== id);
    // clean up any rules referencing this student
    for (const rule of cls.rules) {
      if (rule.rule_type === 'pin_to_seat' && rule.config[id]) {
        delete rule.config[id];
      }
      if (rule.rule_type === 'seat_alone' && rule.config.students) {
        rule.config.students = rule.config.students.filter(sid => sid !== id);
      }
      if (rule.rule_type === 'vicinity' && rule.config.separation_pairs) {
        delete rule.config.separation_pairs[id];
        for (const k of Object.keys(rule.config.separation_pairs)) {
          rule.config.separation_pairs[k] = (rule.config.separation_pairs[k] || []).filter(sid => sid !== id);
        }
      }
      if (rule.rule_type === 'positional' && rule.config.constraints) {
        delete rule.config.constraints[id];
      }
    }
    delete cls.pairWeights[id];
    delete cls.positionWeights[id];
    saveClass(cls);
  }

  function saveSession(cls, session) {
    cls.sessions.unshift(session);
    saveClass(cls);
  }

  function deleteSession(cls, sessionId) {
    cls.sessions = cls.sessions.filter(s => s.id !== sessionId);
    saveClass(cls);
  }

  function getHistoryPairs(cls, sessionsBack) {
    const pairs = [];
    const recent = cls.sessions.slice(0, sessionsBack || 1);
    for (const sess of recent) {
      const assignment = sess.assignment || {};
      const reverse = Object.fromEntries(
        Object.entries(assignment).filter(([, v]) => v).map(([k, v]) => [v, k])
      );
      const seen = new Set();
      for (const seat of cls.seats) {
        if (seat.side !== 'L') continue;
        const partner = cls.seats.find(s => s.row_idx === seat.row_idx && s.col_idx === seat.col_idx && s.side === 'R');
        if (!partner) continue;
        const s1 = reverse[seat.id];
        const s2 = reverse[partner.id];
        if (s1 && s2) {
          const key = [s1, s2].sort().join('|');
          if (!seen.has(key)) { seen.add(key); pairs.push([s1, s2]); }
        }
      }
    }
    return pairs;
  }

  function getLastRows(cls) {
    const lastRows = {};
    const last = cls.sessions[0];
    if (!last) return lastRows;
    const assignment = last.assignment || {};
    const seatsById = Object.fromEntries(cls.seats.map(s => [s.id, s]));
    for (const [studentId, seatId] of Object.entries(assignment)) {
      const seat = seatsById[seatId];
      if (seat) lastRows[studentId] = seat.row_idx;
    }
    return lastRows;
  }

  return {
    newId,
    getClasses, getClass,
    createClass, saveClass, deleteClass, resetSeats,
    addStudent, updateStudent, deleteStudent,
    saveSession, deleteSession,
    getHistoryPairs, getLastRows,
    DEFAULT_RULES,
  };
})();

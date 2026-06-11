'use strict';

/* ═══════════════════════════════════════════════════════════════════
   Paulus Shuffle V3 — Main application
   ═══════════════════════════════════════════════════════════════════ */

// ── Global state ───────────────────────────────────────────────────
const S = {
  classes:        [],
  currentClassId: null,
  students:       {},   // {id: student}
  seats:          [],
  rules:          [],
  sessions:       [],
  currentSession: null,
  assignment:     {},   // {student_id: seat_id}
  soloSet:        new Set(),
  view:           'dashboard',
  tab:            'seating',
  generating:     false,
  // Weight editor
  weightStudentId:    null,
  posWeightsEditing:  {},
  pairWeightsEditing: {},
  // Confirm dialog
  _confirmCallback: null,
};

// ── Bootstrap ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await I18n.init();
  _bindNav();
  _bindModals();
  _bindLangSwitcher();
  await _loadClasses();
  _showView('dashboard');
});

// ── Navigation ─────────────────────────────────────────────────────
function _bindNav() {
  document.getElementById('btn-new-class').addEventListener('click', _openNewClassModal);
  document.getElementById('btn-settings-nav').addEventListener('click', () => _showView('settings'));
  document.getElementById('settings-lang').addEventListener('change', e => I18n.load(e.target.value));

  // Class tabs
  document.getElementById('class-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    _switchTab(btn.dataset.tab);
  });

  // Seating tab controls
  document.getElementById('btn-generate').addEventListener('click', _generate);
  document.getElementById('btn-pdf-visual').addEventListener('click', _showPdfModal);
  document.getElementById('btn-delete-class').addEventListener('click', _confirmDeleteClass);
  document.getElementById('btn-reset-seats').addEventListener('click', _resetSeats);
  document.getElementById('class-settings-form').addEventListener('submit', _saveClassSettings);

  // Students tab
  document.getElementById('btn-add-student').addEventListener('click', _openAddStudentModal);
  document.getElementById('btn-import-csv').addEventListener('click', () => document.getElementById('csv-file-input').click());
  document.getElementById('csv-file-input').addEventListener('change', _importCSV);

  // Weight modal
  document.getElementById('wtab-position').addEventListener('click', () => _switchWeightsTab('position'));
  document.getElementById('wtab-pair').addEventListener('click',     () => _switchWeightsTab('pair'));
  document.getElementById('btn-reset-pos-weights').addEventListener('click', _resetPosWeights);
  document.getElementById('btn-save-pos-weights').addEventListener('click',  _savePosWeights);
  document.getElementById('btn-save-pair-weights').addEventListener('click', _savePairWeights);

  // Confirm modal
  document.getElementById('btn-confirm-ok').addEventListener('click', () => {
    _closeModal('modal-confirm');
    S._confirmCallback?.();
  });
}

function _bindModals() {
  document.addEventListener('click', e => {
    const dismiss = e.target.closest('[data-dismiss]');
    if (dismiss) _closeModal(dismiss.dataset.dismiss);
    const overlay = e.target.closest('.modal-overlay');
    if (overlay && overlay === e.target) _closeModal(overlay.id);
  });
  document.getElementById('class-form').addEventListener('submit', _submitClassForm);
  document.getElementById('student-form').addEventListener('submit', _submitStudentForm);
}

function _bindLangSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await I18n.load(btn.dataset.lang);
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === I18n.locale));
      document.getElementById('settings-lang').value = I18n.locale;
      // Re-render current view
      if (S.currentClassId) {
        _renderStudentTable();
        _renderRules();
        _renderHistory();
      }
    });
  });
}

// ── Views ──────────────────────────────────────────────────────────
function _showView(name) {
  S.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${name}`)?.classList.remove('hidden');

  if (name === 'dashboard') {
    const hasCls = S.classes.length > 0;
    document.getElementById('dashboard-no-classes').classList.toggle('hidden', hasCls);
  }
}

function _switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`panel-${tab}`)?.classList.remove('hidden');

  if (tab === 'students')       _renderStudentTable();
  if (tab === 'history')        _loadAndRenderHistory();
  if (tab === 'rules')          _renderRules();
  if (tab === 'class-settings') _fillClassSettingsForm();
}

// ── Classes ────────────────────────────────────────────────────────
async function _loadClasses() {
  S.classes = await API.getClasses().catch(() => []);
  _renderSidebar();
}

function _renderSidebar() {
  const list = document.getElementById('class-list');
  list.innerHTML = '';
  for (const cls of S.classes) {
    const li = document.createElement('li');
    li.className = `class-list-item${cls.id === S.currentClassId ? ' active' : ''}`;
    li.dataset.classId = cls.id;
    li.innerHTML = `<span class="class-list-item-dot"></span><span>${_esc(cls.name)}</span>`;
    li.addEventListener('click', () => _selectClass(cls.id));
    list.appendChild(li);
  }
  const hasCls = S.classes.length > 0;
  document.getElementById('dashboard-no-classes')?.classList.toggle('hidden', hasCls);
}

async function _selectClass(classId) {
  S.currentClassId = classId;
  S.currentSession = null;
  S.assignment     = {};
  S.soloSet        = new Set();

  _renderSidebar();
  _showView('class');
  _switchTab('seating');

  const cls = S.classes.find(c => c.id === classId);
  document.getElementById('class-title').textContent = cls?.name ?? '';
  document.getElementById('class-subtitle').textContent = cls?.description ?? '';

  // Load students and seats in parallel
  const [students, seats] = await Promise.all([
    API.getStudents(classId),
    API.getSeats(classId),
  ]);
  S.students = Object.fromEntries(students.map(s => [s.id, s]));
  S.seats    = seats;

  _renderGridEmpty();
}

function _renderGridEmpty() {
  const container = document.getElementById('classroom-grid');
  container.innerHTML = `<div class="grid-placeholder">${I18n.t('btn_generate')}</div>`;
  document.getElementById('unassigned-list').innerHTML = '';
  document.getElementById('warnings-bar').classList.add('hidden');
}

// ── Class creation / editing ───────────────────────────────────────
function _openNewClassModal() {
  document.getElementById('modal-class-title').textContent = I18n.t('btn_add_class');
  document.getElementById('cf-name').value        = '';
  document.getElementById('cf-description').value = '';
  document.getElementById('cf-rows').value        = 5;
  document.getElementById('cf-cols').value        = 4;
  document.getElementById('class-form').dataset.editId = '';
  _openModal('modal-class');
}

async function _submitClassForm(e) {
  e.preventDefault();
  const body = {
    name:        document.getElementById('cf-name').value.trim(),
    description: document.getElementById('cf-description').value.trim(),
    grid_rows:   parseInt(document.getElementById('cf-rows').value),
    grid_cols:   parseInt(document.getElementById('cf-cols').value),
  };
  try {
    const cls = await API.createClass(body);
    S.classes.push(cls);
    _closeModal('modal-class');
    _renderSidebar();
    _selectClass(cls.id);
    _toast(I18n.t('class_created'), 'success');
  } catch (err) {
    _toast(err.message, 'error');
  }
}

async function _saveClassSettings(e) {
  e.preventDefault();
  const body = {
    name:        document.getElementById('cs-name').value.trim(),
    description: document.getElementById('cs-description').value.trim(),
    grid_rows:   parseInt(document.getElementById('cs-rows').value),
    grid_cols:   parseInt(document.getElementById('cs-cols').value),
  };
  try {
    const updated = await API.updateClass(S.currentClassId, body);
    const idx = S.classes.findIndex(c => c.id === S.currentClassId);
    if (idx >= 0) S.classes[idx] = updated;
    document.getElementById('class-title').textContent    = updated.name;
    document.getElementById('class-subtitle').textContent = updated.description;
    _renderSidebar();
    // Reload seats in case grid changed
    S.seats = await API.getSeats(S.currentClassId);
    _toast(I18n.t('class_updated'), 'success');
  } catch (err) {
    _toast(err.message, 'error');
  }
}

function _fillClassSettingsForm() {
  const cls = S.classes.find(c => c.id === S.currentClassId);
  if (!cls) return;
  document.getElementById('cs-name').value        = cls.name;
  document.getElementById('cs-description').value = cls.description;
  document.getElementById('cs-rows').value        = cls.grid_rows;
  document.getElementById('cs-cols').value        = cls.grid_cols;
}

function _confirmDeleteClass() {
  _confirm(I18n.t('confirm_delete_class'), async () => {
    try {
      await API.deleteClass(S.currentClassId);
      S.classes = S.classes.filter(c => c.id !== S.currentClassId);
      S.currentClassId = null;
      _renderSidebar();
      _showView('dashboard');
    } catch (err) {
      _toast(err.message, 'error');
    }
  });
}

async function _resetSeats() {
  await API.resetSeats(S.currentClassId).catch(() => {});
  S.seats = await API.getSeats(S.currentClassId);
  _renderGridEmpty();
  _toast('Layout reset.');
}

// ── Generate ───────────────────────────────────────────────────────
async function _generate() {
  if (S.generating || !S.currentClassId) return;
  S.generating = true;
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.querySelector('span').textContent = I18n.t('btn_generating');

  const body = {
    mode:                  document.getElementById('select-mode').value,
    use_position_weights:  document.getElementById('chk-pos-weights').checked,
    use_pair_weights:      document.getElementById('chk-pair-weights').checked,
    label:                 '',
  };

  try {
    const result = await API.generateSession(S.currentClassId, body);
    S.currentSession = result.session;
    S.assignment     = {};
    S.soloSet        = new Set(result.solo_students || []);

    // Convert string keys to int
    for (const [k, v] of Object.entries(result.assignment || {})) {
      S.assignment[parseInt(k)] = v;
    }

    _renderCurrentSession(result.warnings);
  } catch (err) {
    _toast(err.message, 'error');
  } finally {
    S.generating = false;
    btn.disabled = false;
    btn.querySelector('span').textContent = I18n.t('btn_generate');
  }
}

function _renderCurrentSession(warnings = []) {
  Grid.render({
    seats:    S.seats,
    students: S.students,
    assignment: S.assignment,
    soloSet:  S.soloSet,
    onAssignChange: _handleAssignChange,
    layoutEditMode: false,
  });
  Grid.initUnassigned(S.students, S.assignment);

  // Warnings
  const bar  = document.getElementById('warnings-bar');
  const text = document.getElementById('warnings-text');
  if (warnings.length > 0) {
    text.textContent = warnings.join('  ·  ');
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function _handleAssignChange(patches) {
  if (!S.currentSession) return;
  // Optimistic local update already done by Grid
  try {
    await API.patchAssignments(S.currentSession.id, patches);
  } catch (err) {
    _toast(err.message, 'error');
  }
}

// ── PDF ────────────────────────────────────────────────────────────
function _showPdfModal() {
  if (!S.currentSession) { _toast('Generate a seating plan first.', 'warning'); return; }
  const fmt = 'visual'; // default
  window.open(API.exportPDF(S.currentSession.id, fmt), '_blank');
}

// ── Students ───────────────────────────────────────────────────────
function _renderStudentTable() {
  const tbody = document.getElementById('student-tbody');
  tbody.innerHTML = '';
  const sorted = Object.values(S.students).sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) {
    const tr = document.createElement('tr');
    if (!s.is_active) tr.classList.add('student-inactive');
    tr.innerHTML = `
      <td>${_esc(s.name)}</td>
      <td><span class="gender-badge ${s.gender.toLowerCase()}">${_esc(s.gender)}</span></td>
      <td class="text-sub">${_esc(s.notes || '')}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-action="weights" data-id="${s.id}">⚖</button>
      </td>
      <td class="row-actions">
        <button class="btn btn-icon" data-action="toggle" data-id="${s.id}" title="${s.is_active ? 'Deactivate' : 'Activate'}">
          ${s.is_active ? '●' : '○'}
        </button>
        <button class="btn btn-icon danger" data-action="delete" data-id="${s.id}" title="Delete">✕</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.addEventListener('click', _handleStudentTableClick);
}

function _handleStudentTableClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id     = parseInt(btn.dataset.id);
  const action = btn.dataset.action;
  if (action === 'delete')  _confirmDeleteStudent(id);
  if (action === 'toggle')  _toggleStudentActive(id);
  if (action === 'weights') _openWeightsModal(id);
}

function _openAddStudentModal() {
  document.getElementById('sf-name').value    = '';
  document.getElementById('sf-gender').value  = 'X';
  document.getElementById('sf-notes').value   = '';
  document.getElementById('student-form').dataset.editId = '';
  _openModal('modal-student');
}

async function _submitStudentForm(e) {
  e.preventDefault();
  const body = {
    name:   document.getElementById('sf-name').value.trim(),
    gender: document.getElementById('sf-gender').value,
    notes:  document.getElementById('sf-notes').value.trim(),
  };
  try {
    const student = await API.createStudent(S.currentClassId, body);
    S.students[student.id] = student;
    _closeModal('modal-student');
    _renderStudentTable();
    _toast(I18n.t('student_added'), 'success');
  } catch (err) {
    _toast(err.message, 'error');
  }
}

async function _toggleStudentActive(id) {
  const s = S.students[id];
  if (!s) return;
  const updated = await API.updateStudent(id, { is_active: !s.is_active }).catch(err => { _toast(err.message, 'error'); return null; });
  if (updated) { S.students[id] = updated; _renderStudentTable(); }
}

function _confirmDeleteStudent(id) {
  _confirm(I18n.t('confirm_delete_student'), async () => {
    await API.deleteStudent(id).catch(err => _toast(err.message, 'error'));
    delete S.students[id];
    _renderStudentTable();
  });
}

async function _importCSV(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const result = await API.importCSV(S.currentClassId, fd);
    _toast(I18n.t('import_success', { imported: result.imported, skipped: result.skipped }), 'success');
    S.students = Object.fromEntries(
      (await API.getStudents(S.currentClassId)).map(s => [s.id, s])
    );
    _renderStudentTable();
  } catch {
    _toast(I18n.t('import_error'), 'error');
  }
  e.target.value = '';
}

// ── Rules ──────────────────────────────────────────────────────────
async function _renderRules() {
  const list  = document.getElementById('rules-list');
  list.innerHTML = '';
  S.rules = await API.getRules(S.currentClassId).catch(() => []);

  for (const rule of S.rules) {
    const card = document.createElement('div');
    card.className = 'rule-card';
    const enabled = Boolean(rule.enabled);
    card.innerHTML = `
      <div class="rule-card-header">
        <div>
          <div class="rule-card-title">${I18n.t(`rule_${rule.rule_type}`)}</div>
          <div class="rule-card-desc">${I18n.t(`rule_${rule.rule_type}_desc`)}</div>
        </div>
        <div class="rule-card-controls">
          <label class="rule-toggle">
            <div class="toggle-switch ${enabled ? 'on' : ''}" data-rule="${rule.rule_type}" data-field="enabled"></div>
          </label>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="text-xs text-sub">${I18n.t('rule_priority')}</span>
            <input type="number" class="priority-input" data-rule="${rule.rule_type}" value="${rule.priority}" min="1" max="10" />
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  }

  list.addEventListener('click', e => {
    const toggle = e.target.closest('.toggle-switch');
    if (!toggle) return;
    const ruleType = toggle.dataset.rule;
    toggle.classList.toggle('on');
    _saveRule(ruleType, list);
  });

  list.addEventListener('change', e => {
    const input = e.target.closest('.priority-input');
    if (!input) return;
    _saveRule(input.dataset.rule, list);
  });
}

async function _saveRule(ruleType, list) {
  const toggle   = list.querySelector(`.toggle-switch[data-rule="${ruleType}"]`);
  const priority = list.querySelector(`.priority-input[data-rule="${ruleType}"]`);
  const rule     = S.rules.find(r => r.rule_type === ruleType);
  const config   = rule?.config ?? {};
  const parsed   = typeof config === 'string' ? JSON.parse(config) : config;

  try {
    await API.updateRule(S.currentClassId, ruleType, {
      enabled:  toggle?.classList.contains('on') ?? false,
      priority: parseInt(priority?.value ?? 5),
      config:   parsed,
    });
  } catch (err) {
    _toast(err.message, 'error');
  }
}

// ── History ────────────────────────────────────────────────────────
async function _loadAndRenderHistory() {
  S.sessions = await API.getSessions(S.currentClassId).catch(() => []);
  _renderHistory();
}

function _renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (!S.sessions.length) {
    list.innerHTML = `<div class="history-empty">${I18n.t('history_empty')}</div>`;
    return;
  }
  for (const sess of S.sessions) {
    const card = document.createElement('div');
    card.className = 'history-card';
    const date   = sess.created_at.slice(0, 10);
    const time   = sess.created_at.slice(11, 16);
    const label  = sess.label || `${I18n.t('history_session')} ${date}`;
    const warnCount = sess.warnings?.length ?? 0;
    card.innerHTML = `
      <div class="history-card-left">
        <div class="history-card-title">${_esc(label)}</div>
        <div class="history-card-meta">${date} ${time} · ${sess.algorithm_mode}${warnCount ? ` · ⚠ ${warnCount}` : ''}</div>
      </div>
      <div class="history-card-right">
        <a class="btn btn-ghost btn-sm" href="${API.exportPDF(sess.id)}" target="_blank">PDF</a>
        <button class="btn btn-ghost btn-sm" data-action="load" data-id="${sess.id}">Load</button>
        <button class="btn btn-icon danger" data-action="delete" data-id="${sess.id}" title="Delete">✕</button>
      </div>`;
    list.appendChild(card);
  }

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'delete') _deleteSession(id);
    if (btn.dataset.action === 'load')   _loadSession(id);
  });
}

async function _loadSession(sessionId) {
  try {
    const [sess, asgns] = await Promise.all([
      API.getSession(sessionId),
      API.getAssignments(sessionId),
    ]);
    S.currentSession = sess;
    S.assignment = {};
    S.soloSet    = new Set();
    for (const a of asgns) {
      if (a.seat_id) S.assignment[a.student_id] = a.seat_id;
      if (a.is_solo) S.soloSet.add(a.student_id);
    }
    _switchTab('seating');
    _renderCurrentSession(sess.warnings || []);
  } catch (err) {
    _toast(err.message, 'error');
  }
}

async function _deleteSession(sessionId) {
  _confirm(I18n.t('history_delete_confirm'), async () => {
    await API.deleteSession(sessionId).catch(err => _toast(err.message, 'error'));
    S.sessions = S.sessions.filter(s => s.id !== sessionId);
    _renderHistory();
  });
}

// ── Weight editor ──────────────────────────────────────────────────
async function _openWeightsModal(studentId) {
  S.weightStudentId = studentId;
  const student = S.students[studentId];
  document.getElementById('modal-weights-title').textContent =
    `${student?.name ?? '?'} — ${I18n.t('weights_position_title')}`;

  // Load weights
  const [posW, pairW] = await Promise.all([
    API.getPositionWeights(S.currentClassId, studentId).catch(() => ({})),
    API.getPairWeights(S.currentClassId, studentId).catch(() => ({})),
  ]);

  S.posWeightsEditing  = { ...posW };
  S.pairWeightsEditing = { ...pairW };

  _renderPosWeightGrid();
  _renderPairWeightsList();
  _switchWeightsTab('position');
  _openModal('modal-weights');
}

function _switchWeightsTab(tab) {
  document.querySelectorAll('.weights-tab').forEach(t => t.classList.toggle('active', t.dataset.wtab === tab));
  document.getElementById('wpanel-position').classList.toggle('hidden', tab !== 'position');
  document.getElementById('wpanel-pair').classList.toggle('hidden',     tab !== 'pair');
}

function _renderPosWeightGrid() {
  const container = document.getElementById('weight-seat-grid');
  container.innerHTML = '';

  const tables = {};
  for (const seat of S.seats) {
    if (!seat.is_active) continue;
    const key = `${seat.row_idx},${seat.col_idx}`;
    tables[key] = tables[key] || {};
    tables[key][seat.side] = seat;
  }

  const maxRow = S.seats.length ? Math.max(...S.seats.map(s => s.row_idx)) : 0;

  for (let row = 0; row <= maxRow; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'weight-classroom-row';

    const rowSeats = S.seats.filter(s => s.row_idx === row && s.is_active);
    const maxCol   = rowSeats.length ? Math.max(...rowSeats.map(s => s.col_idx)) : 0;

    for (let col = 0; col <= maxCol; col++) {
      for (const side of ['L', 'R']) {
        const seat = S.seats.find(s => s.row_idx === row && s.col_idx === col && s.side === side);
        if (!seat) continue;

        const w = S.posWeightsEditing[seat.id] ?? 50;
        const slot = document.createElement('div');
        slot.className = `weight-seat-slot ${_weightClass(w)}`;
        slot.dataset.seatId = seat.id;
        slot.innerHTML = `<div class="weight-seat-val">${w}</div><div class="weight-seat-label">R${row+1} C${col+1}${side}</div>`;

        slot.addEventListener('click', () => {
          let next = (S.posWeightsEditing[seat.id] ?? 50);
          // Cycle: 50 → 100 → 0 → 50
          if      (next === 50)  next = 100;
          else if (next === 100) next = 0;
          else                   next = 50;
          S.posWeightsEditing[seat.id] = next;
          slot.className = `weight-seat-slot ${_weightClass(next)}`;
          slot.querySelector('.weight-seat-val').textContent = next;
        });

        rowDiv.appendChild(slot);
      }
    }
    container.appendChild(rowDiv);
  }
}

function _weightClass(w) {
  if (w >= 70) return 'weight-high';
  if (w <= 30) return 'weight-low';
  return 'weight-neutral';
}

function _renderPairWeightsList() {
  const list = document.getElementById('pair-weights-list');
  list.innerHTML = '';
  const others = Object.values(S.students).filter(s => s.id !== S.weightStudentId && s.is_active);
  for (const other of others.sort((a, b) => a.name.localeCompare(b.name))) {
    const existing = S.pairWeightsEditing[other.id]?.weight ?? 50;
    const row = document.createElement('div');
    row.className = 'pair-weight-row';
    row.innerHTML = `
      <div class="pair-weight-name">${_esc(other.name)}</div>
      <input type="range" class="pair-weight-slider" min="0" max="100" value="${existing}" data-other-id="${other.id}" />
      <div class="pair-weight-val" id="pwv-${other.id}">${existing}</div>`;
    row.querySelector('.pair-weight-slider').addEventListener('input', e => {
      const v = parseInt(e.target.value);
      document.getElementById(`pwv-${other.id}`).textContent = v;
      S.pairWeightsEditing[other.id] = { ...(S.pairWeightsEditing[other.id] || {}), weight: v, is_override: true };
    });
    list.appendChild(row);
  }
}

function _resetPosWeights() {
  S.posWeightsEditing = {};
  _renderPosWeightGrid();
}

async function _savePosWeights() {
  const weights = {};
  for (const [seatId, w] of Object.entries(S.posWeightsEditing)) {
    weights[seatId] = w;
  }
  try {
    await API.setPositionWeights(S.currentClassId, S.weightStudentId, weights);
    _toast(I18n.t('btn_save') + ' ✓', 'success');
  } catch (err) {
    _toast(err.message, 'error');
  }
}

async function _savePairWeights() {
  const promises = [];
  for (const [otherId, data] of Object.entries(S.pairWeightsEditing)) {
    promises.push(API.setPairWeight(S.currentClassId, S.weightStudentId, {
      other_student_id: parseInt(otherId),
      weight:           data.weight ?? 50,
      is_override:      true,
    }));
  }
  try {
    await Promise.all(promises);
    _toast(I18n.t('btn_save') + ' ✓', 'success');
  } catch (err) {
    _toast(err.message, 'error');
  }
}

// ── Modal helpers ──────────────────────────────────────────────────
function _openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function _closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function _confirm(message, callback) {
  document.getElementById('confirm-title').textContent   = I18n.t('btn_delete');
  document.getElementById('confirm-message').textContent = message;
  S._confirmCallback = callback;
  _openModal('modal-confirm');
}

// ── Toast ──────────────────────────────────────────────────────────
function _toast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = message;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Utilities ──────────────────────────────────────────────────────
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

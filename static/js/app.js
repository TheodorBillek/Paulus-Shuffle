'use strict';

/* ══════════════════════════════════════════════════════════════════
   Shuffle Service V4 — Main application
   All data lives in localStorage (Store). Server is compute-only.
   ══════════════════════════════════════════════════════════════════ */

const App = (() => {
  const S = {
    classId: null,          // currently open class id
    cls: null,              // currently open class object (mutable copy)
    currentSession: null,   // last generated session
    assignment: {},         // current assignment in-memory {student_id: seat_id}
    soloSet: new Set(),
    generating: false,
  };

  // ── Bootstrap ───────────────────────────────────────────────────

  function init() {
    I18n.init();
    _bindLang();
    _bindSidebar();
    _bindModals();
    _bindTabBar();
    _bindSeatingTab();
    _bindStudentsTab();
    _bindSettingsTab();
    _renderClassList();
    _showView('dashboard');
  }

  // ── View management ──────────────────────────────────────────────

  function _showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${name}`);
    if (el) el.classList.add('active');
  }

  function _switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${name}`));
    if (name === 'students') _renderStudents();
    if (name === 'rules')    _renderRules();
    if (name === 'history')  _renderHistory();
    if (name === 'settings') _renderClassSettings();
  }

  // ── Language ─────────────────────────────────────────────────────

  function _bindLang() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => I18n.load(btn.dataset.lang));
    });
  }

  // ── Sidebar ──────────────────────────────────────────────────────

  function _renderClassList() {
    const list = document.getElementById('class-list');
    const classes = Store.getClasses();
    list.innerHTML = '';
    if (!classes.length) {
      const li = document.createElement('li');
      li.className = 'class-list-empty';
      li.style.cssText = 'padding:8px 14px;font-size:12px;color:var(--text-xsub);';
      li.textContent = 'No classes yet';
      list.appendChild(li);
      return;
    }
    for (const cls of classes) {
      const li = document.createElement('li');
      li.dataset.id = cls.id;
      if (S.classId === cls.id) li.classList.add('active');
      const span = document.createElement('span');
      span.className = 'class-name';
      span.textContent = cls.name;
      li.appendChild(span);
      li.addEventListener('click', () => _openClass(cls.id));
      list.appendChild(li);
    }
  }

  function _bindSidebar() {
    document.getElementById('btn-new-class').addEventListener('click', _openNewClassModal);
    document.getElementById('btn-nav-settings').addEventListener('click', () => _showView('app-settings'));
    document.getElementById('btn-wipe-data').addEventListener('click', () => {
      _confirm(I18n.t('confirm_wipe_data'), () => {
        localStorage.removeItem('ps_v4');
        localStorage.removeItem('ps_present');
        location.reload();
      });
    });
  }

  function _openClass(id) {
    S.classId = id;
    S.cls = Store.getClass(id);
    S.currentSession = S.cls?.sessions?.[0] || null;
    S.assignment = S.currentSession?.assignment || {};
    S.soloSet = new Set(S.currentSession?.solo_students || []);
    _renderClassList();
    _showView('class');
    document.getElementById('class-title').textContent = S.cls.name;
    document.getElementById('class-subtitle').textContent =
      `${S.cls.students.filter(s => s.is_active).length} students · ${S.cls.grid_rows}×${S.cls.grid_cols}`;
    _switchTab('seating');
    _renderSeatingGrid();
  }

  // ── New / Edit Class Modal ────────────────────────────────────────

  function _openNewClassModal() {
    document.getElementById('modal-class-title').textContent = 'New Class';
    document.getElementById('cf-name').value = '';
    document.getElementById('cf-description').value = '';
    document.getElementById('cf-rows').value = 5;
    document.getElementById('cf-cols').value = 4;
    _openModal('modal-class');
  }

  function _bindClassForm() {
    document.getElementById('class-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('cf-name').value.trim();
      if (!name) return;
      const cls = Store.createClass(
        name,
        document.getElementById('cf-description').value,
        parseInt(document.getElementById('cf-rows').value) || 5,
        parseInt(document.getElementById('cf-cols').value) || 4,
      );
      _closeModal('modal-class');
      _renderClassList();
      _openClass(cls.id);
      _toast(I18n.t('toast_saved'), 'success');
    });
  }

  // ── Tab bar ───────────────────────────────────────────────────────

  function _bindTabBar() {
    document.getElementById('class-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab');
      if (btn) _switchTab(btn.dataset.tab);
    });
  }

  // ── Seating tab ───────────────────────────────────────────────────

  function _bindSeatingTab() {
    document.getElementById('btn-generate').addEventListener('click', _generate);
    document.getElementById('btn-present').addEventListener('click', _openPresent);
    document.getElementById('btn-export-session').addEventListener('click', () => _openExportModal('session'));
    document.getElementById('btn-delete-class').addEventListener('click', _confirmDeleteClass);
  }

  function _renderSeatingGrid() {
    if (!S.cls) return;
    const studentsById = Object.fromEntries(S.cls.students.map(s => [s.id, s]));
    Grid.render({
      seats: S.cls.seats,
      students: studentsById,
      assignment: S.assignment,
      soloSet: S.soloSet,
      editMode: false,
      onAssign: assignment => {
        S.assignment = assignment;
        if (S.currentSession) {
          S.currentSession.assignment = assignment;
          const idx = S.cls.sessions.findIndex(s => s.id === S.currentSession.id);
          if (idx >= 0) S.cls.sessions[idx] = S.currentSession;
          Store.saveClass(S.cls);
        }
        _syncUnassigned();
      },
    });
    Grid.bindUnassignedDrop();
    _syncUnassigned();
    _renderWarnings(S.currentSession?.warnings || []);
  }

  function _syncUnassigned() {
    if (!S.cls) return;
    const assignedIds = new Set(Object.keys(S.assignment));
    const allActive = S.cls.students.filter(s => s.is_active).map(s => s.id);
    const unassigned = allActive.filter(id => !assignedIds.has(id) && !S.assignment[id]);
    const studentsById = Object.fromEntries(S.cls.students.map(s => [s.id, s]));
    Grid.renderUnassigned(unassigned, studentsById);
  }

  function _renderWarnings(warnings) {
    const bar = document.getElementById('warnings-bar');
    const ul = document.getElementById('warnings-list');
    if (!warnings.length) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    ul.innerHTML = '';
    warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
  }

  async function _generate() {
    if (!S.cls || S.generating) return;
    const active = S.cls.students.filter(s => s.is_active);
    if (!active.length) { _toast('No active students in this class', 'error'); return; }

    S.generating = true;
    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = '…';

    const noRepeatRule = S.cls.rules.find(r => r.rule_type === 'no_repeat');
    const sessionsBack = noRepeatRule?.config?.sessions_back || 1;

    const body = {
      students: active,
      seats: S.cls.seats,
      rules: S.cls.rules,
      history_pairs: Store.getHistoryPairs(S.cls, sessionsBack),
      last_rows: Store.getLastRows(S.cls),
      mode: document.getElementById('select-mode')?.value || 'weighted',
      use_position_weights: document.getElementById('chk-pos-weights')?.checked ?? true,
      use_pair_weights: document.getElementById('chk-pair-weights')?.checked ?? true,
      position_weights: S.cls.positionWeights || {},
      pair_weights: S.cls.pairWeights || {},
      pin_overrides: _getPinOverrides(),
      solo_overrides: _getSoloOverrides(),
    };

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      S.assignment = data.assignment;
      S.soloSet = new Set(data.solo_students);

      const session = {
        id: Store.newId(),
        label: '',
        date: new Date().toISOString(),
        assignment: data.assignment,
        solo_students: data.solo_students,
        unassigned_students: data.unassigned_students,
        warnings: data.warnings,
      };
      S.currentSession = session;
      S.cls = Store.getClass(S.classId);
      Store.saveSession(S.cls, session);
      S.cls = Store.getClass(S.classId);

      _renderSeatingGrid();
      _toast(I18n.t('toast_generated'), 'success');
    } catch (err) {
      _toast(I18n.t('toast_error') + ': ' + err.message, 'error');
    } finally {
      S.generating = false;
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7a5 5 0 0 1 5-5 5 5 0 0 1 3.5 1.5L12 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 5V1H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 7a5 5 0 0 1-5 5 5 5 0 0 1-3.5-1.5L2 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2 9v4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> ${I18n.t('btn_generate')}`;
    }
  }

  function _getPinOverrides() {
    const rule = S.cls?.rules.find(r => r.rule_type === 'pin_to_seat');
    if (!rule?.enabled) return {};
    return rule.config || {};
  }

  function _getSoloOverrides() {
    const rule = S.cls?.rules.find(r => r.rule_type === 'seat_alone');
    if (!rule?.enabled) return [];
    return rule.config?.students || [];
  }

  function _openPresent() {
    if (!S.cls) return;
    const data = {
      class_name: S.cls.name,
      seats: S.cls.seats,
      students: S.cls.students,
      assignment: S.assignment,
      solo_students: [...S.soloSet],
    };
    localStorage.setItem('ps_present', JSON.stringify(data));
    window.open('/present', '_blank');
  }

  // ── Export modal ──────────────────────────────────────────────────

  function _openExportModal(scope) {
    document.getElementById('export-scope-label').textContent =
      scope === 'session' ? I18n.t('export_current') : I18n.t('export_all');
    document.getElementById('modal-export').dataset.scope = scope;
    _openModal('modal-export');
  }

  function _bindExportForm() {
    document.querySelectorAll('.export-fmt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fmt = btn.dataset.fmt;
        const scope = document.getElementById('modal-export').dataset.scope;
        _closeModal('modal-export');
        await _doExport(fmt, scope);
      });
    });
  }

  async function _doExport(fmt, scope) {
    if (!S.cls) return;
    if (fmt === 'pdf') {
      if (!S.currentSession) { _toast('No session to export', 'error'); return; }
      const body = {
        class_name: S.cls.name,
        session_label: S.currentSession.label || '',
        session_date: S.currentSession.date,
        assignment: S.currentSession.assignment,
        solo_students: S.currentSession.solo_students || [],
        students: S.cls.students,
        seats: S.cls.seats,
        warnings: S.currentSession.warnings || [],
      };
      await _downloadPost('/api/export/pdf', body);
    } else {
      const sessions = scope === 'session' && S.currentSession
        ? [S.currentSession]
        : S.cls.sessions;
      const body = { sessions, students: S.cls.students, seats: S.cls.seats };
      await _downloadPost(`/api/export/${fmt}`, body);
    }
  }

  async function _downloadPost(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const disp = res.headers.get('content-disposition') || '';
      const filename = disp.match(/filename="([^"]+)"/)?.[1] || 'export';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      _toast(I18n.t('toast_error') + ': ' + err.message, 'error');
    }
  }

  // ── Students tab ──────────────────────────────────────────────────

  function _bindStudentsTab() {
    document.getElementById('btn-add-student').addEventListener('click', _openAddStudentModal);
    document.getElementById('btn-import-csv').addEventListener('click', () =>
      document.getElementById('csv-file-input').click()
    );
    document.getElementById('csv-file-input').addEventListener('change', _importCSV);
    document.getElementById('btn-download-sample').addEventListener('click', _downloadSample);
  }

  function _renderStudents() {
    if (!S.cls) return;
    const tbody = document.getElementById('student-tbody');
    tbody.innerHTML = '';
    if (!S.cls.students.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder-msg">No students yet.</td></tr>';
      return;
    }
    for (const s of S.cls.students) {
      const tr = document.createElement('tr');
      if (!s.is_active) tr.classList.add('inactive');
      tr.innerHTML = `
        <td>${_esc(s.name)}</td>
        <td><span class="chip-gender chip-gender-${s.gender}">${s.gender}</span></td>
        <td class="text-sub">${_esc(s.notes || '')}</td>
        <td>
          <label class="toggle" title="Active">
            <input type="checkbox" ${s.is_active ? 'checked' : ''} data-sid="${s.id}" class="student-active-toggle" />
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" data-action="edit-student" data-sid="${s.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-student" data-sid="${s.id}" style="color:var(--danger)">✕</button>
        </td>`;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.student-active-toggle').forEach(chk => {
      chk.addEventListener('change', () => {
        Store.updateStudent(S.cls, chk.dataset.sid, { is_active: chk.checked });
        S.cls = Store.getClass(S.classId);
      });
    });
    tbody.querySelectorAll('[data-action="edit-student"]').forEach(btn => {
      btn.addEventListener('click', () => _openEditStudentModal(btn.dataset.sid));
    });
    tbody.querySelectorAll('[data-action="delete-student"]').forEach(btn => {
      btn.addEventListener('click', () => _confirmDeleteStudent(btn.dataset.sid));
    });
  }

  function _openAddStudentModal() {
    document.getElementById('modal-student-title').textContent = I18n.t('btn_add_student');
    document.getElementById('sf-name').value = '';
    document.getElementById('sf-gender').value = 'X';
    document.getElementById('sf-notes').value = '';
    document.getElementById('sf-id').value = '';
    _openModal('modal-student');
    document.getElementById('sf-name').focus();
  }

  function _openEditStudentModal(id) {
    const s = S.cls.students.find(s => s.id === id);
    if (!s) return;
    document.getElementById('modal-student-title').textContent = 'Edit Student';
    document.getElementById('sf-name').value = s.name;
    document.getElementById('sf-gender').value = s.gender;
    document.getElementById('sf-notes').value = s.notes || '';
    document.getElementById('sf-id').value = id;
    _openModal('modal-student');
  }

  function _bindStudentForm() {
    document.getElementById('student-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!S.cls) return;
      const id = document.getElementById('sf-id').value;
      const name = document.getElementById('sf-name').value.trim();
      const gender = document.getElementById('sf-gender').value;
      const notes = document.getElementById('sf-notes').value.trim();
      if (!name) return;
      if (id) {
        Store.updateStudent(S.cls, id, { name, gender, notes });
      } else {
        Store.addStudent(S.cls, name, gender, notes);
      }
      S.cls = Store.getClass(S.classId);
      _renderStudents();
      _closeModal('modal-student');
      _toast(I18n.t('toast_saved'), 'success');
    });
  }

  function _confirmDeleteStudent(id) {
    _confirm(I18n.t('confirm_delete_student'), () => {
      Store.deleteStudent(S.cls, id);
      S.cls = Store.getClass(S.classId);
      _renderStudents();
      _toast(I18n.t('toast_deleted'));
    });
  }

  function _importCSV(e) {
    const file = e.target.files[0];
    if (!file || !S.cls) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const nameIdx   = headers.indexOf('name');
      const genderIdx = headers.indexOf('gender');
      const notesIdx  = headers.indexOf('notes');
      if (nameIdx < 0) { _toast('CSV must have a "name" column', 'error'); return; }
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx];
        if (!name) continue;
        const gender = genderIdx >= 0 ? (cols[genderIdx] || 'X').toUpperCase() : 'X';
        const notes  = notesIdx  >= 0 ? (cols[notesIdx]  || '')                : '';
        Store.addStudent(S.cls, name, ['M','F','X'].includes(gender) ? gender : 'X', notes);
        count++;
      }
      S.cls = Store.getClass(S.classId);
      _renderStudents();
      _toast(`${count} ${I18n.t('toast_imported')}`, 'success');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function _downloadSample() {
    const csv = `name,gender,notes,pin_row,pin_col,pin_side,seat_alone,min_row,max_row
Alice Example,F,,,,,,,
Bob Example,M,Near front,,,,,0,1
Carol Example,F,,2,1,L,,,
Dave Example,M,Solo student,,,,true,,
Eve Example,X,,,,,,,`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'students_sample.csv';
    a.click();
  }

  // ── Rules tab ─────────────────────────────────────────────────────

  function _renderRules() {
    if (!S.cls) return;
    const container = document.getElementById('rules-container');
    container.innerHTML = '';

    const GROUPS = [
      {
        key: 'pairing', label: I18n.t('rule_pairing'),
        rules: ['no_repeat', 'gender_mixing'],
      },
      {
        key: 'movement', label: I18n.t('rule_movement'),
        rules: ['row_progression', 'front_rows_first'],
      },
      {
        key: 'proximity', label: I18n.t('rule_proximity'),
        rules: ['vicinity', 'positional'],
      },
      {
        key: 'overrides', label: I18n.t('rule_overrides'),
        rules: ['pin_to_seat', 'seat_alone'],
      },
    ];

    const RULE_META = {
      no_repeat:        { name: I18n.t('rule_no_repeat'),    desc: I18n.t('rule_no_repeat_desc') },
      gender_mixing:    { name: I18n.t('rule_gender'),       desc: I18n.t('rule_gender_desc') },
      row_progression:  { name: I18n.t('rule_row_prog'),     desc: I18n.t('rule_row_prog_desc') },
      front_rows_first: { name: I18n.t('rule_front_first'),  desc: I18n.t('rule_front_first_desc') },
      vicinity:         { name: I18n.t('rule_keep_apart'),   desc: I18n.t('rule_keep_apart_desc') },
      positional:       { name: I18n.t('rule_row_restrict'), desc: I18n.t('rule_row_restrict_desc') },
      pin_to_seat:      { name: I18n.t('rule_pin'),          desc: I18n.t('rule_pin_desc') },
      seat_alone:       { name: I18n.t('rule_solo'),         desc: I18n.t('rule_solo_desc') },
    };

    // Expert toggle header
    const expertToggle = document.createElement('div');
    expertToggle.className = 'expert-toggle-row';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle';
    const toggleChk = document.createElement('input');
    toggleChk.type = 'checkbox';
    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';
    toggleLabel.appendChild(toggleChk);
    toggleLabel.appendChild(toggleSlider);

    const expertLabel = document.createElement('span');
    expertLabel.textContent = I18n.t('expert_mode');

    expertToggle.appendChild(toggleLabel);
    expertToggle.appendChild(expertLabel);

    const groups = document.createElement('div');
    groups.className = 'rules-groups';

    toggleChk.addEventListener('change', () => {
      groups.classList.toggle('expert', toggleChk.checked);
    });

    container.appendChild(expertToggle);

    for (const group of GROUPS) {
      const groupEl = document.createElement('div');
      groupEl.className = 'rule-group';
      const lbl = document.createElement('div');
      lbl.className = 'rule-group-label';
      lbl.textContent = group.label;
      groupEl.appendChild(lbl);

      for (const ruleType of group.rules) {
        const rule = S.cls.rules.find(r => r.rule_type === ruleType);
        if (!rule) continue;
        const meta = RULE_META[ruleType];
        const row = _buildRuleRow(rule, meta);
        groupEl.appendChild(row);
      }
      groups.appendChild(groupEl);
    }

    container.appendChild(groups);
  }

  function _buildRuleRow(rule, meta) {
    const row = document.createElement('div');
    row.className = 'rule-row';

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle rule-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.addEventListener('change', () => {
      rule.enabled = checkbox.checked;
      Store.saveClass(S.cls);
      configDiv.classList.toggle('hidden', !rule.enabled);
    });
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(slider);

    const body = document.createElement('div');
    body.className = 'rule-body';
    body.innerHTML = `<div class="rule-name">${meta.name}</div><div class="rule-desc">${meta.desc}</div>`;

    const configDiv = document.createElement('div');
    configDiv.className = 'rule-config' + (rule.enabled ? '' : ' hidden');
    _buildRuleConfig(rule, configDiv);
    body.appendChild(configDiv);

    row.appendChild(toggleLabel);
    row.appendChild(body);

    const isHardOverride = rule.rule_type === 'pin_to_seat' || rule.rule_type === 'seat_alone';
    if (!isHardOverride) {
      const priorityWrap = document.createElement('div');
      priorityWrap.className = 'rule-priority-wrap';
      priorityWrap.innerHTML = `<span class="rule-priority-label">Weight</span>`;
      const priorityInput = document.createElement('input');
      priorityInput.type = 'number';
      priorityInput.className = 'input input-xs';
      priorityInput.min = 1; priorityInput.max = 10;
      priorityInput.value = rule.priority ?? 5;
      priorityInput.style.width = '48px';
      priorityInput.addEventListener('change', () => {
        rule.priority = Math.min(10, Math.max(1, parseInt(priorityInput.value) || 5));
        priorityInput.value = rule.priority;
        Store.saveClass(S.cls);
      });
      priorityWrap.appendChild(priorityInput);
      row.appendChild(priorityWrap);
    }

    return row;
  }

  function _buildRuleConfig(rule, el) {
    el.innerHTML = '';
    const students = S.cls.students.filter(s => s.is_active);

    if (rule.rule_type === 'no_repeat') {
      el.innerHTML = `
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
          ${I18n.t('sessions_back')}:
          <input type="number" class="input input-xs" min="1" max="10" value="${rule.config.sessions_back || 1}" id="cfg-sessions-back" />
          ${I18n.t('sessions_back_unit')}
        </label>`;
      el.querySelector('#cfg-sessions-back').addEventListener('change', e => {
        rule.config.sessions_back = parseInt(e.target.value) || 1;
        Store.saveClass(S.cls);
      });
    }

    if (rule.rule_type === 'gender_mixing') {
      const pct = Math.round((rule.config.min_mixed_ratio || 0.5) * 100);
      el.innerHTML = `
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;">
          ${I18n.t('min_mixed')}:
          <input type="number" class="input input-xs" min="0" max="100" value="${pct}" id="cfg-min-mixed" />%
        </label>`;
      el.querySelector('#cfg-min-mixed').addEventListener('change', e => {
        rule.config.min_mixed_ratio = (parseInt(e.target.value) || 50) / 100;
        Store.saveClass(S.cls);
      });
    }

    if (rule.rule_type === 'vicinity') {
      _buildVicinityConfig(rule, el, students);
    }

    if (rule.rule_type === 'positional') {
      _buildPositionalConfig(rule, el, students);
    }

    if (rule.rule_type === 'pin_to_seat') {
      _buildPinConfig(rule, el, students);
    }

    if (rule.rule_type === 'seat_alone') {
      _buildSoloConfig(rule, el, students);
    }
  }

  function _buildVicinityConfig(rule, el, students) {
    if (!rule.config.separation_pairs) rule.config.separation_pairs = {};
    const render = () => {
      el.innerHTML = '';
      for (const [sid, avoidList] of Object.entries(rule.config.separation_pairs)) {
        const student = students.find(s => s.id === sid);
        if (!student) continue;
        for (const avoidId of avoidList) {
          const avoid = students.find(s => s.id === avoidId);
          if (!avoid) continue;
          const pill = document.createElement('div');
          pill.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;';
          pill.innerHTML = `<span>${_esc(student.name)} ↔ ${_esc(avoid.name)}</span>
            <button class="btn btn-ghost btn-sm" style="padding:2px 6px;">✕</button>`;
          pill.querySelector('button').addEventListener('click', () => {
            rule.config.separation_pairs[sid] = (rule.config.separation_pairs[sid] || []).filter(id => id !== avoidId);
            if (!rule.config.separation_pairs[sid].length) delete rule.config.separation_pairs[sid];
            Store.saveClass(S.cls);
            render();
          });
          el.appendChild(pill);
        }
      }
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
      const sel1 = _studentSelect(students, '', 'sel-apart-1');
      const sel2 = _studentSelect(students, '', 'sel-apart-2');
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = I18n.t('label_add_pair');
      addBtn.addEventListener('click', () => {
        const s1 = sel1.value, s2 = sel2.value;
        if (!s1 || !s2 || s1 === s2) return;
        if (!rule.config.separation_pairs[s1]) rule.config.separation_pairs[s1] = [];
        if (!rule.config.separation_pairs[s1].includes(s2)) rule.config.separation_pairs[s1].push(s2);
        Store.saveClass(S.cls);
        render();
      });
      addRow.appendChild(sel1); addRow.appendChild(sel2); addRow.appendChild(addBtn);
      el.appendChild(addRow);
    };
    render();
  }

  function _buildPositionalConfig(rule, el, students) {
    if (!rule.config.constraints) rule.config.constraints = {};
    const maxRow = S.cls.grid_rows - 1;
    const render = () => {
      el.innerHTML = '';
      for (const [sid, bounds] of Object.entries(rule.config.constraints)) {
        const student = students.find(s => s.id === sid);
        if (!student) continue;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;';
        row.innerHTML = `<span style="min-width:80px">${_esc(student.name)}</span>
          Rows <input type="number" class="input input-xs" min="0" max="${maxRow}" value="${bounds.min_row ?? 0}" />
          – <input type="number" class="input input-xs" min="0" max="${maxRow}" value="${bounds.max_row ?? maxRow}" />
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;">✕</button>`;
        const [minInput, maxInput] = row.querySelectorAll('input[type=number]');
        minInput.addEventListener('change', () => { bounds.min_row = parseInt(minInput.value) || 0; Store.saveClass(S.cls); });
        maxInput.addEventListener('change', () => { bounds.max_row = parseInt(maxInput.value) || maxRow; Store.saveClass(S.cls); });
        row.querySelector('button').addEventListener('click', () => {
          delete rule.config.constraints[sid]; Store.saveClass(S.cls); render();
        });
        el.appendChild(row);
      }
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
      const sel = _studentSelect(students.filter(s => !rule.config.constraints[s.id]), '', 'sel-pos');
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = I18n.t('label_add_restriction');
      addBtn.addEventListener('click', () => {
        if (!sel.value) return;
        rule.config.constraints[sel.value] = { min_row: 0, max_row: maxRow };
        Store.saveClass(S.cls); render();
      });
      addRow.appendChild(sel); addRow.appendChild(addBtn);
      el.appendChild(addRow);
    };
    render();
  }

  function _buildPinConfig(rule, el, students) {
    const activeSeatIds = S.cls.seats.filter(s => s.is_active);
    const render = () => {
      el.innerHTML = '';
      for (const [sid, seatId] of Object.entries(rule.config)) {
        const student = students.find(s => s.id === sid);
        const seat = S.cls.seats.find(s => s.id === seatId);
        if (!student || !seat) continue;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:4px;';
        row.innerHTML = `<span style="min-width:80px">${_esc(student.name)}</span>
          → <span class="text-mono">R${seat.row_idx+1}${seat.side}C${seat.col_idx+1}</span>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;">✕</button>`;
        row.querySelector('button').addEventListener('click', () => {
          delete rule.config[sid]; Store.saveClass(S.cls); render();
        });
        el.appendChild(row);
      }
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;';
      const selS = _studentSelect(students.filter(s => !rule.config[s.id]), '', 'sel-pin-s');
      const selSeat = document.createElement('select');
      selSeat.className = 'select select-sm';
      selSeat.innerHTML = '<option value="">— seat —</option>';
      for (const seat of activeSeatIds) {
        const opt = document.createElement('option');
        opt.value = seat.id;
        opt.textContent = `R${seat.row_idx+1}${seat.side} C${seat.col_idx+1}`;
        selSeat.appendChild(opt);
      }
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Pin';
      addBtn.addEventListener('click', () => {
        if (!selS.value || !selSeat.value) return;
        rule.config[selS.value] = selSeat.value;
        Store.saveClass(S.cls); render();
      });
      addRow.appendChild(selS); addRow.appendChild(selSeat); addRow.appendChild(addBtn);
      el.appendChild(addRow);
    };
    render();
  }

  function _buildSoloConfig(rule, el, students) {
    if (!rule.config.students) rule.config.students = [];
    const render = () => {
      el.innerHTML = '';
      for (const sid of rule.config.students) {
        const student = students.find(s => s.id === sid);
        if (!student) continue;
        const pill = document.createElement('div');
        pill.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;';
        pill.innerHTML = `<span>${_esc(student.name)}</span>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;">✕</button>`;
        pill.querySelector('button').addEventListener('click', () => {
          rule.config.students = rule.config.students.filter(id => id !== sid);
          Store.saveClass(S.cls); render();
        });
        el.appendChild(pill);
      }
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';
      const sel = _studentSelect(students.filter(s => !rule.config.students.includes(s.id)), '', 'sel-solo');
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-ghost btn-sm';
      addBtn.textContent = '+ Add';
      addBtn.addEventListener('click', () => {
        if (!sel.value) return;
        rule.config.students.push(sel.value);
        Store.saveClass(S.cls); render();
      });
      addRow.appendChild(sel); addRow.appendChild(addBtn);
      el.appendChild(addRow);
    };
    render();
  }

  function _studentSelect(students, selected, id) {
    const sel = document.createElement('select');
    sel.className = 'select select-sm';
    if (id) sel.id = id;
    sel.innerHTML = '<option value="">— student —</option>';
    for (const s of students) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selected) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  // ── History tab ───────────────────────────────────────────────────

  function _renderHistory() {
    if (!S.cls) return;
    const container = document.getElementById('history-container');
    container.innerHTML = '';

    if (!S.cls.sessions.length) {
      container.innerHTML = `<div class="placeholder-msg">${I18n.t('history_empty')}</div>`;
      return;
    }

    const exportAllBtn = document.createElement('div');
    exportAllBtn.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;';
    exportAllBtn.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-export-history-xlsx">Export all XLSX</button>
      <button class="btn btn-ghost btn-sm" id="btn-export-history-csv">Export all CSV</button>`;
    exportAllBtn.querySelector('#btn-export-history-xlsx').addEventListener('click', () => _doExport('xlsx', 'all'));
    exportAllBtn.querySelector('#btn-export-history-csv').addEventListener('click',  () => _doExport('csv', 'all'));
    container.appendChild(exportAllBtn);

    const list = document.createElement('div');
    list.className = 'history-list';

    for (const sess of S.cls.sessions) {
      const item = document.createElement('div');
      item.className = 'history-item';
      const d = new Date(sess.date);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const assigned = Object.values(sess.assignment || {}).filter(Boolean).length;
      item.innerHTML = `
        <span class="history-date text-mono">${dateStr}</span>
        <span class="history-label">${_esc(sess.label || I18n.t('history_session'))}</span>
        <span class="history-meta">${assigned} seated</span>
        <div class="history-actions">
          <button class="btn btn-ghost btn-sm" data-action="load-session" data-sid="${sess.id}">Load</button>
          <button class="btn btn-ghost btn-sm" data-action="export-session-pdf" data-sid="${sess.id}">PDF</button>
          <button class="btn btn-ghost btn-sm" data-action="delete-session" data-sid="${sess.id}" style="color:var(--danger)">✕</button>
        </div>`;
      list.appendChild(item);
    }

    list.querySelectorAll('[data-action="load-session"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sess = S.cls.sessions.find(s => s.id === btn.dataset.sid);
        if (!sess) return;
        S.currentSession = sess;
        S.assignment = sess.assignment || {};
        S.soloSet = new Set(sess.solo_students || []);
        _switchTab('seating');
        _renderSeatingGrid();
      });
    });
    list.querySelectorAll('[data-action="export-session-pdf"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sess = S.cls.sessions.find(s => s.id === btn.dataset.sid);
        if (!sess) return;
        S.currentSession = sess;
        await _doExport('pdf', 'session');
      });
    });
    list.querySelectorAll('[data-action="delete-session"]').forEach(btn => {
      btn.addEventListener('click', () => {
        _confirm(I18n.t('confirm_delete_session'), () => {
          Store.deleteSession(S.cls, btn.dataset.sid);
          S.cls = Store.getClass(S.classId);
          _renderHistory();
          _toast(I18n.t('toast_deleted'));
        });
      });
    });

    container.appendChild(list);
  }

  // ── Class Settings tab ────────────────────────────────────────────

  function _renderClassSettings() {
    if (!S.cls) return;
    document.getElementById('cs-name').value = S.cls.name;
    document.getElementById('cs-description').value = S.cls.description || '';
    document.getElementById('cs-rows').value = S.cls.grid_rows;
    document.getElementById('cs-cols').value = S.cls.grid_cols;
    _renderEditorGrid();
  }

  function _renderEditorGrid() {
    if (!S.cls) return;
    Grid.render({
      seats: S.cls.seats,
      students: {},
      assignment: {},
      editMode: true,
      containerId: 'editor-grid',
      onSeatToggle: seatId => {
        const seat = S.cls.seats.find(s => s.id === seatId);
        if (seat) {
          seat.is_active = !seat.is_active;
          Store.saveClass(S.cls);
          _renderEditorGrid();
        }
      },
    });
  }

  function _bindSettingsTab() {
    document.getElementById('class-settings-form').addEventListener('submit', e => {
      e.preventDefault();
      if (!S.cls) return;
      S.cls.name = document.getElementById('cs-name').value.trim() || S.cls.name;
      S.cls.description = document.getElementById('cs-description').value;
      const newRows = parseInt(document.getElementById('cs-rows').value) || S.cls.grid_rows;
      const newCols = parseInt(document.getElementById('cs-cols').value) || S.cls.grid_cols;
      if (newRows !== S.cls.grid_rows || newCols !== S.cls.grid_cols) {
        if (!confirm('Changing grid size will reset the seat layout. Continue?')) return;
        S.cls.grid_rows = newRows;
        S.cls.grid_cols = newCols;
        Store.resetSeats(S.cls);
      }
      Store.saveClass(S.cls);
      S.cls = Store.getClass(S.classId);
      document.getElementById('class-title').textContent = S.cls.name;
      _renderClassList();
      _toast(I18n.t('toast_saved'), 'success');
    });

    document.getElementById('btn-reset-layout').addEventListener('click', () => {
      if (!confirm('Reset all seat toggles to active?')) return;
      Store.resetSeats(S.cls);
      S.cls = Store.getClass(S.classId);
      _renderEditorGrid();
    });
  }

  // ── Delete class ──────────────────────────────────────────────────

  function _confirmDeleteClass() {
    _confirm(I18n.t('confirm_delete_class'), () => {
      Store.deleteClass(S.classId);
      S.classId = null;
      S.cls = null;
      _renderClassList();
      _showView('dashboard');
      _toast(I18n.t('toast_deleted'));
    });
  }

  // ── Modals ────────────────────────────────────────────────────────

  function _bindModals() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-dismiss]');
      if (btn) _closeModal(btn.dataset.dismiss);
      if (e.target.classList.contains('modal-overlay')) _closeModal(e.target.id);
    });
    _bindClassForm();
    _bindStudentForm();
    _bindExportForm();
  }

  function _openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
  function _closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

  function _confirm(msg, cb) {
    document.getElementById('confirm-message').textContent = msg;
    _openModal('modal-confirm');
    const btn = document.getElementById('btn-confirm-ok');
    const handler = () => { _closeModal('modal-confirm'); cb(); btn.removeEventListener('click', handler); };
    btn.addEventListener('click', handler);
  }

  // ── Toast ─────────────────────────────────────────────────────────

  function _toast(msg, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ── Utilities ─────────────────────────────────────────────────────

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());

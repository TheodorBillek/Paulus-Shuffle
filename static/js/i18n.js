'use strict';

const I18n = (() => {
  const TRANSLATIONS = {
    en: {
      app_name: 'Shuffle Service',
      nav_classes: 'Classes', nav_new_class: 'New Class', nav_settings: 'Settings',
      dashboard_title: 'Shuffle Service', dashboard_sub: 'Select a class from the sidebar, or create a new one to get started.',
      tab_seating: 'Seating', tab_students: 'Students', tab_rules: 'Rules', tab_history: 'History', tab_settings: 'Settings',
      btn_generate: 'Generate', btn_save: 'Save', btn_cancel: 'Cancel', btn_delete: 'Delete', btn_add_student: 'Add Student',
      btn_import_csv: 'Import CSV', btn_export: 'Export', btn_present: 'Present', btn_pdf: 'PDF',
      btn_add_class: 'New Class', btn_reset_layout: 'Reset Layout',
      mode_weighted: 'Weighted', mode_random: 'Random',
      field_name: 'Name', field_gender: 'Gender', field_notes: 'Notes', field_description: 'Description',
      field_rows: 'Rows', field_cols: 'Tables per Row',
      gender_m: 'Male', gender_f: 'Female', gender_x: 'Other / Unknown',
      unassigned: 'Unassigned', drag_hint: 'Drag students to seats',
      history_empty: 'No sessions yet. Hit Generate to create the first seating plan.',
      history_session: 'Session', history_delete: 'Delete session',
      rule_pairing: 'Pairing Rules', rule_movement: 'Movement Rules',
      rule_proximity: 'Proximity & Separation', rule_overrides: 'Hard Overrides',
      rule_no_repeat: 'No-repeat pairs', rule_no_repeat_desc: 'Avoid repeating the same table partner from previous sessions.',
      rule_gender: 'Gender mixing', rule_gender_desc: 'At least half of all pairs should be mixed-gender.',
      rule_row_prog: 'Row progression', rule_row_prog_desc: 'Each student moves to a different row each session.',
      rule_front_first: 'Front rows first', rule_front_first_desc: 'Pack students into the front rows before filling the back.',
      rule_keep_apart: 'Keep apart', rule_keep_apart_desc: 'Ensure specific students are not seated near each other.',
      rule_row_restrict: 'Row restriction', rule_row_restrict_desc: 'Restrict a student to a specific row range.',
      rule_pin: 'Pin to seat', rule_pin_desc: 'Lock a student to a specific seat permanently.',
      rule_solo: 'Seat alone', rule_solo_desc: 'Always assign a student a solo seat with no table partner.',
      expert_mode: 'Expert mode', expert_seat_weights: 'Seat preferences', expert_pair_weights: 'Pair preferences',
      sessions_back: 'Look back', sessions_back_unit: 'session(s)',
      min_mixed: 'Min mixed',
      label_add_pair: '+ Add pair', label_add_restriction: '+ Add restriction',
      label_student: 'Student', label_seat: 'Seat', label_min_row: 'Min row', label_max_row: 'Max row',
      btn_wipe_data: 'Wipe All Data',
      confirm_wipe_data: 'Delete ALL classes, students, and session history? This cannot be undone.',
      confirm_delete_class: 'Delete this class and all its data? This cannot be undone.',
      confirm_delete_session: 'Delete this session from history?',
      confirm_delete_student: 'Remove this student from the class?',
      toast_generated: 'Seating plan generated', toast_saved: 'Saved', toast_deleted: 'Deleted',
      toast_imported: 'Students imported', toast_error: 'Something went wrong',
      settings_lang: 'Language', settings_about: 'About',
      privacy_title: 'Privacy & Data',
      privacy_body: 'All class data — students, configurations, and session history — is stored exclusively in your browser\'s local storage. No personal data is sent to or retained by the server.',
      privacy_body2: 'The server only receives data temporarily during Generate and Export operations (to run the seating algorithm or create a PDF). It does not log, store, or share this data.',
      about_version: 'Version 4.0.0', about_license: 'AGPL-3.0 / Commercial · © 2026',
      seat_weights_desc: 'Set how strongly the algorithm should prefer placing this student in each seat. Higher = more likely.',
      pair_weights_desc: 'Set how strongly the algorithm should prefer or avoid pairing this student with each classmate.',
      btn_reset_weights: 'Reset all to neutral',
      export_format: 'Export format', export_scope: 'Scope',
      export_current: 'Current session', export_all: 'All history',
      solo_label: 'solo',
      teacher_front: 'TEACHER / BOARD',
    },
    de: {
      app_name: 'Shuffle Service',
      nav_classes: 'Klassen', nav_new_class: 'Neue Klasse', nav_settings: 'Einstellungen',
      dashboard_title: 'Shuffle Service', dashboard_sub: 'Wähle eine Klasse aus der Seitenleiste oder erstelle eine neue.',
      tab_seating: 'Sitzplan', tab_students: 'Schüler', tab_rules: 'Regeln', tab_history: 'Verlauf', tab_settings: 'Einstellungen',
      btn_generate: 'Generieren', btn_save: 'Speichern', btn_cancel: 'Abbrechen', btn_delete: 'Löschen', btn_add_student: 'Schüler hinzufügen',
      btn_import_csv: 'CSV importieren', btn_export: 'Exportieren', btn_present: 'Präsentieren', btn_pdf: 'PDF',
      btn_add_class: 'Neue Klasse', btn_reset_layout: 'Layout zurücksetzen',
      mode_weighted: 'Gewichtet', mode_random: 'Zufällig',
      field_name: 'Name', field_gender: 'Geschlecht', field_notes: 'Notizen', field_description: 'Beschreibung',
      field_rows: 'Reihen', field_cols: 'Tische pro Reihe',
      gender_m: 'Männlich', gender_f: 'Weiblich', gender_x: 'Andere / Unbekannt',
      unassigned: 'Nicht zugewiesen', drag_hint: 'Schüler auf Plätze ziehen',
      history_empty: 'Noch keine Sitzpläne. Klicke auf Generieren.',
      history_session: 'Sitzung', history_delete: 'Sitzung löschen',
      rule_pairing: 'Paarungsregeln', rule_movement: 'Bewegungsregeln',
      rule_proximity: 'Nähe & Trennung', rule_overrides: 'Feste Vorgaben',
      rule_no_repeat: 'Keine Wiederholungen', rule_no_repeat_desc: 'Verhindert, dass dieselben Schüler wieder nebeneinander sitzen.',
      rule_gender: 'Geschlechtermix', rule_gender_desc: 'Mindestens die Hälfte aller Paare soll gemischtgeschlechtlich sein.',
      rule_row_prog: 'Reihenwechsel', rule_row_prog_desc: 'Jeder Schüler wechselt jede Sitzung die Reihe.',
      rule_front_first: 'Vorne zuerst', rule_front_first_desc: 'Schüler werden von vorne nach hinten platziert.',
      rule_keep_apart: 'Trennen', rule_keep_apart_desc: 'Bestimmte Schüler sollen nicht nebeneinander sitzen.',
      rule_row_restrict: 'Reihenbeschränkung', rule_row_restrict_desc: 'Schüler auf einen Reihenbereich beschränken.',
      rule_pin: 'Platz fixieren', rule_pin_desc: 'Einen Schüler dauerhaft an einen bestimmten Platz binden.',
      rule_solo: 'Alleine sitzen', rule_solo_desc: 'Schüler bekommt immer einen Einzelplatz.',
      expert_mode: 'Expertenmodus', expert_seat_weights: 'Platzpräferenzen', expert_pair_weights: 'Paarpräferenzen',
      sessions_back: 'Zurückschauen', sessions_back_unit: 'Sitzung(en)',
      min_mixed: 'Min. gemischt',
      label_add_pair: '+ Paar hinzufügen', label_add_restriction: '+ Beschränkung hinzufügen',
      label_student: 'Schüler', label_seat: 'Platz', label_min_row: 'Min. Reihe', label_max_row: 'Max. Reihe',
      btn_wipe_data: 'Alle Daten löschen',
      confirm_wipe_data: 'ALLE Klassen, Schüler und Sitzungsdaten löschen? Dies kann nicht rückgängig gemacht werden.',
      confirm_delete_class: 'Diese Klasse und alle Daten löschen? Dies kann nicht rückgängig gemacht werden.',
      confirm_delete_session: 'Diese Sitzung aus dem Verlauf löschen?',
      confirm_delete_student: 'Diesen Schüler aus der Klasse entfernen?',
      toast_generated: 'Sitzplan generiert', toast_saved: 'Gespeichert', toast_deleted: 'Gelöscht',
      toast_imported: 'Schüler importiert', toast_error: 'Ein Fehler ist aufgetreten',
      settings_lang: 'Sprache', settings_about: 'Über',
      privacy_title: 'Datenschutz & Daten',
      privacy_body: 'Alle Klassendaten – Schüler, Konfigurationen und Sitzungsverlauf – werden ausschließlich im lokalen Speicher Ihres Browsers gespeichert. Keine persönlichen Daten werden an den Server übermittelt oder gespeichert.',
      privacy_body2: 'Der Server empfängt Daten nur vorübergehend während der Generierungs- und Exportvorgänge. Er protokolliert, speichert oder teilt diese Daten nicht.',
      about_version: 'Version 4.0.0', about_license: 'AGPL-3.0 / Commercial · © 2026',
      seat_weights_desc: 'Wie stark soll der Algorithmus diesen Schüler bevorzugt auf diesen Platz setzen.',
      pair_weights_desc: 'Wie stark soll der Algorithmus diese Schüler bevorzugt zusammen oder getrennt einplanen.',
      btn_reset_weights: 'Alle zurücksetzen',
      export_format: 'Exportformat', export_scope: 'Bereich',
      export_current: 'Aktuelle Sitzung', export_all: 'Gesamter Verlauf',
      solo_label: 'allein',
      teacher_front: 'TAFEL / VORNE',
    },
  };

  let _lang = 'en';

  function init() {
    const stored = localStorage.getItem('ps_lang') || document.cookie.match(/ps_lang=([^;]+)/)?.[1] || 'en';
    _lang = TRANSLATIONS[stored] ? stored : 'en';
    _apply();
  }

  function load(lang) {
    if (!TRANSLATIONS[lang]) return;
    _lang = lang;
    localStorage.setItem('ps_lang', lang);
    document.cookie = `ps_lang=${lang};path=/;max-age=31536000`;
    _apply();
  }

  function t(key) {
    return TRANSLATIONS[_lang][key] ?? TRANSLATIONS['en'][key] ?? key;
  }

  function _apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === _lang);
    });
  }

  function current() { return _lang; }

  return { init, load, t, current };
})();

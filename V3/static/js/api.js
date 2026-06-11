'use strict';

const API = (() => {
  async function _req(method, path, body = null) {
    const opts = {
      method,
      headers: body !== null && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {},
    };
    if (body !== null) {
      opts.body = body instanceof FormData ? body : JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = j.detail || JSON.stringify(j); } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  const get    = (p)      => _req('GET',    p);
  const post   = (p, b)   => _req('POST',   p, b);
  const put    = (p, b)   => _req('PUT',    p, b);
  const patch  = (p, b)   => _req('PATCH',  p, b);
  const del    = (p)      => _req('DELETE', p);

  return {
    // Classes
    getClasses:       ()       => get('/api/classes'),
    createClass:      (b)      => post('/api/classes', b),
    getClass:         (id)     => get(`/api/classes/${id}`),
    updateClass:      (id, b)  => put(`/api/classes/${id}`, b),
    deleteClass:      (id)     => del(`/api/classes/${id}`),

    // Seats
    getSeats:         (cid)       => get(`/api/classes/${cid}/seats`),
    toggleSeat:       (cid, sid, b) => patch(`/api/classes/${cid}/seats/${sid}`, b),
    resetSeats:       (cid)       => post(`/api/classes/${cid}/seats/reset`, {}),

    // Students
    getStudents:      (cid)    => get(`/api/classes/${cid}/students`),
    createStudent:    (cid, b) => post(`/api/classes/${cid}/students`, b),
    updateStudent:    (id, b)  => put(`/api/students/${id}`, b),
    deleteStudent:    (id)     => del(`/api/students/${id}`),
    importCSV:        (cid, fd) => _req('POST', `/api/classes/${cid}/students/import`, fd),

    // Rules
    getRules:         (cid)          => get(`/api/classes/${cid}/rules`),
    updateRule:       (cid, type, b) => put(`/api/classes/${cid}/rules/${type}`, b),

    // Weights — positions
    getPositionWeights: (cid, sid)    => get(`/api/classes/${cid}/weights/positions/${sid}`),
    setPositionWeights: (cid, sid, b) => put(`/api/classes/${cid}/weights/positions/${sid}`, b),

    // Weights — pairs
    getPairWeights:   (cid, sid)    => get(`/api/classes/${cid}/weights/pairs/${sid}`),
    setPairWeight:    (cid, sid, b) => put(`/api/classes/${cid}/weights/pairs/${sid}`, b),

    // Sessions
    getSessions:      (cid)    => get(`/api/classes/${cid}/sessions`),
    getSession:       (id)     => get(`/api/sessions/${id}`),
    getAssignments:   (id)     => get(`/api/sessions/${id}/assignments`),
    generateSession:  (cid, b) => post(`/api/classes/${cid}/sessions/generate`, b),
    patchAssignments: (id, b)  => patch(`/api/sessions/${id}/assignments`, b),
    deleteSession:    (id)     => del(`/api/sessions/${id}`),

    // Export
    exportPDF: (sessionId, fmt = 'visual') =>
      `/api/sessions/${sessionId}/export/pdf?fmt=${fmt}`,
  };
})();

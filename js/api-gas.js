/* Lớp lưu trữ cho bản chạy độc lập: gọi backend Google Apps Script (apps-script/Code.gs).
   Giao diện (app.js) chỉ biết đến window.TDA_API, nên đổi nơi lưu dữ liệu chỉ cần thay file này. */
(() => {
  const cfg = window.TDA_CONFIG || {};
  const ls = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
  };
  let uid = ls.get('tda.uid');
  if (!uid) {
    uid = 'u' + ((window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
    ls.set('tda.uid', uid);
  }
  let adminKey = ls.get('tda.adminKey');
  let ipCache = null;

  const fail = (code, message) => Object.assign(new Error(message), { code, userMessage: message });

  async function call(action, payload) {
    if (!cfg.GAS_URL) throw fail('no_url', 'Chưa cấu hình GAS_URL trong js/config.js.');
    let res;
    try {
      /* Không đặt header: body dạng chữ giúp trình duyệt gửi "simple request", không bị chặn CORS. */
      res = await fetch(cfg.GAS_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, uid, key: adminKey }, payload || {})) });
    } catch (e) {
      throw fail('network', 'Không kết nối được máy chủ. Hãy kiểm tra mạng và địa chỉ GAS_URL.');
    }
    let j;
    try { j = await res.json(); } catch (e) {
      throw fail('bad_response', 'Máy chủ trả về dữ liệu lạ. Hãy kiểm tra Apps Script đã triển khai với quyền truy cập "Bất kỳ ai".');
    }
    if (!j.ok) throw fail(j.code || 'server', j.error || 'Máy chủ báo lỗi.');
    return j.data;
  }

  async function getIp() {
    if (cfg.COLLECT_IP === false) return '';
    if (ipCache !== null) return ipCache;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3500);
      const r = await fetch('https://api.ipify.org?format=json', { signal: ctl.signal });
      clearTimeout(timer);
      ipCache = String((await r.json()).ip || '');
    } catch (e) { ipCache = ''; }
    return ipCache;
  }

  const b64ToBuf = (b64) => {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  };
  const fileToB64 = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fail('read', 'Không đọc được file này.'));
    fr.readAsDataURL(file);
  });

  const A = {
    kind: 'gas',
    uid,
    canLogin: true,
    canDrive: false,
    storageNote: 'Đề và kết quả được lưu trên Google Drive của admin.',
    privacyNote: cfg.COLLECT_IP === false
      ? 'Admin có thể thấy tên, môn và tiến độ làm bài của bạn.'
      : 'Admin có thể thấy tên, địa chỉ IP, môn và tiến độ làm bài của bạn.',

    async init() {
      if (!cfg.GAS_URL) return { ok: false, code: 'no_url' };
      try {
        const r = await call('ping');
        if (adminKey && !r.admin) { adminKey = ''; ls.del('tda.adminKey'); }
        A.canDrive = !!r.admin;
        return { ok: true, admin: !!r.admin, canWrite: true };
      } catch (e) { return { ok: false, code: e.code || 'network', message: e.userMessage }; }
    },
    async loginAdmin(key) {
      const old = adminKey;
      adminKey = String(key || '').trim();
      try {
        const r = await call('ping');
        if (r.admin) { ls.set('tda.adminKey', adminKey); A.canDrive = true; return true; }
      } catch (e) { adminKey = old; throw e; }
      adminKey = old;
      return false;
    },
    logoutAdmin() { adminKey = ''; ls.del('tda.adminKey'); A.canDrive = false; },

    listSubjects: () => call('subjects'),
    getSubject: (sid) => call('subject', { sid }),
    saveSubject: (meta, chapters) => call('saveSubject', { meta, chapters }),
    deleteSubject: (sid) => call('deleteSubject', { sid }),

    async getMine() { const r = await call('me'); return { runs: (r && r.runs) || [] }; },
    saveRun: (name, run) => call('saveRun', { name, run }),
    getStats: (sid) => call('stats', { sid }),

    async heartbeat(data) { return call('heartbeat', { data: Object.assign({ ip: await getIp() }, data) }); },
    getLive: () => call('live'),

    sendReport: (rep) => call('report', { report: rep }),
    getReports: () => call('reports'),
    resolveReport: (rep) => call('resolveReport', { id: rep.id }),

    driveList: () => call('driveList'),
    async driveRead(f) { const r = await call('driveRead', { id: f.id }); return { docx: b64ToBuf(r.base64) }; },
    async driveUpload(file) { await call('driveUpload', { name: file.name, base64: await fileToB64(file) }); },
  };
  window.TDA_API = A;
})();

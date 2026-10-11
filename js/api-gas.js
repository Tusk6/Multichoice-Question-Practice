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

  /* Đường dự phòng: nạp kết quả bằng thẻ script (JSONP). Một số trình duyệt điện thoại
     (Safari, trình duyệt trong Zalo/Facebook) chặn fetch tới Apps Script nhưng vẫn nạp được script. */
  let cbN = 0;
  const NETMSG = 'Không kết nối được máy chủ. Hãy kiểm tra mạng và địa chỉ GAS_URL.';
  function jsonp(body) {
    return new Promise((resolve, reject) => {
      const url0 = cfg.GAS_URL + (cfg.GAS_URL.indexOf('?') < 0 ? '?' : '&');
      const name = '__tda' + Date.now().toString(36) + (++cbN);
      const url = url0 + 'callback=' + name + '&q=' + encodeURIComponent(body);
      if (url.length > 7000) { reject(fail('too_big', 'Dữ liệu quá lớn để gửi bằng đường dự phòng. Hãy dùng máy tính.')); return; }
      const s = document.createElement('script');
      let t, t2;
      const done = () => { clearTimeout(t); clearTimeout(t2); delete window[name]; s.remove(); };
      const bad = (why) => { done(); reject(fail('network', NETMSG + ' [dự phòng: ' + why + ']')); };
      t = setTimeout(() => bad('quá thời gian chờ'), 25000);
      window[name] = (j) => { done(); resolve(j); };
      s.onerror = () => bad('không nạp được script');
      /* Script nạp xong mà không gọi hàm: máy chủ chưa phải bản Code.gs mới (chưa triển khai phiên bản mới) hoặc trả về trang khác */
      s.onload = () => { t2 = setTimeout(() => bad('máy chủ chưa trả đúng định dạng, hãy triển khai phiên bản mới của Code.gs'), 1500); };
      s.src = url;
      document.head.appendChild(s);
    });
  }
  let viaScript = ls.get('tda.jsonp') === '1';

  async function call(action, payload) {
    if (!cfg.GAS_URL) throw fail('no_url', 'Chưa cấu hình GAS_URL trong js/config.js.');
    const body = JSON.stringify(Object.assign({ action, uid, key: adminKey }, payload || {}));
    let j;
    if (viaScript) j = await jsonp(body);
    else {
      let why = '';
      try {
        /* Không đặt header: body dạng chữ giúp trình duyệt gửi "simple request", không bị chặn CORS. */
        const res = await fetch(cfg.GAS_URL, { method: 'POST', body });
        j = await res.json();
      } catch (e) { why = String((e && e.message) || e); }
      if (why) {
        /* fetch bị chặn hoặc trả về lạ: thử đường dự phòng, nhớ lại nếu thành công */
        try { j = await jsonp(body); } catch (e2) { e2.userMessage = e2.message = e2.message + ' [fetch: ' + why + ']'; throw e2; }
        viaScript = true; ls.set('tda.jsonp', '1');
      }
    }
    if (!j || typeof j !== 'object') throw fail('bad_response', 'Máy chủ trả về dữ liệu lạ. Hãy kiểm tra Apps Script đã triển khai với quyền truy cập "Bất kỳ ai".');
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

  /* Cùng một tên thì cùng một tài khoản: mã người dùng được tính từ tên, nên máy tính và điện thoại
     nhập cùng tên sẽ thấy cùng kết quả và cùng phần đang làm dở. */
  const fnv32 = (str) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  };
  function uidFromName(name) {
    const n = String(name || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return '';
    let hex = '';
    try { hex = Array.from(new TextEncoder().encode(n).slice(0, 20)).map((b) => (b < 16 ? '0' : '') + b.toString(16)).join(''); } catch (e) { hex = ''; }
    return 'n' + hex + '-' + fnv32(n) + fnv32(n.split('').reverse().join(''));
  }

  const A = {
    kind: 'gas',
    get uid() { return uid; },
    setName(name) {
      const u = uidFromName(name);
      if (u) { uid = u; ls.set('tda.uid', u); }
    },
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

    async hasImages(ids) { return (await call('imagesHave', { ids })) || []; },
    saveImage: (id, d) => call('saveImage', { id, d }),
    async getImage(id) { const r = await call('image', { id }); return (r && r.d) || ''; },

    async getProgress() { return (await call('getProgress')) || null; },
    saveProgress: (p) => call('saveProgress', { p }),
    clearProgress: () => call('clearProgress'),

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

/**
 * Multichoice - Question Practice: backend Google Apps Script.
 *
 * Lưu mọi dữ liệu vào thư mục Google Drive "Multiple-Choice Question Bank":
 *   - các file đề .docx do admin bỏ vào thư mục này;
 *   - thư mục con "_data" chứa dữ liệu của web (đề đã nhập, kết quả, thống kê, báo lỗi).
 *
 * Cách dùng: xem README.md. Chạy hàm setup() một lần, sau đó Deploy > Web app.
 */

const ROOT_NAME = 'Multiple-Choice Question Bank';
const DATA_NAME = '_data';
const VERSION = 1;
const MAX_RUNS = 40;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let rootCache_ = null;
let dataCache_ = null;

/* ---------- Cài đặt (chạy tay một lần trong trình soạn thảo) ---------- */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const root = findRoot_(true);
  props.setProperty('ROOT_ID', root.getId());
  dataDir_();
  let key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('Thư mục dữ liệu: ' + root.getName() + ' (' + root.getUrl() + ')');
  Logger.log('Mật khẩu admin: ' + key);
  Logger.log('Muốn đổi mật khẩu: Project Settings > Script Properties > sửa ADMIN_KEY.');
  return key;
}

/* ---------- Điểm vào của web app ---------- */
function doGet(e) {
  const q = e && e.parameter && e.parameter.q;
  if (!q) return json_({ ok: true, data: { name: 'Multichoice - Question Practice API', version: VERSION } });
  /* Đường dự phòng cho trình duyệt điện thoại: gọi bằng GET, trả về JSONP (thẻ script, không bị chặn CORS). */
  const cb = String(e.parameter.callback || '');
  let out;
  try { out = handle_(q); } catch (err) { out = { ok: false, error: 'Yêu cầu không hợp lệ.', code: 'bad_request' }; }
  if (/^[A-Za-z_$][A-Za-z0-9_$]{0,60}$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(out);
}
function doPost(e) {
  return json_(handle_((e && e.postData && e.postData.contents) || '{}'));
}
function handle_(text) {
  try {
    return { ok: true, data: route_(JSON.parse(text)) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), code: (err && err.code) || 'server' };
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function coded_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/* ---------- Định tuyến ---------- */
const PUBLIC_ = {
  ping: (r) => ({ admin: isAdmin_(r.key), version: VERSION }),
  subjects: () => readJson_(dataDir_(), 'index.json', []),
  subject: (r) => {
    const s = readJson_(dataDir_(), 's_' + id_(r.sid) + '.json', null);
    if (!s) throw coded_('not_found', 'Không tìm thấy môn này.');
    return s;
  },
  me: (r) => readJson_(dataDir_(), 'u_' + id_(r.uid) + '.json', { name: '', runs: [] }),
  saveRun: (r) => saveRun_(id_(r.uid), str_(r.name, 60), cleanRun_(r.run)),
  heartbeat: (r) => heartbeat_(id_(r.uid), r.data || {}),
  image: (r) => {
    const o = readJson_(dataDir_(), 'img_' + id_(r.id) + '.json', null);
    if (!o) throw coded_('not_found', 'Không tìm thấy hình.');
    return o;
  },
  getProgress: (r) => readJson_(dataDir_(), 'pg_' + id_(r.uid) + '.json', null),
  saveProgress: (r) => saveProgress_(id_(r.uid), r.p || {}),
  clearProgress: (r) => { const u = id_(r.uid); withLock_(() => trash_(dataDir_(), 'pg_' + u + '.json')); return true; },
  report: (r) => saveReport_(id_(r.uid), r.report || {}),
};

const ADMIN_ = {
  saveSubject: (r) => saveSubject_(r.meta || {}, r.chapters || []),
  deleteSubject: (r) => deleteSubject_(id_(r.sid)),
  stats: (r) => {
    const st = readJson_(dataDir_(), 'st_' + id_(r.sid) + '.json', { runs: 0, users: {}, ch: {}, q: {} });
    return { runs: st.runs, people: Object.keys(st.users).length, ch: st.ch, q: st.q };
  },
  live: () => {
    const map = readLive_();
    return Object.keys(map).map((k) => map[k]);
  },
  reports: () => readJson_(dataDir_(), 'reports.json', []),
  resolveReport: (r) => resolveReport_(str_(r.id, 80)),
  imagesHave: (r) => (r.ids || []).slice(0, 200).map(id_).filter((x) => dataDir_().getFilesByName('img_' + x + '.json').hasNext()),
  saveImage: (r) => {
    const d = String(r.d || '');
    if (d.indexOf('data:image/') !== 0 || d.length > 400000) throw coded_('bad_image', 'Hình không hợp lệ hoặc quá lớn.');
    writeJson_(dataDir_(), 'img_' + id_(r.id) + '.json', { d: d });
    return true;
  },
  driveList: () => driveList_(),
  driveRead: (r) => driveRead_(id_(r.id)),
  driveUpload: (r) => driveUpload_(str_(r.name, 150), String(r.base64 || '')),
};

function route_(r) {
  const a = r.action;
  if (Object.prototype.hasOwnProperty.call(ADMIN_, a)) {
    if (!isAdmin_(r.key)) throw coded_('forbidden', 'Cần đăng nhập admin.');
    return ADMIN_[a](r);
  }
  if (Object.prototype.hasOwnProperty.call(PUBLIC_, a)) return PUBLIC_[a](r);
  throw coded_('bad_action', 'Hành động không hợp lệ.');
}

function isAdmin_(key) {
  const k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!k || typeof key !== 'string' || key.length !== k.length) return false;
  let diff = 0;
  for (let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/* ---------- Kiểm tra dữ liệu vào ---------- */
function id_(v) {
  const s = String(v == null ? '' : v);
  if (!/^[A-Za-z0-9_\-]{1,64}$/.test(s)) throw coded_('bad_id', 'Mã không hợp lệ.');
  return s;
}
function str_(v, n) {
  return String(v == null ? '' : v).slice(0, n);
}
function int_(v, max) {
  const n = Math.floor(Number(v));
  return isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
}

function cleanQ_(q) {
  const o = (q.o || []).slice(0, 8).map((x) => str_(x, 1500));
  if (o.length < 2) throw coded_('bad_question', 'Mỗi câu cần ít nhất 2 đáp án.');
  const a = int_(q.a, 100);
  if (a >= o.length) throw coded_('bad_question', 'Đáp án đúng nằm ngoài danh sách đáp án.');
  const out = { id: id_(q.id), q: str_(q.q, 4000), o: o, a: a, e: str_(q.e, 3000), s: q.s ? 1 : 0 };
  if (q.i && q.i.length) { out.i = q.i.slice(0, 6).map(id_); out.s = 1; }
  if (q.p) out.p = id_(q.p);
  return out;
}

/* Bài đọc của một bài/chương: { id, t: nội dung, i: [mã hình] } */
function cleanP_(p) {
  const out = { id: id_(p.id), t: str_(p.t, 12000) };
  if (p.i && p.i.length) out.i = p.i.slice(0, 6).map(id_);
  return out;
}
function cleanPath_(path) {
  return Array.isArray(path) && path.length > 1 ? path.slice(0, 6).map((x) => str_(x, 120)) : null;
}
function cleanChapter_(c) {
  const out = { id: id_(c.id), name: str_(c.name, 300), qs: (c.qs || []).map(cleanQ_) };
  const path = cleanPath_(c.path);
  if (path) out.path = path;
  if (c.ps && c.ps.length) out.ps = c.ps.slice(0, 200).map(cleanP_);
  return out;
}

function cleanRun_(r) {
  r = r || {};
  const ch = {};
  Object.keys(r.ch || {}).slice(0, 100).forEach((cid) => {
    ch[id_(cid)] = [int_(r.ch[cid][0], 100000), int_(r.ch[cid][1], 100000)];
  });
  const ids = (arr) => (Array.isArray(arr) ? arr.slice(0, 2000).map((x) => str_(x, 64)) : []);
  return {
    sid: id_(r.sid), t: int_(r.t, 9e15), m: r.m === 'exam' ? 'exam' : 'chapter',
    secs: int_(r.secs, 1e7), tot: int_(r.tot, 100000), n: int_(r.n, 100000), c: int_(r.c, 100000),
    ch: ch, w: ids(r.w), r: ids(r.r),
  };
}

/* ---------- Drive: thư mục và file JSON ---------- */
function findRoot_(create) {
  const props = PropertiesService.getScriptProperties();
  const rid = props.getProperty('ROOT_ID');
  if (rid) {
    try { return DriveApp.getFolderById(rid); } catch (e) { /* thư mục đã bị xóa, tìm lại theo tên */ }
  }
  const it = DriveApp.getFoldersByName(ROOT_NAME);
  if (it.hasNext()) return it.next();
  return create ? DriveApp.createFolder(ROOT_NAME) : null;
}
function root_() {
  if (!rootCache_) rootCache_ = findRoot_(true);
  return rootCache_;
}
function dataDir_() {
  if (!dataCache_) {
    const r = root_();
    const it = r.getFoldersByName(DATA_NAME);
    dataCache_ = it.hasNext() ? it.next() : r.createFolder(DATA_NAME);
  }
  return dataCache_;
}
function readJson_(dir, name, def) {
  const it = dir.getFilesByName(name);
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return def; }
  }
  return def;
}
function writeJson_(dir, name, obj) {
  const s = JSON.stringify(obj);
  const it = dir.getFilesByName(name);
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed && f.isTrashed()) continue;
    f.setContent(s);
    return;
  }
  dir.createFile(name, s, 'application/json');
}
function trash_(dir, name) {
  const it = dir.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Đề ---------- */
function saveSubject_(m, chapters) {
  const sid = id_(m.id);
  const chs = chapters
    .map(cleanChapter_)
    .filter((c) => c.qs.length);
  if (!chs.length) throw coded_('empty', 'Môn này chưa có câu hỏi nào.');
  const meta = {
    id: sid,
    name: str_(m.name, 120),
    createdAt: int_(m.createdAt, 9e15) || Date.now(),
    updatedAt: Date.now(),
    by: str_(m.by, 60),
    driveId: str_(m.driveId, 80),
    total: chs.reduce((a, c) => a + c.qs.length, 0),
    chapters: chs.map((c) => (c.path ? { id: c.id, name: c.name, n: c.qs.length, path: c.path } : { id: c.id, name: c.name, n: c.qs.length })),
  };
  if (!meta.name) throw coded_('bad_name', 'Môn cần có tên.');
  withLock_(() => {
    const dir = dataDir_();
    writeJson_(dir, 's_' + sid + '.json', { meta: meta, chapters: chs });
    const list = readJson_(dir, 'index.json', []).filter((x) => x.id !== sid);
    list.push(meta);
    writeJson_(dir, 'index.json', list);
  });
  return meta;
}

function deleteSubject_(sid) {
  withLock_(() => {
    const dir = dataDir_();
    trash_(dir, 's_' + sid + '.json');
    trash_(dir, 'st_' + sid + '.json');
    writeJson_(dir, 'index.json', readJson_(dir, 'index.json', []).filter((x) => x.id !== sid));
  });
  return true;
}

/* ---------- Kết quả và thống kê ---------- */
function saveRun_(uid, name, run) {
  withLock_(() => {
    const dir = dataDir_();
    const fn = 'u_' + uid + '.json';
    const u = readJson_(dir, fn, { name: '', runs: [] });
    if (u.runs.some((x) => x.t === run.t && x.sid === run.sid)) return;
    u.name = name;
    u.runs.push(run);
    while (u.runs.length > MAX_RUNS) u.runs.shift();
    writeJson_(dir, fn, u);

    const sf = 'st_' + run.sid + '.json';
    const st = readJson_(dir, sf, { runs: 0, users: {}, ch: {}, q: {} });
    st.runs++;
    st.users[uid] = 1;
    Object.keys(run.ch).forEach((cid) => {
      const o = st.ch[cid] || (st.ch[cid] = { c: 0, t: 0 });
      o.c += run.ch[cid][0];
      o.t += run.ch[cid][1];
    });
    run.w.forEach((qid) => { const o = st.q[qid] || (st.q[qid] = { w: 0, t: 0 }); o.w++; o.t++; });
    run.r.forEach((qid) => { const o = st.q[qid] || (st.q[qid] = { w: 0, t: 0 }); o.t++; });
    writeJson_(dir, sf, st);
  });
  return true;
}

/* ---------- Ai đang làm bài (bộ nhớ đệm, tự hết hạn sau 6 giờ) ---------- */
/* Phần đang làm dở của mỗi người, để mở lại trên thiết bị khác. Lần đầu gửi đủ danh sách câu (items), các lần sau chỉ gửi đáp án đã chọn. */
function saveProgress_(uid, p) {
  return withLock_(() => {
    const dir = dataDir_(), fn = 'pg_' + uid + '.json';
    const cur = readJson_(dir, fn, null);
    let rec;
    if (p.items !== undefined) {
      rec = { rid: str_(p.rid, 40), sid: str_(p.sid, 64), sname: str_(p.sname, 120), mode: p.mode === 'exam' ? 'exam' : 'chapter', items: str_(p.items, 60000) };
    } else {
      if (!cur || cur.rid !== str_(p.rid, 40)) throw coded_('no_progress', 'Chưa có phần đang làm dở để cập nhật.');
      rec = { rid: cur.rid, sid: cur.sid, sname: cur.sname, mode: cur.mode, items: cur.items };
    }
    rec.sel = str_(p.sel, 6000); rec.idx = int_(p.idx, 100000); rec.el = int_(p.el, 1000000000); rec.t = Date.now();
    writeJson_(dir, fn, rec);
    return true;
  });
}
function readLive_() {
  try { return JSON.parse(CacheService.getScriptCache().get('live') || '{}'); } catch (e) { return {}; }
}
function heartbeat_(uid, d) {
  withLock_(() => {
    const map = readLive_();
    const now = Date.now();
    Object.keys(map).forEach((k) => { if (now - map[k].t > 6 * 3600 * 1000) delete map[k]; });
    const keys = Object.keys(map);
    if (keys.length > 300) {
      keys.sort((a, b) => map[a].t - map[b].t).slice(0, keys.length - 300).forEach((k) => delete map[k]);
    }
    map[uid] = {
      name: str_(d.name, 60), ip: str_(d.ip, 64), sid: str_(d.sid, 64), sname: str_(d.sname, 120),
      mode: d.mode === 'exam' ? 'exam' : 'chapter', cname: str_(d.cname, 200),
      idx: int_(d.idx, 100000), n: int_(d.n, 100000), c: int_(d.c, 100000),
      st: ['doing', 'done', 'idle'].indexOf(d.st) >= 0 ? d.st : 'doing', t: now,
    };
    CacheService.getScriptCache().put('live', JSON.stringify(map), 21600);
  });
  return true;
}

/* ---------- Báo lỗi câu hỏi ---------- */
function saveReport_(uid, r) {
  const rep = {
    id: str_(r.id, 80), uid: uid, name: str_(r.name, 60), sid: str_(r.sid, 64), sname: str_(r.sname, 120),
    cid: str_(r.cid, 64), cname: str_(r.cname, 200), qid: str_(r.qid, 64), qtext: str_(r.qtext, 300),
    reason: str_(r.reason, 80), note: str_(r.note, 300), t: Date.now(), done: false,
  };
  if (!rep.id || !rep.qid) throw coded_('bad_report', 'Báo lỗi thiếu thông tin.');
  withLock_(() => {
    const dir = dataDir_();
    const list = readJson_(dir, 'reports.json', []).filter((x) => x.id !== rep.id);
    list.push(rep);
    while (list.length > 800) list.shift();
    writeJson_(dir, 'reports.json', list);
  });
  return true;
}
function resolveReport_(id) {
  withLock_(() => {
    const dir = dataDir_();
    const list = readJson_(dir, 'reports.json', []);
    list.forEach((x) => { if (x.id === id) x.done = true; });
    writeJson_(dir, 'reports.json', list);
  });
  return true;
}

/* ---------- Đọc file đề từ thư mục Drive (chỉ admin) ---------- */
function driveList_() {
  const it = root_().getFiles();
  const files = [];
  while (it.hasNext() && files.length < 300) {
    const f = it.next();
    if (f.getMimeType() !== DOCX || (f.isTrashed && f.isTrashed())) continue;
    files.push({ id: f.getId(), title: f.getName(), mimeType: DOCX, modifiedTime: f.getLastUpdated().toISOString() });
  }
  files.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  return { files: files, inFolder: true };
}
function driveRead_(fileId) {
  const f = DriveApp.getFileById(fileId);
  const rootId = root_().getId();
  let inRoot = false;
  const ps = f.getParents();
  while (ps.hasNext()) if (ps.next().getId() === rootId) inRoot = true;
  if (!inRoot) throw coded_('forbidden', 'File này không nằm trong thư mục đề.');
  if (f.getSize() > MAX_FILE_BYTES) throw coded_('too_big', 'File lớn hơn 8 MB.');
  return { name: f.getName(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}
function driveUpload_(name, b64) {
  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > MAX_FILE_BYTES) throw coded_('too_big', 'File lớn hơn 8 MB.');
  const f = root_().createFile(Utilities.newBlob(bytes, DOCX, name || 'de.docx'));
  return { id: f.getId() };
}

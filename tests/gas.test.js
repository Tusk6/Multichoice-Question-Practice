/* Chạy: node tests/gas.test.js
   Giả lập các dịch vụ của Apps Script (Drive, Cache, Lock, Properties) để kiểm tra Code.gs mà không cần triển khai. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let counter = 0;
const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
const allFolders = [];
const rootFolders = [];

function mkFile(name, content, mime, parent) {
  const f = { _id: 'f' + (++counter), _name: name, _c: content, _mime: mime, _trashed: false, _parent: parent, _t: new Date() };
  return Object.assign(f, {
    getId: () => f._id, getName: () => f._name, getMimeType: () => f._mime,
    isTrashed: () => f._trashed, setTrashed: (b) => { f._trashed = b; },
    setContent: (s) => { f._c = s; }, getLastUpdated: () => f._t, getSize: () => Buffer.byteLength(f._c),
    getBlob: () => ({ getDataAsString: () => f._c, getBytes: () => Array.from(Buffer.from(f._c, 'latin1')) }),
    getParents: () => iter([f._parent]),
  });
}
function mkFolder(name, isRoot) {
  const d = { _id: 'd' + (++counter), _name: name, files: [], folders: [] };
  allFolders.push(d);
  if (isRoot) rootFolders.push(d);
  return Object.assign(d, {
    getId: () => d._id, getName: () => d._name, getUrl: () => 'https://drive.test/' + d._id,
    getFilesByName: (n) => iter(d.files.filter((f) => f._name === n)),
    getFiles: () => iter(d.files.slice()),
    createFile: (a, b, c) => {
      const f = typeof a === 'object' ? mkFile(a._name, Buffer.from(a._bytes).toString('latin1'), a._mime, d) : mkFile(a, b, c, d);
      d.files.push(f);
      return f;
    },
    getFoldersByName: (n) => iter(d.folders.filter((x) => x._name === n)),
    createFolder: (n) => { const x = mkFolder(n, false); d.folders.push(x); return x; },
  });
}

const props = {}, cacheStore = {};
const ctx = {
  console, JSON, Math, Date, Object, String, Number, Array, Error, isFinite,
  Logger: { log: () => {} },
  DriveApp: {
    getFolderById: (id) => { const f = allFolders.find((x) => x._id === id); if (!f) throw new Error('not found'); return f; },
    getFoldersByName: (n) => iter(rootFolders.filter((x) => x._name === n)),
    createFolder: (n) => mkFolder(n, true),
    getFileById: (id) => { for (const d of allFolders) { const f = d.files.find((x) => x._id === id); if (f) return f; } throw new Error('not found'); },
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = v; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    newBlob: (bytes, mime, name) => ({ _bytes: bytes, _mime: mime, _name: name }),
  },
  ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: (s) => ({ _s: s, setMimeType() { return this; } }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);

/* Drive có sẵn thư mục đề với một file .docx */
const root = mkFolder('Multiple-Choice Question Bank', true);
root.files.push(mkFile('TTHCM.docx', 'PK-docx-gia', DOCX, root));

const post = (obj) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj) } })._s);
const ok = (obj) => { const r = post(obj); assert.ok(r.ok, JSON.stringify(obj.action) + ' lỗi: ' + r.error); return r.data; };
const bad = (obj, code) => { const r = post(obj); assert.strictEqual(r.ok, false, obj.action + ' đáng ra phải lỗi'); assert.strictEqual(r.code, code, obj.action + ': ' + r.error); };

const key = ctx.setup();
assert.ok(key && key.length >= 8, 'setup tạo mật khẩu admin');
assert.ok(root.folders.some((f) => f._name === '_data'), 'setup tạo thư mục _data');

assert.strictEqual(ok({ action: 'ping' }).admin, false);
assert.strictEqual(ok({ action: 'ping', key: 'sai' }).admin, false);
assert.strictEqual(ok({ action: 'ping', key }).admin, true);
assert.deepStrictEqual(ok({ action: 'subjects' }), []);

const chapters = [{ id: 'c1', name: 'Bài 1: Một', qs: [
  { id: 'q1', q: 'Hai cộng hai?', o: ['3', '4'], a: 1, e: 'Vì bốn.', s: 0 },
  { id: 'q2', q: 'Ba cộng ba?', o: ['6', '7', '8'], a: 0, e: '', s: 1 },
] }];
const meta = { id: 's1', name: 'Môn thử', by: 'Admin' };
bad({ action: 'saveSubject', meta, chapters }, 'forbidden');
bad({ action: 'saveSubject', key: 'sai', meta, chapters }, 'forbidden');
bad({ action: 'saveSubject', key, meta, chapters: [{ id: 'c1', name: 'x', qs: [{ id: 'q9', q: 'x', o: ['a', 'b'], a: 5 }] }] }, 'bad_question');
bad({ action: 'saveSubject', key, meta: { id: '../x', name: 'x' }, chapters }, 'bad_id');
const saved = ok({ action: 'saveSubject', key, meta, chapters });
assert.strictEqual(saved.total, 2);

const list = ok({ action: 'subjects' });
assert.strictEqual(list.length, 1);
assert.strictEqual(list[0].chapters[0].n, 2);
const full = ok({ action: 'subject', sid: 's1' });
assert.strictEqual(full.chapters[0].qs[1].s, 1);
bad({ action: 'subject', sid: 'khong-co' }, 'not_found');

/* Lưu lại cùng môn không tạo bản trùng */
ok({ action: 'saveSubject', key, meta, chapters });
assert.strictEqual(ok({ action: 'subjects' }).length, 1);

/* Kết quả và thống kê */
const run1 = { sid: 's1', t: 111, m: 'chapter', secs: 30, tot: 2, n: 2, c: 1, ch: { c1: [1, 2] }, w: ['q2'], r: ['q1'] };
ok({ action: 'saveRun', uid: 'u1', name: 'Tú', run: run1 });
ok({ action: 'saveRun', uid: 'u1', name: 'Tú', run: run1 });
ok({ action: 'saveRun', uid: 'u2', name: 'An', run: Object.assign({}, run1, { t: 222, c: 0, ch: { c1: [0, 2] }, w: ['q1', 'q2'], r: [] }) });
assert.strictEqual(ok({ action: 'me', uid: 'u1' }).runs.length, 1, 'lượt trùng không được lưu hai lần');
bad({ action: 'stats', sid: 's1' }, 'forbidden');
const st = ok({ action: 'stats', key, sid: 's1' });
assert.strictEqual(st.runs, 2);
assert.strictEqual(st.people, 2);
assert.deepStrictEqual(st.ch.c1, { c: 1, t: 4 });
assert.deepStrictEqual(st.q.q2, { w: 2, t: 2 });
assert.deepStrictEqual(st.q.q1, { w: 1, t: 2 });
bad({ action: 'saveRun', uid: '../u', name: 'x', run: run1 }, 'bad_id');

/* Theo dõi trực tiếp */
ok({ action: 'heartbeat', uid: 'u1', data: { name: 'Tú', ip: '1.2.3.4', sid: 's1', sname: 'Môn thử', mode: 'chapter', cname: 'Bài 1', idx: 1, n: 2, c: 1, st: 'doing' } });
bad({ action: 'live' }, 'forbidden');
const live = ok({ action: 'live', key });
assert.strictEqual(live.length, 1);
assert.strictEqual(live[0].ip, '1.2.3.4');
assert.strictEqual(live[0].idx, 1);

/* Báo lỗi */
const rep = { id: 'r1', name: 'Tú', sid: 's1', sname: 'Môn thử', cid: 'c1', cname: 'Bài 1', qid: 'q1', qtext: 'Hai cộng hai?', reason: 'Đáp án đúng bị sai', note: 'phải là 5' };
ok({ action: 'report', uid: 'u1', report: rep });
ok({ action: 'report', uid: 'u1', report: rep });
bad({ action: 'report', uid: 'u1', report: { id: '', qid: '' } }, 'bad_report');
let reps = ok({ action: 'reports', key });
assert.strictEqual(reps.length, 1, 'báo lỗi trùng id được gộp');
assert.strictEqual(reps[0].done, false);
ok({ action: 'resolveReport', key, id: 'r1' });
assert.strictEqual(ok({ action: 'reports', key })[0].done, true);

/* Phần đang làm dở */
assert.strictEqual(ok({ action: 'getProgress', uid: 'u1' }), null);
bad({ action: 'saveProgress', uid: 'u1', p: { rid: 'r1', sel: '1x', idx: 1, el: 5000 } }, 'no_progress');
ok({ action: 'saveProgress', uid: 'u1', p: { rid: 'r1', sid: 's1', sname: 'Môn thử', mode: 'chapter', items: 'c1|q1|10;c1|q2|012', sel: '1x', idx: 0, el: 1000 } });
ok({ action: 'saveProgress', uid: 'u1', p: { rid: 'r1', sel: '10', idx: 1, el: 9000 } });
const pg = ok({ action: 'getProgress', uid: 'u1' });
assert.strictEqual(pg.items, 'c1|q1|10;c1|q2|012');
assert.strictEqual(pg.sel, '10'); assert.strictEqual(pg.idx, 1); assert.strictEqual(pg.sid, 's1');
bad({ action: 'saveProgress', uid: 'u1', p: { rid: 'khac', sel: '1', idx: 0, el: 1 } }, 'no_progress');
assert.strictEqual(ok({ action: 'getProgress', uid: 'u2' }), null, 'mỗi người một phần dở');
ok({ action: 'clearProgress', uid: 'u1' });
assert.strictEqual(ok({ action: 'getProgress', uid: 'u1' }), null);

/* Hình minh họa */
const IMGD = 'data:image/jpeg;base64,/9j/AAAA';
bad({ action: 'saveImage', id: 'i1', d: IMGD }, 'forbidden');
bad({ action: 'saveImage', key, id: 'i1', d: 'khong-phai-hinh' }, 'bad_image');
ok({ action: 'saveImage', key, id: 'i1', d: IMGD });
assert.strictEqual(ok({ action: 'image', id: 'i1' }).d, IMGD);
bad({ action: 'image', id: 'i404' }, 'not_found');
assert.deepStrictEqual(ok({ action: 'imagesHave', key, ids: ['i1', 'i404'] }), ['i1']);
const withImg = ok({ action: 'saveSubject', key, meta: { id: 's2', name: 'Có hình' }, chapters: [{ id: 'c1', name: 'B', qs: [{ id: 'q1', q: 'Hình?', o: ['a', 'b'], a: 0, i: ['i1'] }] }] });
assert.strictEqual(ok({ action: 'subject', sid: 's2' }).chapters[0].qs[0].i[0], 'i1');
assert.strictEqual(ok({ action: 'subject', sid: 's2' }).chapters[0].qs[0].s, 1, 'câu có hình luôn không xáo');
bad({ action: 'saveSubject', key, meta: { id: 's3', name: 'x' }, chapters: [{ id: 'c1', name: 'B', qs: [{ id: 'q1', q: 'x', o: ['a', 'b'], a: 0, i: ['../x'] }] }] }, 'bad_id');
ok({ action: 'deleteSubject', key, sid: 's2' });

/* Drive */
bad({ action: 'driveList' }, 'forbidden');
let files = ok({ action: 'driveList', key }).files;
assert.strictEqual(files.length, 1);
assert.strictEqual(files[0].title, 'TTHCM.docx');
const read = ok({ action: 'driveRead', key, id: files[0].id });
assert.strictEqual(Buffer.from(read.base64, 'base64').toString('latin1'), 'PK-docx-gia');
const dataDir = root.folders.find((f) => f._name === '_data');
bad({ action: 'driveRead', key, id: dataDir.files[0]._id }, 'forbidden');
ok({ action: 'driveUpload', key, name: 'Moi.docx', base64: Buffer.from('noi dung').toString('base64') });
assert.strictEqual(ok({ action: 'driveList', key }).files.length, 2);

/* Xóa môn */
bad({ action: 'deleteSubject', sid: 's1' }, 'forbidden');
ok({ action: 'deleteSubject', key, sid: 's1' });
assert.deepStrictEqual(ok({ action: 'subjects' }), []);
bad({ action: 'subject', sid: 's1' }, 'not_found');

bad({ action: 'khong-ton-tai' }, 'bad_action');
assert.strictEqual(JSON.parse(ctx.doGet()._s).ok, true);
/* Đường dự phòng JSONP cho điện thoại */
const jp = ctx.doGet({ parameter: { q: JSON.stringify({ action: 'subjects' }), callback: 'cb1' } })._s;
assert.ok(/^cb1\(\{"ok":true,"data":\[/.test(jp), 'jsonp trả về hàm gọi lại');
assert.ok(JSON.parse(ctx.doGet({ parameter: { q: '{x', callback: 'a(b' } })._s).ok === false, 'callback lạ hoặc json hỏng bị từ chối');
/* Bài đọc và chỉ mục nhiều cấp */
ok({ action: 'saveSubject', key, meta: { id: 's3', name: 'Anh' }, chapters: [{ id: 'c1', name: 'UNIT 1 › Reading', path: ['UNIT 1', 'Reading'], ps: [{ id: 'p1', t: 'Tom likes apples.', i: ['i9'] }],
  qs: [{ id: 'q1', q: 'Ai?', o: ['a', 'b'], a: 0, p: 'p1' }] }] });
const en3 = ok({ action: 'subject', sid: 's3' });
assert.deepStrictEqual(en3.chapters[0].path, ['UNIT 1', 'Reading']);
assert.strictEqual(en3.chapters[0].ps[0].t, 'Tom likes apples.');
assert.strictEqual(en3.chapters[0].ps[0].i[0], 'i9');
assert.strictEqual(en3.chapters[0].qs[0].p, 'p1');
assert.deepStrictEqual(ok({ action: 'subjects' }).find((x) => x.id === 's3').chapters[0].path, ['UNIT 1', 'Reading']);
console.log('gas.test.js: tất cả đều đạt');

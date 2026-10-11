/* Multichoice - Question Practice: giao diện. Mọi thao tác dữ liệu đều đi qua window.TDA_API (xem api-gas.js). */
(() => {
'use strict';
const API = window.TDA_API;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));
const pct = (c, t) => (t ? Math.round((c / t) * 100) : 0);
const fmtScore = (c, t) => (t ? (c / t) * 10 : 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const ago = (t) => {
  const d = Math.round((new Date(new Date().toDateString()) - new Date(new Date(t).toDateString())) / 864e5);
  return d <= 0 ? 'hôm nay' : d === 1 ? 'hôm qua' : d + ' ngày trước';
};
const agoShort = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 45 ? 'vừa xong' : s < 3600 ? Math.round(s / 60) + ' phút trước' : s < 86400 ? Math.round(s / 3600) + ' giờ trước' : Math.round(s / 86400) + ' ngày trước';
};
const maDe = (id) => 100 + (parseInt(String(id).slice(-4), 36) % 900);
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } },
};
const errMsg = (e, d) => (e && e.userMessage) || d;
const REASONS = ['Đáp án đúng bị sai', 'Sai nội dung hoặc chính tả', 'Thiếu hoặc thừa đáp án', 'Lỗi khác'];
const newId = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const D = { admin: false, canWrite: true };
const S = {
  view: 'boot', name: LS.get('tda.name', ''), subjects: [], subsReady: false, mine: { runs: [] }, chap: {},
  sub: null, cfg: null, run: null, res: null, scope: 'me', stats: {}, live: [], imp: null, ed: null,
  reports: [], nReports: 0, rpt: null, confirmDel: null, confirmEnd: false, panelOpen: false, loading: '',
  fatal: null, adminErr: '',
};
const app = $('#app');
let timer = null, toastTimer = null, liveTick = null;
const desk = () => matchMedia('(min-width: 900px)').matches;

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}
const logo = () => '<svg class="logo" viewBox="0 0 96 26" width="96" height="26" aria-hidden="true">' +
  [0, 1, 2, 3].map((i) => {
    const on = i === 2;
    return '<circle cx="' + (13 + i * 24.5) + '" cy="13" r="11" style="fill:' + (on ? 'var(--graphite)' : 'none') + ';stroke:' + (on ? 'var(--graphite)' : 'var(--pen)') + '" stroke-width="1.8"/>' +
      '<text x="' + (13 + i * 24.5) + '" y="13" dy=".35em" text-anchor="middle" font-size="11" font-weight="700" style="fill:' + (on ? 'var(--paper)' : 'var(--pen)') + ';font-family:var(--f-ui)">' + 'ABCD'[i] + '</text>';
  }).join('') + '</svg>';

/* ---------- Dữ liệu ---------- */
async function refreshSubjects() {
  try {
    const list = await API.listSubjects();
    S.subjects = list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } catch (e) { /* giữ danh sách cũ */ }
  S.subsReady = true;
  if (S.view === 'home') render(false);
}
async function loadChapters(sub) {
  if (S.chap[sub.id]) return;
  const full = await API.getSubject(sub.id);
  const map = {};
  full.chapters.forEach((c) => { map[c.id] = c; });
  S.chap[sub.id] = map;
}
function groupReports() {
  const g = {}, order = [];
  (S.reports || []).filter((x) => !x.done).forEach((x) => {
    const k = x.sid + '|' + x.qid;
    if (!g[k]) { g[k] = { sid: x.sid, sname: x.sname, cid: x.cid, cname: x.cname, qid: x.qid, qtext: x.qtext, items: [] }; order.push(k); }
    g[k].items.push(x);
  });
  return order.map((k) => g[k]).sort((a, b) => b.items.length - a.items.length);
}
async function loadReports() {
  try { S.reports = await API.getReports(); } catch (e) { return; }
  S.nReports = groupReports().length;
  if (S.view === 'home') render(false);
}

/* ---------- Thống kê ---------- */
function qIndex(sub) {
  const idx = {}, m = S.chap[sub.id] || {};
  sub.chapters.forEach((c) => {
    const d = m[c.id];
    if (d) d.qs.forEach((x, i) => { idx[x.id] = { q: x.q, cn: c.name, n: i + 1 }; });
  });
  return idx;
}
function statsFor(sub) {
  return S.scope === 'all' ? (S.stats[sub.id] || null) : analyzeRuns(sub.id, [S.mine]);
}
function anlHTML(sub) {
  const a = statsFor(sub);
  if (!a) return '<p class="muted">Đang tải dữ liệu của mọi người…</p>';
  if (!a.runs) return '<p class="muted">Chưa có lượt làm bài nào để thống kê. Làm vài câu rồi quay lại đây.</p>';
  const chs = sub.chapters.filter((c) => a.ch[c.id] && a.ch[c.id].t).map((c) => ({ c, o: a.ch[c.id], wr: 1 - a.ch[c.id].c / a.ch[c.id].t })).sort((x, y) => y.wr - x.wr);
  const idx = qIndex(sub);
  const qs = Object.keys(a.q).filter((id) => a.q[id].w && idx[id]).map((id) => ({ id, o: a.q[id], i: idx[id] })).sort((x, y) => y.o.w - x.o.w || y.o.w / y.o.t - x.o.w / x.o.t).slice(0, 8);
  let h = '<p class="muted small">' + a.runs + ' lượt làm' + (S.scope === 'all' ? ' của ' + a.people + ' người' : '') + '</p>';
  h += '<h4 class="sh">Bài/chương sai nhiều nhất</h4><ul class="bars">' + chs.map((x) =>
    '<li><div class="bl"><span class="bn">' + esc(x.c.name) + '</span><span class="bv">' + Math.round(x.wr * 100) + '% sai <small>(' + (x.o.t - x.o.c) + '/' + x.o.t + ' lượt)</small></span></div>' +
    '<div class="bt"><i style="width:' + Math.max(2, x.wr * 100) + '%"></i></div></li>').join('') + '</ul>';
  h += '<h4 class="sh">Câu sai nhiều nhất</h4>' + (qs.length ? '<ol class="wq">' + qs.map((x) =>
    '<li><div class="wq-t">' + esc(clip(x.i.q, 150)) + '</div><div class="wq-m">' + esc(shortName(x.i.cn)) + ' · câu ' + x.i.n + ' · <b class="bad-t">sai ' + x.o.w + '/' + x.o.t + ' lượt</b></div></li>').join('') + '</ol>' : '<p class="muted">Chưa có câu nào bị sai.</p>');
  return h;
}

/* ---------- Màn hình ---------- */
function viewNoDb() {
  const code = S.fatal && S.fatal.code;
  let body;
  if (code === 'no_url') body = 'Trang chưa biết máy chủ lưu dữ liệu ở đâu. Hãy mở file <b>js/config.js</b>, dán địa chỉ Web app của Apps Script vào <b>GAS_URL</b>, rồi tải lại trang. Các bước chi tiết có trong README.';
  else if (code === 'nodb') body = 'Trang cần mở trong claude.ai khi đã đăng nhập thì mới lấy được đề và lưu kết quả. Hãy đăng nhập rồi tải lại trang. Nếu bạn nhận link từ admin, nhờ admin cấp quyền Contributor cho bạn trong nút Share.';
  else body = esc((S.fatal && S.fatal.message) || 'Không kết nối được máy chủ.') + ' Hãy kiểm tra mạng rồi thử lại.';
  return '<section class="empty"><div class="brand">' + logo() + '<h1>Multichoice - Question Practice</h1></div><h2>Chưa kết nối được dữ liệu</h2><p>' + body + '</p><div class="row"><button class="btn" data-act="reload">Tải lại</button></div></section>';
}
function viewName() {
  return '<section class="namebox">' + logo() + '<h1>Multichoice - Question Practice</h1>' +
    '<p class="sub">Luyện đề trắc nghiệm theo từng bài, từng chương.</p>' +
    '<div class="field"><label for="nm">Tên của bạn</label><input id="nm" class="inp" type="text" maxlength="40" autocomplete="name" value="' + esc(S.name) + '" placeholder="Ví dụ: Tú"></div>' +
    '<p class="hint">Tên dùng để lưu kết quả. Nhập cùng một tên trên máy tính và điện thoại thì kết quả và phần đang làm dở sẽ đồng bộ với nhau. Hai người trùng tên sẽ dùng chung dữ liệu, nên hãy ghi tên đủ phân biệt. ' + esc(API.privacyNote) + ' Máy này sẽ nhớ tên cho lần sau.</p>' +
    '<button class="btn pri big" data-act="savename">Vào làm bài</button></section>';
}
function viewAdminLogin() {
  return '<div class="crumb"><button class="btn ghost" data-act="home">← Danh sách môn</button></div><section class="namebox"><h2 class="h2">Đăng nhập admin</h2>' +
    '<div class="field"><label for="ak">Mật khẩu admin</label><input id="ak" class="inp" type="password" autocomplete="current-password" placeholder="Mật khẩu trong Script Properties (ADMIN_KEY)"></div>' +
    (S.adminErr ? '<p class="err">' + esc(S.adminErr) + '</p>' : '') +
    '<button class="btn pri big" data-act="adminlogin">Đăng nhập</button></section>';
}
function viewHome() {
  let h = '<header class="top"><div class="brand">' + logo() + '<div><h1>Multichoice - Question Practice</h1><p class="sub">Xin chào, <b>' + esc(S.name) + '</b> · <button class="lnk" data-act="rename">Đổi tên</button></p></div></div>' +
    (D.admin ? '<div class="row"><button class="btn" data-act="live">Ai đang làm bài</button><button class="btn" data-act="reports">Báo lỗi' + (S.nReports ? '<span class="badge">' + S.nReports + '</span>' : '') + '</button><button class="btn pri" data-act="import">+ Nhập đề</button></div>' : '') + '</header>';
  if (!D.canWrite) h += '<p class="notice">Bạn đang ở quyền chỉ xem nên kết quả làm bài sẽ không được lưu. Nhờ admin cấp quyền Contributor để lưu.</p>';
  if (!S.subsReady) return h + '<p class="muted">Đang tải danh sách môn…</p>';
  if (S.prog && S.subjects.some((x) => x.id === S.prog.sid)) h += resumeHTML(S.prog, false);
  if (!S.subjects.length) {
    h += '<section class="empty"><h2>Chưa có môn nào</h2>' + (D.admin
      ? '<p>Nhập file đề .docx từ thư mục Google Drive hoặc từ máy. Tên file sẽ thành tên môn, mỗi "Bài" hoặc "Chương" trong file thành một mục để ôn.</p><div class="row"><button class="btn pri" data-act="import">+ Nhập đề</button></div>'
      : '<p>Admin chưa nhập đề nào. Quay lại sau khi admin nhập đề nhé.</p>') + '</section>';
  } else {
    h += '<section class="banks" aria-label="Danh sách môn">' + S.subjects.map((s) => {
      const runs = (S.mine.runs || []).filter((r) => r.sid === s.id), last = runs[runs.length - 1];
      return '<article class="card bank"><div class="bank-h"><h2>' + esc(s.name) + '</h2><span class="made">Mã đề ' + maDe(s.id) + '</span></div>' +
        '<p class="meta">' + s.chapters.length + ' bài/chương · ' + s.total + ' câu</p>' +
        '<p class="meta">' + (last ? 'Bạn đã làm ' + runs.length + ' lượt · gần nhất <b>' + fmtScore(last.c, last.tot) + '/10</b> ' + ago(last.t) : 'Bạn chưa làm lượt nào') + '</p>' +
        (S.confirmDel === s.id
          ? '<div class="confirm"><span>Xóa môn này khỏi thư viện?</span><button class="btn danger" data-act="delyes" data-id="' + s.id + '">Xóa</button><button class="btn" data-act="delno">Giữ lại</button></div>'
          : '<div class="row"><button class="btn pri" data-act="opensub" data-id="' + s.id + '">Vào học</button>' + (D.admin ? '<button class="btn" data-act="editsub" data-id="' + s.id + '">Sửa đề</button><button class="btn ghost" data-act="del" data-id="' + s.id + '">Xóa</button>' : '') + '</div>') + '</article>';
    }).join('') + '</section>';
  }
  let admin = '';
  if (API.canLogin) admin = ' · ' + (D.admin ? '<button class="lnk" data-act="adminout">Thoát admin</button>' : '<button class="lnk" data-act="adminin">Đăng nhập admin</button>');
  return h + '<footer class="foot">' + esc(API.storageNote) + admin + '</footer>';
}

function cfgCount() {
  const c = S.cfg, sub = S.sub;
  if (c.mode === 'chapter') return sub.chapters.filter((m) => c.sel[m.id]).reduce((a, m) => a + m.n, 0);
  return c.n === 'all' || c.n > sub.total ? sub.total : c.n;
}
function viewSub() {
  const sub = S.sub, c = S.cfg;
  let h = '<div class="crumb"><button class="btn ghost" data-act="home">← Danh sách môn</button></div>' +
    '<div class="setup-h"><span class="made">Mã đề ' + maDe(sub.id) + '</span><h2 class="h2">' + esc(sub.name) + '</h2><p class="muted">' + sub.chapters.length + ' bài/chương · ' + sub.total + ' câu</p>' +
    (D.admin ? '<button class="btn" data-act="editsub" data-id="' + sub.id + '">Sửa đề, sửa lỗi</button>' : '') + '</div>';
  if (S.loading) return h + '<p class="muted">' + esc(S.loading) + '</p>';
  if (S.prog && S.prog.sid === sub.id) h += resumeHTML(S.prog, true);
  const mine = analyzeRuns(sub.id, [S.mine]).ch;
  const seg = (v, label, extra) => '<button type="button" role="radio" aria-checked="' + (c.mode === v) + '" class="seg-b' + (c.mode === v ? ' on' : '') + '" data-act="setmode" data-v="' + v + '">' + label + '<small>' + extra + '</small></button>';
  h += '<fieldset class="fs"><legend>Cách làm</legend><div class="seg" role="radiogroup">' +
    seg('chapter', 'Ôn tập theo bài/chương', 'Làm lần lượt từng bài bạn chọn') +
    seg('exam', 'Thi thử', 'Xáo trộn toàn bộ câu hỏi của cả bộ đề') + '</div></fieldset>';
  if (c.mode === 'chapter') {
    let prevLead = [];
    h += '<fieldset class="fs"><legend>Chọn bài/chương <button class="lnk" data-act="selall">Chọn hết</button> <button class="lnk" data-act="selnone">Bỏ hết</button></legend><div class="chlist">' +
      sub.chapters.map((m) => {
        const o = mine[m.id], pa = pathOf(m), lead = pa.slice(0, -1);
        let hd = '', d0 = 0;
        while (d0 < lead.length && d0 < prevLead.length && lead[d0] === prevLead[d0]) d0++;
        for (let d = d0; d < lead.length; d++) hd += '<div class="grph d' + Math.min(d, 3) + '"><span>' + esc(lead[d]) + '</span><button type="button" class="lnk" data-act="selgrp" data-pre="' + esc(lead.slice(0, d + 1).join(SEP)) + '">Chọn nhóm</button></div>';
        prevLead = lead;
        const wn = wrongInChapter(sub.id, m.id);
        return hd + '<div class="chrow in' + Math.min(lead.length, 3) + '"><label class="chlab"><input type="checkbox" data-k="sel" data-id="' + m.id + '"' + (c.sel[m.id] ? ' checked' : '') + '><span class="chn">' + esc(pa[pa.length - 1]) + '</span></label><span class="chm">' + m.n + ' câu' + (o && o.t ? ' · đúng ' + pct(o.c, o.t) + '%' : '') + '</span>' +
          '<span class="chbtn"><button type="button" class="btn sm" data-act="one" data-id="' + m.id + '" data-v="all">Làm bài này</button>' + (wn ? '<button type="button" class="btn sm" data-act="one" data-id="' + m.id + '" data-v="wrong">Làm lại câu sai (' + wn + ')</button>' : '') + '</span></div>';
      }).join('') + '</div></fieldset>';
  } else {
    const chips = [20, 40, 50, 100].filter((x) => x < sub.total).map((x) => '<button type="button" class="chip' + (c.n === x ? ' on' : '') + '" data-act="setn" data-v="' + x + '">' + x + ' câu</button>').join('') +
      '<button type="button" class="chip' + (c.n === 'all' || c.n >= sub.total ? ' on' : '') + '" data-act="setn" data-v="all">Cả đề (' + sub.total + ')</button>';
    h += '<fieldset class="fs"><legend>Số câu</legend><div class="chips">' + chips + '</div></fieldset>';
  }
  h += '<fieldset class="fs"><legend>Tùy chọn</legend>' +
    '<label class="chk"><input type="checkbox" id="o-sa" data-k="shuffleA"' + (c.shuffleA ? ' checked' : '') + '><span>Xáo trộn đáp án <small class="muted">(câu đánh dấu * trong file không bị xáo)</small></span></label>' +
    '<label class="chk"><input type="checkbox" id="o-sq" data-k="shuffleQ"' + (c.mode === 'exam' || c.shuffleQ ? ' checked' : '') + (c.mode === 'exam' ? ' disabled' : '') + '><span>Xáo trộn câu hỏi trong từng bài' + (c.mode === 'exam' ? ' <small class="muted">(thi thử luôn xáo cả đề)</small>' : '') + '</span></label></fieldset>';
  const n = cfgCount();
  h += '<div class="row actions"><button class="btn pri big" data-act="start"' + (n ? '' : ' disabled') + '>Bắt đầu · ' + n + ' câu</button></div>';
  h += '<section class="anl"><div class="anl-h"><h3>Thống kê sau các lượt làm</h3>' + (D.admin
    ? '<div class="seg2" role="radiogroup"><button type="button" class="chip' + (S.scope === 'me' ? ' on' : '') + '" data-act="scope" data-v="me">Của tôi</button><button type="button" class="chip' + (S.scope === 'all' ? ' on' : '') + '" data-act="scope" data-v="all">Mọi người</button></div>' : '') + '</div>' + anlHTML(sub) + '</section>';
  return h;
}

/* ---------- Bài đọc và chỉ mục nhiều cấp ---------- */
const passOf = (c, q) => (q.p && c.ps ? c.ps.find((x) => x.id === q.p) || null : null);
function mkItem(c, q, idx) {
  const ps = passOf(c, q), fixed = !!(q.s || (q.i && q.i.length));
  return { id: q.id, cid: c.id, cn: c.name, q: q.q, o: idx.map((i) => q.o[i]), a: idx.indexOf(q.a), e: q.e || '', sp: fixed, p: idx.join(''), im: q.i || [],
    pid: ps ? ps.id : '', pt: ps ? ps.t : '', pim: ps && ps.i ? ps.i : [] };
}
/* Xáo thứ tự nhưng các câu cùng một bài đọc luôn đi liền nhau, đúng thứ tự trong file */
function shuffleGroups(items) {
  const groups = [];
  items.forEach((it) => {
    const g = groups[groups.length - 1];
    if (it.pid && g && g[0].cid === it.cid && g[0].pid === it.pid) g.push(it); else groups.push([it]);
  });
  return shuffle(groups).reduce((a, g) => a.concat(g), []);
}
function psgHTML(it, open) {
  if (!it.pt && !(it.pim && it.pim.length)) return '';
  const body = (it.pt ? '<div class="psg-t">' + esc(it.pt) + '</div>' : '') + imgsHTML(it.pim);
  if (open) return '<section class="psg"><div class="psg-h">Bài đọc</div>' + body + '</section>';
  return '<details class="psg"><summary>Bài đọc: ' + esc(clip((it.pt || 'có hình').replace(/\s+/g, ' '), 70)) + '</summary>' + body + '</details>';
}
const chMeta = (c) => { const o = { id: c.id, name: c.name, n: c.qs.length }; if (c.path && c.path.length > 1) o.path = c.path.slice(); return o; };

/* ---------- Hình minh họa ---------- */
S.img = {}; const imgPending = {};
function imgsHTML(ids) {
  if (!ids || !ids.length) return '';
  return '<div class="qimgs">' + ids.map((id) => (S.img[id]
    ? '<img class="qimg" src="' + S.img[id] + '" alt="Hình minh họa" data-act="zoom">'
    : '<div class="qimg ph" data-iid="' + esc(id) + '" data-act="imgretry">Đang tải hình…</div>')).join('') + '</div>';
}
function wantImgs(ids) {
  (ids || []).forEach((id) => {
    if (S.img[id] || imgPending[id]) return;
    imgPending[id] = Promise.resolve().then(() => API.getImage(id)).then((d) => {
      delete imgPending[id];
      if (!d) throw new Error('empty');
      S.img[id] = d;
      document.querySelectorAll('[data-iid="' + id + '"]').forEach((el) => {
        const im = document.createElement('img');
        im.className = 'qimg'; im.src = d; im.alt = 'Hình minh họa'; im.setAttribute('data-act', 'zoom');
        el.replaceWith(im);
      });
    }).catch(() => {
      delete imgPending[id];
      document.querySelectorAll('[data-iid="' + id + '"]').forEach((el) => { el.textContent = 'Chưa tải được hình. Bấm để thử lại.'; });
    });
  });
}
function showZoom(src) {
  const d = document.createElement('div');
  d.className = 'lb'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Hình phóng to');
  const im = document.createElement('img'); im.src = src; im.alt = 'Hình phóng to';
  d.appendChild(im);
  d.addEventListener('click', () => d.remove());
  document.body.appendChild(d);
}
/* Thu nhỏ hình về dung lượng vừa phải (JPEG, rộng tối đa 1000px, tối đa khoảng 170 KB) */
const IMG_MAX_CHARS = 170000;
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = src; });
}
async function compressImage(src) {
  const img = await loadImage(src);
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) throw new Error('size');
  let maxW = 1000, out = '';
  for (let k = 0; k < 8; k++) {
    const sc = Math.min(1, maxW / w0), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w0 * sc)); cv.height = Math.max(1, Math.round(h0 * sc));
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const q of [0.86, 0.72, 0.58]) { out = cv.toDataURL('image/jpeg', q); if (out.length <= IMG_MAX_CHARS) return out; }
    maxW = Math.round(maxW * 0.75);
  }
  return out.length <= 300000 ? out : '';
}
const imgIdOf = (d) => 'i' + fnv(d) + fnv(String(d.length) + d.slice(-48));
const fileToDataUrl = (f) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('read')); fr.readAsDataURL(f); });

function optHTML(it, k, sel) {
  const done = sel >= 0;
  let cls = '', tag = '';
  if (done) {
    if (k === it.a) { cls = 'ok'; tag = sel === k ? 'Đúng' : 'Đáp án đúng'; }
    else if (k === sel) { cls = 'bad'; tag = 'Bạn chọn'; }
  }
  return '<button type="button" class="opt ' + cls + '" data-act="pick" data-i="' + k + '"' + (done ? ' disabled' : '') + '>' +
    '<span class="bub">' + LET[k] + '</span><span class="otext">' + esc(it.o[k]) + '</span>' + (tag ? '<span class="you ' + cls + '">' + tag + '</span>' : '') + '</button>';
}
function panelHTML(r) {
  const groups = [];
  r.items.forEach((it, i) => {
    const key = r.mode === 'exam' ? 'all' : it.cid;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, name: it.cn, cells: [] }; groups.push(g); }
    g.cells.push(i);
  });
  const answered = r.sel.filter((s) => s >= 0).length;
  const sum = r.mode === 'exam' ? 'Phiếu trả lời · ' + answered + '/' + r.items.length : esc(shortName(r.items[r.idx].cn)) + ' · ' + answered + '/' + r.items.length;
  return '<details class="panel"' + (S.panelOpen ? ' open' : '') + '><summary>' + sum + '</summary><div class="pbody">' + groups.map((g) => {
    const done = g.cells.filter((i) => r.sel[i] >= 0).length;
    const isCur = g.cells.includes(r.idx);
    return '<div class="cg' + (isCur ? ' cur' : '') + '">' + (r.mode === 'exam' ? '' : '<div class="cg-h"><span>' + esc(g.name) + '</span><span class="cg-c">' + done + '/' + g.cells.length + '</span></div>' +
        (S.confirmRedo === g.key ? '<div class="confirm box sm"><span>Làm lại phần này? Kết quả ' + done + ' câu đã làm sẽ bị xóa.</span><button type="button" class="btn danger sm" data-act="redoyes" data-id="' + esc(g.key) + '">Làm lại</button><button type="button" class="btn sm" data-act="redono">Hủy</button></div>'
          : done ? '<button type="button" class="lnk redo-l" data-act="redogrp" data-id="' + esc(g.key) + '">Làm lại phần này</button>' : '')) +
      '<div class="sheet">' + g.cells.map((i, j) => {
        const s = r.sel[i], it = r.items[i];
        const cls = 'cell' + (i === r.idx ? ' cur' : '') + (s >= 0 ? (s === it.a ? ' ok' : ' bad') : '');
        return '<button type="button" class="' + cls + '" data-act="goto" data-i="' + i + '" aria-label="Câu ' + (j + 1) + (s >= 0 ? (s === it.a ? ', đúng' : ', sai') : '') + '">' + (r.mode === 'exam' ? i + 1 : j + 1) + '</button>';
      }).join('') + '</div></div>';
  }).join('') + '<p class="legend"><span class="lg ok"></span>Đúng <span class="lg bad"></span>Sai</p></div></details>';
}
function reportHTML(r) {
  if (r.reported[r.idx]) return '<p class="muted small">Đã gửi báo lỗi cho câu này. Cảm ơn bạn.</p>';
  if (S.rpt && S.rpt.idx === r.idx) {
    return '<div class="rptform"><label for="rpt-reason" class="small"><b>Câu này bị lỗi gì?</b></label><select id="rpt-reason" class="inp">' +
      REASONS.map((x) => '<option' + (S.rpt.reason === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>' +
      '<textarea id="rpt-note" class="inp area sm" rows="2" maxlength="300" placeholder="Ghi chú thêm (không bắt buộc)">' + esc(S.rpt.note) + '</textarea>' +
      '<div class="row"><button class="btn pri" data-act="rptsend">Gửi báo lỗi</button><button class="btn ghost" data-act="rptno">Hủy</button></div></div>';
  }
  return '<button class="lnk rptlink small" data-act="rpt">Báo lỗi câu này</button>';
}
function viewQuiz() {
  wantImgs(S.run.items.slice(S.run.idx, S.run.idx + 4).reduce((a, x) => a.concat(x.im || [], x.pim || []), []));
  const r = S.run, it = r.items[r.idx], n = r.items.length, sel = r.sel[r.idx];
  const answered = r.sel.filter((s) => s >= 0).length;
  const el = Math.floor((Date.now() - r.t0) / 1000);
  const unans = n - answered;
  const posInChap = r.items.slice(0, r.idx + 1).filter((x) => x.cid === it.cid).length;
  const totInChap = r.items.filter((x) => x.cid === it.cid).length;
  let h = '<div class="qhead"><div class="qtitle"><span class="made">Mã đề ' + maDe(r.sid) + '</span><span class="qname">' + esc(r.sname) + '</span></div>' +
    '<div class="qright"><span class="clockwrap">Thời gian <b id="clock" class="clock">' + fmtTime(el) + '</b></span></div></div>' +
    '<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + n + '" aria-valuenow="' + answered + '" aria-label="Tiến trình làm bài"><i style="width:' + (answered / n) * 100 + '%"></i></div>';
  if (S.confirmEnd) {
    h += '<div class="confirm box"><span>' + (unans ? 'Còn ' + unans + ' câu chưa làm, các câu này tính là sai.' : 'Bạn đã làm hết các câu.') + ' Kết thúc bài?</span>' +
      '<button class="btn pri" data-act="endyes">Kết thúc</button><button class="btn" data-act="endno">Làm tiếp</button></div>';
  }
  h += '<div class="quizgrid"><div class="main"><article class="card q"><div class="q-h"><span class="q-n">Câu ' + (r.idx + 1) + ' <small>/ ' + n + '</small></span>' +
    (r.mode === 'exam' ? '' : '<span class="chtag">' + esc(shortName(it.cn)) + ' · câu ' + posInChap + '/' + totInChap + '</span>') + '</div>' +
    psgHTML(it, true) + '<div class="stem">' + esc(it.q) + '</div>' + imgsHTML(it.im) + '<div class="opts" role="group" aria-label="Các đáp án">' + it.o.map((_, k) => optHTML(it, k, sel)).join('') + '</div>';
  if (sel >= 0) {
    const ok = sel === it.a;
    h += '<div class="fb ' + (ok ? 'ok' : 'bad') + '" role="status"><b>' + (ok ? 'Chính xác.' : 'Chưa đúng.') + '</b>' + (ok ? '' : ' Đáp án đúng: ' + LET[it.a] + '.') + '</div>';
    if (it.e) h += '<div class="exp"><b>Giải thích.</b> ' + esc(it.e) + '</div>';
  }
  h += reportHTML(r);
  h += '</article><div class="qbar"><button class="btn" data-act="prev"' + (r.idx === 0 ? ' disabled' : '') + '>← Trước</button>' +
    '<button class="btn ghost" data-act="end">Kết thúc</button>' +
    (r.idx < n - 1 ? '<button class="btn pri" data-act="next">Sau →</button>' : '<button class="btn pri" data-act="end">Xem kết quả</button>') + '</div></div>' +
    '<aside class="aside">' + panelHTML(r) + '<p class="keys">Phím tắt: A–D chọn đáp án, ← → chuyển câu.</p></aside></div>';
  return h;
}

function reviewItem(R, i) {
  wantImgs((R.items[i].im || []).concat(R.items[i].pim || []));
  const it = R.items[i], s = R.sel[i], sk = s < 0, ok = s === it.a;
  const st = sk ? 'skip' : ok ? 'ok' : 'bad';
  return '<article class="card rv ' + st + '"><header class="rv-h"><span class="rv-n">Câu ' + (i + 1) + '</span><span class="tag ' + st + '">' + (sk ? 'Bỏ trống' : ok ? 'Đúng' : 'Sai') + '</span><span class="muted small">' + esc(shortName(it.cn)) + '</span></header>' +
    psgHTML(it, false) + '<div class="stem">' + esc(it.q) + '</div>' + imgsHTML(it.im) + '<div class="opts">' + it.o.map((o, k) => {
      const c = k === it.a ? 'ok' : k === s ? 'bad' : '';
      const tag = k === s ? (k === it.a ? 'Bạn chọn · đúng' : 'Bạn chọn · sai') : k === it.a ? 'Đáp án đúng' : '';
      return '<div class="opt static ' + c + '"><span class="bub">' + LET[k] + '</span><span class="otext">' + esc(o) + '</span>' + (tag ? '<span class="you ' + c + '">' + tag + '</span>' : '') + '</div>';
    }).join('') + '</div>' + (it.e ? '<div class="exp"><b>Giải thích.</b> ' + esc(it.e) + '</div>' : '') + '</article>';
}
function viewResult() {
  const R = S.res, run = R.run, n = run.tot;
  const prevRuns = (S.mine.runs || []).filter((r) => r.sid === run.sid && r.t < run.t);
  const prev = prevRuns[prevRuns.length - 1];
  let delta = '';
  if (prev) {
    const d = (run.c / n) * 10 - (prev.c / prev.tot) * 10, t = Math.abs(d).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
    delta = Math.abs(d) < 0.005 ? '<p class="delta">Bằng lần làm trước.</p>' : d > 0 ? '<p class="delta up">▲ Tăng ' + t + ' điểm so với lần trước.</p>' : '<p class="delta down">▼ Giảm ' + t + ' điểm so với lần trước.</p>';
  }
  const wrongIdx = R.items.map((_, i) => i).filter((i) => R.sel[i] !== R.items[i].a);
  const sub = S.subjects.find((s) => s.id === run.sid);
  const chRows = Object.keys(run.ch).map((cid) => {
    const m = sub && sub.chapters.find((x) => x.id === cid);
    const o = run.ch[cid];
    const wn = S.res.items.filter((it, k) => it.cid === cid && S.res.sel[k] !== it.a).length;
    const can = S.sub && S.sub.id === run.sid && m;
    return '<li><div class="bl"><span class="bn">' + esc(m ? m.name : cid) + '</span><span class="bv">' + o[0] + '/' + o[1] + ' đúng</span></div><div class="bt ok"><i style="width:' + Math.max(2, pct(o[0], o[1])) + '%"></i></div>' +
      (can ? '<div class="chbtn left"><button type="button" class="btn sm" data-act="one" data-id="' + cid + '" data-v="all">Làm lại bài này</button>' + (wn ? '<button type="button" class="btn sm" data-act="one" data-id="' + cid + '" data-v="wrong">Làm lại câu sai (' + wn + ')</button>' : '') + '</div>' : '') + '</li>';
  }).join('');
  const hist = (S.mine.runs || []).filter((r) => r.sid === run.sid).slice(-12);
  return '<div class="crumb"><button class="btn ghost" data-act="backsub">← ' + esc(R.sname) + '</button></div>' +
    '<section class="score"><div class="big"><span class="num">' + fmtScore(run.c, n) + '</span><span class="of">/10</span></div>' +
    '<div class="sc-meta"><p class="sc-l"><b>' + run.c + '/' + n + '</b> câu đúng · ' + pct(run.c, n) + '%</p><p class="muted">Sai ' + (run.n - run.c) + ' · Bỏ trống ' + (n - run.n) + ' · Thời gian ' + fmtTime(run.secs) + '</p>' + delta + '</div></section>' +
    (D.canWrite ? '' : '<p class="notice">Bạn đang ở quyền chỉ xem nên lượt này chưa được lưu.</p>') +
    '<section class="actions row">' + (wrongIdx.length ? '<button class="btn pri" data-act="redo">Làm lại ' + wrongIdx.length + ' câu sai và bỏ trống</button>' : '') + '<button class="btn' + (wrongIdx.length ? '' : ' pri') + '" data-act="backsub">Làm lượt khác</button></section>' +
    (chRows ? '<section><h3>Kết quả theo bài/chương</h3><ul class="bars">' + chRows + '</ul></section>' : '') +
    (hist.length > 1 ? '<section class="histc"><h3>Các lượt làm gần đây</h3><div class="hist" role="img" aria-label="Phần trăm câu đúng các lượt gần đây">' + hist.map((x, i) => '<div class="hc' + (i === hist.length - 1 ? ' now' : '') + '"><div class="hb" style="height:' + pct(x.c, x.tot) + '%"><span>' + pct(x.c, x.tot) + '</span></div></div>').join('') + '</div><p class="muted small">Tỉ lệ câu đúng (%), cột đậm là lượt vừa làm.</p></section>' : '') +
    '<section><h3>Các câu sai và bỏ trống (' + wrongIdx.length + ')</h3><div class="rvlist">' + (wrongIdx.length ? wrongIdx.map((i) => reviewItem(R, i)).join('') : '<p class="muted">Bạn làm đúng hết. Giỏi lắm.</p>') + '</div></section>';
}

/* ---------- Admin: theo dõi ---------- */
function viewLive() {
  const rows = S.live.slice().sort((a, b) => b.t - a.t);
  return '<div class="crumb"><button class="btn ghost" data-act="home">← Danh sách môn</button></div><h2 class="h2">Ai đang làm bài</h2>' +
    '<p class="muted small">Tự cập nhật mỗi 15 giây.' + (API.kind === 'gas' ? '' : ' Bản chạy trong claude.ai không lấy được địa chỉ IP, chỉ có tên, môn và tiến độ.') + '</p>' +
    '<div class="tblwrap"><table class="tbl"><thead><tr><th>Tên</th><th>IP</th><th>Môn</th><th>Đang làm</th><th>Tiến độ</th><th>Hoạt động</th></tr></thead><tbody id="livebody">' + liveRows(rows) + '</tbody></table></div>';
}
function liveRows(rows) {
  if (!rows.length) return '<tr><td colspan="6" class="muted">Chưa có ai làm bài.</td></tr>';
  return rows.map((x) => {
    const idle = Date.now() - x.t > 5 * 60000;
    const st = x.st === 'done' ? '<span class="tag">Đã xong</span>' : (idle || x.st === 'idle') ? '<span class="tag">Tạm nghỉ</span>' : '<span class="tag ok">Đang làm</span>';
    return '<tr><td><b>' + esc(x.name || 'Chưa đặt tên') + '</b></td><td>' + esc(x.ip || '–') + '</td><td>' + esc(x.sname || '') + '</td><td>' + (x.mode === 'exam' ? 'Thi thử' : esc(shortName(x.cname || ''))) + '</td><td>Câu ' + ((x.idx || 0) + 1) + '/' + (x.n || 0) + ' · đúng ' + (x.c || 0) + ' ' + st + '</td><td>' + agoShort(x.t) + '</td></tr>';
  }).join('');
}
async function loadLive() {
  try { S.live = await API.getLive(); } catch (e) { return; }
  const b = $('#livebody');
  if (b) b.innerHTML = liveRows(S.live.slice().sort((x, y) => y.t - x.t));
}
function startLive() { stopLive(); loadLive(); liveTick = setInterval(loadLive, 15000); }
function stopLive() { clearInterval(liveTick); liveTick = null; }

/* ---------- Admin: báo lỗi ---------- */
function viewReports() {
  const gs = groupReports();
  let h = '<div class="crumb"><button class="btn ghost" data-act="home">← Danh sách môn</button></div><h2 class="h2">Báo lỗi từ người học</h2>';
  if (!gs.length) return h + '<p class="muted">Chưa có báo lỗi nào cần xử lý.</p>';
  return h + '<div class="rvlist">' + gs.map((g, i) =>
    '<article class="card rep"><div class="rep-h"><b>' + esc(g.sname) + '</b><span class="muted small">' + esc(shortName(g.cname)) + '</span><span class="tag bad">' + g.items.length + ' báo lỗi</span></div>' +
    '<div class="stem sm">' + esc(g.qtext) + '</div><ul class="rep-items">' + g.items.map((x) => '<li><b>' + esc(x.name || 'Ẩn danh') + '</b>: ' + esc(x.reason) + (x.note ? ' · ' + esc(x.note) : '') + ' <span class="muted small">(' + agoShort(x.t) + ')</span></li>').join('') + '</ul>' +
    '<div class="row"><button class="btn pri" data-act="repfix" data-i="' + i + '">Sửa câu này</button><button class="btn" data-act="repdone" data-i="' + i + '">Đã xử lý</button></div></article>').join('') + '</div>';
}

/* ---------- Admin: sửa đề ---------- */
const draftOf = (q) => {
  const c = S.chap[S.sub.id] && S.chap[S.sub.id][S.ed.cid], ps = c && passOf(c, q);
  return { q: q.q, o: q.o.slice(), a: q.a, e: q.e || '', s: !!q.s, i: (q.i || []).slice(), p: q.p || '', pt: ps ? ps.t : '' };
};
function edListHTML() {
  const E = S.ed, sub = S.sub, map = S.chap[sub.id] || {};
  const f = norm(E.filter);
  const rows = [];
  sub.chapters.forEach((m) => {
    const c = map[m.id];
    if (!c || (!f && m.id !== E.cid)) return;
    c.qs.forEach((q, i) => {
      if (f && !(norm(q.q).includes(f) || q.o.some((o) => norm(o).includes(f)))) return;
      rows.push({ c, q, i });
    });
  });
  if (!rows.length) return '<li class="muted">Không có câu nào.</li>';
  return rows.slice(0, 200).map((x) => '<li><div class="edq"><div class="edq-t">' + esc(clip(x.q.q, 150)) + '</div><div class="edq-m">' + esc(shortName(x.c.name)) + ' · câu ' + (x.i + 1) + ' · đáp án ' + LET[x.q.a] + (x.q.i && x.q.i.length ? ' · có hình' : '') + (x.q.s ? ' · không xáo' : '') + '</div></div>' +
    '<button class="btn" data-act="edq" data-id="' + x.c.id + '" data-v="' + x.q.id + '">Sửa</button></li>').join('') +
    (rows.length > 200 ? '<li class="muted small">Chỉ hiện 200 câu đầu, hãy lọc để thu hẹp.</li>' : '');
}
function viewEdit() {
  const E = S.ed, sub = S.sub;
  if (S.loading) return '<div class="crumb"><button class="btn ghost" data-act="edback">← Quay lại</button></div><p class="muted">' + esc(S.loading) + '</p>';
  if (E.draft) return viewEditForm();
  const c = (S.chap[sub.id] || {})[E.cid];
  return '<div class="crumb"><button class="btn ghost" data-act="edback">← ' + (E.back === 'reports' ? 'Báo lỗi' : esc(sub.name)) + '</button></div>' +
    '<h2 class="h2">Sửa đề: ' + esc(sub.name) + '</h2>' +
    '<div class="edtools"><select id="ed-ch" class="inp grow" aria-label="Chọn bài/chương">' + sub.chapters.map((m) => '<option value="' + m.id + '"' + (m.id === E.cid ? ' selected' : '') + '>' + esc(m.name) + ' (' + m.n + ' câu)</option>').join('') + '</select>' +
    '<input id="ed-filter" class="inp grow" type="search" placeholder="Tìm câu trong cả đề…" value="' + esc(E.filter) + '" aria-label="Tìm câu hỏi"></div>' +
    (c ? '<div class="edtools"><input id="ed-cname" class="inp grow" type="text" maxlength="200" value="' + esc(c.name) + '" aria-label="Tên bài/chương"><button class="btn" data-act="edcname">Lưu tên bài</button><button class="btn pri" data-act="edadd">+ Thêm câu vào bài này</button></div>' : '') +
    '<ul id="edlist" class="edlist">' + edListHTML() + '</ul>';
}
function viewEditForm() {
  wantImgs(S.ed.draft.i);
  const E = S.ed, d = E.draft, c = S.chap[S.sub.id][E.cid], isNew = !E.qid;
  return '<div class="crumb"><button class="btn ghost" data-act="edcancel">← Hủy, quay lại</button></div><h2 class="h2">' + (isNew ? 'Thêm câu hỏi' : 'Sửa câu hỏi') + '</h2><p class="muted small">' + esc(c.name) + '</p>' +
    '<div class="edform">' + (d.p ? '<div class="field"><label for="ed-pt">Bài đọc (chung cho mọi câu cùng bài đọc)</label><textarea id="ed-pt" class="inp area" data-ed="pt" rows="6">' + esc(d.pt) + '</textarea></div>' : '') + '<div class="field"><label for="ed-q">Câu hỏi</label><textarea id="ed-q" class="inp area sm" data-ed="q" rows="3">' + esc(d.q) + '</textarea></div>' +
    '<fieldset class="fs"><legend>Hình minh họa (nằm dưới câu hỏi)</legend>' + ((d.i && d.i.length) ? '<div class="edimgs">' + d.i.map((x, k) => '<div class="edimg">' + imgsHTML([x]) + '<button type="button" class="btn ghost" data-act="edimgrm" data-i="' + k + '">Bỏ hình này</button></div>').join('') + '</div>' : '<p class="muted small">Câu này chưa có hình.</p>') +
      '<div class="row"><button type="button" class="btn" data-act="edimgadd"' + (S.ed.busy ? ' disabled' : '') + '>+ Thêm hình</button><input id="ed-img" type="file" accept="image/*" hidden>' + (S.ed.busy ? '<span class="muted small">' + esc(S.ed.busy) + '</span>' : '') + '</div></fieldset>' +
    '<fieldset class="fs"><legend>Các đáp án (chọn nút tròn ở đáp án đúng)</legend>' + d.o.map((o, k) =>
      '<div class="oedit"><input type="radio" name="ed-a" value="' + k + '"' + (d.a === k ? ' checked' : '') + ' aria-label="Đáp án ' + LET[k] + ' là đáp án đúng"><span class="bub sm">' + LET[k] + '</span>' +
      '<textarea class="inp area sm" rows="2" data-ed="o" data-k="' + k + '" aria-label="Nội dung đáp án ' + LET[k] + '">' + esc(o) + '</textarea>' +
      (d.o.length > 2 ? '<button type="button" class="btn ghost" data-act="edrmo" data-i="' + k + '" aria-label="Xóa đáp án ' + LET[k] + '">×</button>' : '') + '</div>').join('') +
    (d.o.length < 8 ? '<button class="btn" data-act="edaddo">+ Thêm đáp án</button>' : '') + '</fieldset>' +
    '<label class="chk"><input type="checkbox" id="ed-s"' + (d.s || (d.i && d.i.length) ? ' checked' : '') + ((d.i && d.i.length) ? ' disabled' : '') + '><span>Không xáo trộn đáp án của câu này <small class="muted">(ví dụ câu có "Cả A và B đều đúng")</small></span></label>' +
    '<div class="field"><label for="ed-e">Giải thích (không bắt buộc)</label><textarea id="ed-e" class="inp area sm" data-ed="e" rows="3">' + esc(d.e) + '</textarea></div>' +
    '<div class="row actions"><button class="btn pri big" data-act="edsave">Lưu câu</button>' +
    (isNew ? '' : (E.confirmDel ? '<span class="confirm"><span>Xóa câu này?</span><button class="btn danger" data-act="eddelyes">Xóa</button><button class="btn" data-act="eddelno">Giữ lại</button></span>' : '<button class="btn ghost" data-act="eddel">Xóa câu</button>')) + '</div></div>';
}
async function persistSubject(sid) {
  const sub = S.subjects.find((s) => s.id === sid) || S.sub;
  const map = S.chap[sid] || {};
  const chapters = sub.chapters.map((m) => map[m.id]).filter((c) => c && c.qs.length);
  const meta = Object.assign({}, sub, {
    updatedAt: Date.now(), by: S.name,
    total: chapters.reduce((a, c) => a + c.qs.length, 0),
    chapters: chapters.map(chMeta),
  });
  await API.saveSubject(meta, chapters);
  [S.sub, S.subjects.find((s) => s.id === sid)].forEach((o) => { if (o && o.id === sid) Object.assign(o, meta); });
  Object.keys(map).forEach((cid) => { if (!meta.chapters.find((c) => c.id === cid)) delete map[cid]; });
}
async function startEdit(id, opts) {
  const sub = S.subjects.find((s) => s.id === id) || S.sub;
  if (!sub) return;
  S.sub = sub;
  S.ed = Object.assign({ cid: sub.chapters[0] && sub.chapters[0].id, filter: '', draft: null, qid: null, confirmDel: false, back: 'sub', rep: null }, opts && opts.state);
  S.loading = 'Đang tải đề…';
  go('edit');
  try { await loadChapters(sub); S.loading = ''; } catch (e) { S.loading = errMsg(e, 'Chưa tải được đề. Hãy tải lại trang.'); }
  if (opts && opts.open && !S.loading) {
    const c = (S.chap[sub.id] || {})[opts.open.cid];
    const q = c && c.qs.find((x) => x.id === opts.open.qid);
    if (q) { S.ed.cid = c.id; S.ed.qid = q.id; S.ed.draft = draftOf(q); }
    else toast('Không tìm thấy câu này, có thể đã bị xóa hoặc đề đã được nhập lại.');
  }
  if (S.view === 'edit') render(true);
}
async function onEditImage(file) {
  const E = S.ed, d = E.draft;
  if ((d.i || []).length >= 6) { toast('Mỗi câu tối đa 6 hình.'); return; }
  E.busy = 'Đang xử lý hình…'; render(false);
  try {
    const url = await compressImage(await fileToDataUrl(file));
    if (!url) throw new Error('big');
    const id = imgIdOf(url);
    E.busy = 'Đang tải hình lên…'; render(false);
    if (!(await API.hasImages([id])).length) await API.saveImage(id, url);
    S.img[id] = url; (d.i = d.i || []).push(id);
    E.busy = ''; render(false);
  } catch (e) { E.busy = ''; render(false); toast(errMsg(e, 'Không đọc được hình này. Hãy chọn file ảnh PNG hoặc JPG.')); }
}
async function saveDraft() {
  const E = S.ed, d = E.draft, sub = S.sub, c = S.chap[sub.id][E.cid];
  const q = d.q.trim(), o = d.o.map((x) => x.trim());
  if (!q) { toast('Câu hỏi đang trống.'); return; }
  const empty = o.findIndex((x) => !x);
  if (empty >= 0) { toast('Đáp án ' + LET[empty] + ' đang trống. Hãy điền hoặc bấm × để xóa.'); return; }
  if (o.length < 2) { toast('Cần ít nhất 2 đáp án.'); return; }
  if (d.a < 0 || d.a >= o.length) { toast('Hãy chọn đáp án đúng.'); return; }
  const backup = clone(c.qs);
  const item = { id: E.qid || newId(), q, o, a: d.a, e: d.e.trim(), s: (d.s || (d.i && d.i.length)) ? 1 : 0 };
  if (d.i && d.i.length) item.i = d.i.slice();
  const oldQ = E.qid ? c.qs.find((x) => x.id === E.qid) : null;
  const backPs = clone(c.ps || []);
  if (oldQ && oldQ.p) {
    item.p = oldQ.p;
    const ps = (c.ps || []).find((x) => x.id === oldQ.p);
    if (ps && d.pt !== undefined) ps.t = d.pt.trim();
  }
  if (E.qid) c.qs[c.qs.findIndex((x) => x.id === E.qid)] = item; else c.qs.push(item);
  try { await persistSubject(sub.id); } catch (e) { c.qs = backup; c.ps = backPs; toast(errMsg(e, 'Chưa lưu được câu hỏi.')); return; }
  const rep = E.rep;
  E.draft = null; E.qid = null; E.confirmDel = false;
  if (rep) {
    try { await Promise.all(rep.items.map((x) => API.resolveReport(x))); rep.items.forEach((x) => { x.done = true; }); } catch (e) { /* admin xử lý tay sau */ }
    S.nReports = groupReports().length;
    go('reports');
  } else render(true);
  toast('Đã lưu câu hỏi.');
}
async function deleteDraft() {
  const E = S.ed, sub = S.sub, c = S.chap[sub.id][E.cid];
  const backup = clone(c.qs);
  c.qs = c.qs.filter((x) => x.id !== E.qid);
  try { await persistSubject(sub.id); } catch (e) { c.qs = backup; toast(errMsg(e, 'Chưa xóa được câu hỏi.')); return; }
  const rep = E.rep;
  E.draft = null; E.qid = null; E.confirmDel = false;
  if (!S.chap[sub.id][E.cid]) E.cid = sub.chapters[0] && sub.chapters[0].id;
  if (rep) { try { await Promise.all(rep.items.map((x) => API.resolveReport(x))); rep.items.forEach((x) => { x.done = true; }); } catch (e) { /* bỏ qua */ } S.nReports = groupReports().length; go('reports'); }
  else if (!sub.chapters.length) { await refreshSubjects(); go('home'); }
  else render(true);
  toast('Đã xóa câu hỏi.');
}

/* ---------- Admin: nhập đề ---------- */
function fixItems(p) {
  const out = [];
  p.chapters.forEach((c, ci) => c.qs.forEach((q, qi) => { if (q.ans < 0) out.push({ c, q, ci, qi }); }));
  return out;
}
function fixBoxHTML(I) {
  const items = fixItems(I.parsed);
  if (!items.length) return '';
  return '<div class="fixbox"><h4>Cần bổ sung đáp án (' + items.length + ' câu)</h4><p class="small">Các câu này không có dòng "Đáp án: X" trong file. Chọn đáp án đúng để nhập câu, hoặc để "Không nhập" để bỏ qua. Bạn cũng có thể sửa trong file rồi nhập lại.</p>' +
    items.map((x) => {
      const key = x.ci + ':' + x.qi, cur = I.fixAns[key] === undefined ? -1 : I.fixAns[key];
      return '<div class="fixq"><div class="pv-stem"><span class="muted small">' + esc(shortName(x.c.name)) + ' · </span>' + esc(clip(x.q.q, 220)) + '</div><div class="fixopts">' +
        x.q.opts.map((o, k) => '<label class="fixopt"><input type="radio" name="fx-' + x.ci + '-' + x.qi + '" data-fix="' + key + '" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span class="bub sm">' + LET[k] + '</span><span>' + esc(clip(o, 120)) + '</span></label>').join('') +
        '<label class="fixopt"><input type="radio" name="fx-' + x.ci + '-' + x.qi + '" data-fix="' + key + '" value="-1"' + (cur === -1 ? ' checked' : '') + '><span class="muted">Không nhập câu này</span></label></div></div>';
    }).join('') + '</div>';
}
function viewImport() {
  const I = S.imp;
  let h = '<div class="crumb"><button class="btn ghost" data-act="home">← Danh sách môn</button></div><h2 class="h2">Nhập đề</h2>';
  if (API.canDrive) {
    h += '<section class="imp-src"><h3>Từ thư mục "Multiple-Choice Question Bank" trên Google Drive</h3>' +
      '<div class="row"><button class="btn" data-act="dsearch"' + (I.busy ? ' disabled' : '') + '>Làm mới danh sách</button></div>' +
      (I.err ? '<p class="err">' + esc(I.err) + '</p>' : '') +
      (I.results && !I.inFolder ? '<p class="notice">Không thấy thư mục "Multiple-Choice Question Bank" trên Drive nên đang liệt kê mọi file .docx.</p>' : '') +
      (I.results ? (I.results.length ? '<ul class="flist">' + I.results.map((f) => {
        const had = S.subjects.some((s) => s.id === 's' + fnv(norm(f.title.replace(/\.docx$/i, ''))));
        return '<li><div class="fn"><b>' + esc(f.title) + '</b><span class="muted small">' + (had ? 'Đã nhập · ' : '') + (f.modifiedTime ? 'Sửa ' + ago(Date.parse(f.modifiedTime)) : '') + '</span></div><button class="btn' + (had ? '' : ' pri') + '" data-act="dpick" data-id="' + esc(f.id) + '" data-t="' + esc(f.title) + '" data-m="' + esc(f.mimeType || '') + '"' + (I.busy ? ' disabled' : '') + '>' + (had ? 'Nhập lại' : 'Nhập') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted">Chưa có file .docx nào trong thư mục này.</p>') : '') + '</section>';
  } else if (I.err) h += '<p class="err">' + esc(I.err) + '</p>';
  h += '<section class="imp-src"><h3>Từ máy tính</h3><div class="row"><button class="btn" data-act="pickfile"' + (I.busy ? ' disabled' : '') + '>Chọn file .docx</button><input id="imp-file" type="file" accept=".docx" hidden>' +
    (API.canDrive ? '<span class="muted small">Có thể lưu thêm một bản sao file vào Google Drive.</span>' : '') + '</div></section>';
  h += '<details class="help"' + (I.pasted ? ' open' : '') + '><summary>Dán nội dung đề (nếu không đọc được file)</summary><div><textarea id="imp-text" class="inp area" spellcheck="false" placeholder="Bài 1: Tên bài (16 câu)&#10;Câu 1. Nội dung câu hỏi&#10;A. Đáp án A&#10;B. Đáp án B&#10;Đáp án: B.">' + esc(I.pasted || '') + '</textarea><div class="row"><button class="btn" data-act="parsepaste">Đọc nội dung này</button></div></div></details>';
  if (I.busy) h += '<p class="muted busy">' + esc(I.busy) + '</p>';
  if (I.parsed) {
    const p = I.parsed, fx = fixItems(p);
    const fixed = fx.filter((x) => I.fixAns[x.ci + ':' + x.qi] >= 0).length;
    const old = oldOf(I), mode = old ? (I.mode || 'merge') : 'replace';
    const plan = old && mode === 'merge' ? mergePlan(p.chapters, old.chapters) : null;
    const nSel = plan ? p.chapters.filter((c, ci) => I.chSel[ci] !== false).reduce((a, c) => a + c.qs.length, 0) : 1;
    h += '<section class="prev"><h3>Kết quả đọc đề</h3>' +
      '<div class="field"><label for="imp-name">Tên môn (lấy theo tên file)</label><input id="imp-name" class="inp" type="text" value="' + esc(I.name) + '" maxlength="120"></div>' +
      (S.subjects.length ? '<div class="field"><label for="imp-into">Hoặc đồng bộ vào môn đã có</label><select id="imp-into" class="inp"><option value="">Theo tên ở trên</option>' + S.subjects.map((x) => '<option value="' + esc(x.id) + '"' + (old && old.id === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' : '') +
      '<p class="pv-count"><b>' + (p.total + fixed) + '</b> câu sẽ được nhập, trong <b>' + p.chapters.length + '</b> bài/chương' + (nImgQ(p, I) ? ' · <b>' + nImgQ(p, I) + '</b> câu có hình (không xáo đáp án)' : '') + (p.chapters.some((c) => c.qs.some((q) => q.sp)) ? ' · có câu không xáo đáp án' : '') + '</p>' +
      (p.warn.length ? '<ul class="warn">' + p.warn.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '') +
      fixBoxHTML(I) +
      (old ? '<fieldset class="fs"><legend>Môn này đã có, cách lưu</legend><div class="seg" role="radiogroup">' +
        '<button type="button" role="radio" aria-checked="' + (mode === 'merge') + '" class="seg-b' + (mode === 'merge' ? ' on' : '') + '" data-act="impmode" data-v="merge">Đồng bộ theo bài<small>Bài cùng tên được cập nhật, bài mới được thêm, bài khác giữ nguyên</small></button>' +
        '<button type="button" role="radio" aria-checked="' + (mode === 'replace') + '" class="seg-b' + (mode === 'replace' ? ' on' : '') + '" data-act="impmode" data-v="replace">Thay cả môn<small>Xóa nội dung cũ, chỉ giữ các bài trong file này</small></button></div></fieldset>' : '') +
      (plan
        ? '<ul class="chsum">' + p.chapters.map((c, ci) => '<li><label class="chk"><input type="checkbox" data-impch="' + ci + '"' + (I.chSel[ci] === false ? '' : ' checked') + '><span>' + esc(c.name) + '</span></label><b>' + c.qs.length + ' câu · ' + (plan[ci] ? 'cập nhật' : 'bài mới') + '</b></li>').join('') + '</ul>' +
          (old.chapters.filter((m) => !plan.includes(m.id)).length ? '<p class="small muted">Giữ nguyên: ' + esc(old.chapters.filter((m) => !plan.includes(m.id)).map((m) => shortName(m.name)).join(', ')) + '.</p>' : '')
        : '<ul class="chsum">' + p.chapters.map((c) => '<li><span>' + esc(c.name) + '</span><b>' + c.qs.length + ' câu</b></li>').join('') + '</ul>' + (old ? '<p class="notice">Lưu sẽ thay nội dung cũ. Thống kê của các câu không đổi nội dung vẫn được giữ.</p>' : '')) +
      (I.file && API.canDrive ? '<label class="chk"><input type="checkbox" id="imp-copy"' + (I.copy ? ' checked' : '') + '><span>Lưu thêm một bản sao file vào thư mục Multiple-Choice Question Bank</span></label>' : '') +
      '<div class="row actions"><button class="btn pri big" data-act="savesub"' + (I.busy || !(p.total + fixed) || !nSel ? ' disabled' : '') + '>' + (plan ? 'Đồng bộ vào môn' : 'Lưu môn này') + '</button></div></section>';
  }
  return h;
}
/* Ghép bài trong file với bài đã có của môn: cùng tên, hoặc cùng số bài ("Bài 3") thì coi là một bài */
function mergePlan(chapters, oldChs) {
  const used = new Set();
  const find = (name) => {
    const k = norm(name);
    let m = oldChs.find((c) => !used.has(c.id) && norm(c.name) === k);
    if (!m && shortName(name) !== name) { const sk = norm(shortName(name)); m = oldChs.find((c) => !used.has(c.id) && norm(shortName(c.name)) === sk); }
    if (m) used.add(m.id);
    return m ? m.id : '';
  };
  return chapters.map((c) => find(c.name));
}
const nImgQ = (p, I) => p.chapters.reduce((a, c) => a + c.qs.filter((q) => (q.imgs || []).some((n) => I.imgIds[n])).length, 0);
function oldOf(I) { return S.subjects.find((x) => x.id === 's' + fnv(norm(I.name))); }
function setParsed(text, name, extra) {
  const I = S.imp;
  const p = parseExam(text, name);
  Object.assign(I, { parsed: p, name, busy: '', err: '', copy: true, fixAns: {}, chSel: {}, imgIds: [], imgData: {} }, extra || {});
  const bad = new Set();
  p.chapters.forEach((c) => { c.qs.forEach((q) => (q.imgs || []).forEach((n) => { if (!I.imgIds[n]) bad.add(n); })); (c.ps || []).forEach((x) => (x.imgs || []).forEach((n) => { if (!I.imgIds[n]) bad.add(n); })); });
  if (bad.size) p.warn.push(bad.size + ' hình không đọc được (có thể là định dạng hình vẽ của Word), các câu đó sẽ thiếu hình.');
  if (!p.total && !p.need) { I.err = 'Chưa nhận ra câu hỏi nào. Mỗi bài cần dòng "Bài 1: …", mỗi câu bắt đầu bằng "Câu 1.", đáp án "A.", "B." và dòng "Đáp án: X."'; I.parsed = null; }
}
async function loadDrive() {
  const I = S.imp;
  I.busy = 'Đang mở thư mục trên Google Drive…'; I.err = ''; render(false);
  try {
    const r = await API.driveList();
    I.results = r.files; I.inFolder = r.inFolder; I.busy = '';
  } catch (e) { I.busy = ''; I.err = errMsg(e, 'Không đọc được danh sách file.'); }
  render(false);
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load'));
    document.head.appendChild(s);
  });
}
async function docxToParts(buf) {
  if (!window.mammoth) await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
  const m = window.mammoth, images = [];
  let html = '';
  try {
    const out = await m.convertToHtml({ arrayBuffer: buf }, {
      convertImage: m.images.imgElement((image) => image.read('base64').then((b64) => { images.push({ ct: image.contentType || 'image/png', b64 }); return { src: 'tda-img:' + (images.length - 1) }; })),
    });
    html = out.value;
  } catch (e) { images.length = 0; }
  /* Không có hình: dùng đường đọc chữ thuần như cũ */
  if (!images.length) return { text: (await m.extractRawText({ arrayBuffer: buf })).value, images: [] };
  return { text: htmlToText(html), images };
}
async function docxToText(buf) { return (await docxToParts(buf)).text; }
async function prepareImages(images) {
  const I = S.imp, byId = {}, ids = [];
  for (let i = 0; i < images.length; i++) {
    I.busy = 'Đang xử lý hình ' + (i + 1) + '/' + images.length + '…'; render(false);
    let id = '';
    try {
      const d = await compressImage('data:' + images[i].ct + ';base64,' + images[i].b64);
      if (d) { id = imgIdOf(d); byId[id] = d; S.img[id] = d; }
    } catch (e) { id = ''; }
    ids.push(id);
  }
  return { ids, byId };
}
async function drivePick(id, title, mime) {
  const I = S.imp;
  I.busy = 'Đang đọc file từ Google Drive…'; I.err = ''; I.file = null; render(false);
  const name = title.replace(/\.docx$/i, '');
  try {
    const f = { id, title, mimeType: mime };
    const r = await API.driveRead(f);
    let text = r.text, images = [];
    if (text == null) { const pr = await docxToParts(r.docx); text = pr.text; images = pr.images; }
    if (!parseExam(text, name).chapters.length && API.driveReadBinary) { const pr = await docxToParts((await API.driveReadBinary(f)).docx); text = pr.text; images = pr.images; }
    const prep = await prepareImages(images);
    setParsed(text, name, { driveId: id, file: null, imgIds: prep.ids, imgData: prep.byId });
  } catch (e) { I.busy = ''; I.err = errMsg(e, 'Không đọc được nội dung file này. Hãy thử chọn file từ máy tính, hoặc dán nội dung vào ô bên dưới.'); }
  render(false);
}
async function onLocalFile(f) {
  const I = S.imp;
  I.busy = 'Đang đọc file…'; I.err = ''; render(false);
  try {
    const pr = await docxToParts(await f.arrayBuffer());
    const prep = await prepareImages(pr.images);
    setParsed(pr.text, f.name.replace(/\.docx$/i, ''), { driveId: '', file: f, imgIds: prep.ids, imgData: prep.byId });
  } catch (e) { I.busy = ''; I.err = 'Không đọc được file này. Hãy chọn file .docx hoặc dán nội dung vào ô bên dưới.'; }
  render(false);
}
async function saveSubject() {
  const I = S.imp, p = I.parsed;
  const name = ($('#imp-name') || { value: I.name }).value.trim();
  const copyBox = $('#imp-copy');
  if (copyBox) I.copy = copyBox.checked;
  if (!name || !p) return;
  const sid = 's' + fnv(norm(name)), old = S.subjects.find((s) => s.id === sid);
  const resolved = resolveFixes(p.chapters, I.fixAns).map((c) => Object.assign({}, c, { qs: c.qs.map((q) => Object.assign({}, q, { imgs: (q.imgs || []).map((n) => I.imgIds[n]).filter(Boolean) })), ps: (c.ps || []).map((x) => Object.assign({}, x, { imgs: (x.imgs || []).map((n) => I.imgIds[n]).filter(Boolean) })) }));
  const hasQ = (c) => c.qs.some((q) => q.ans >= 0);
  let chs, sum = null;
  if (old && (I.mode || 'merge') === 'merge') {
    I.busy = 'Đang đọc môn hiện có…'; render(false);
    try { await loadChapters(old); } catch (e) { I.busy = ''; render(false); toast(errMsg(e, 'Chưa đọc được môn hiện có để đồng bộ.')); return; }
    const plan = mergePlan(p.chapters, old.chapters), have = S.chap[old.id] || {};
    const raw = [], ids = [], kept = {};
    let upd = 0, add = 0, keep = 0;
    old.chapters.forEach((m) => {
      const k = plan.indexOf(m.id), cur = have[m.id];
      if (k >= 0 && I.chSel[k] !== false && hasQ(resolved[k])) { raw.push(resolved[k]); ids.push(m.id); upd++; }
      else if (cur) { raw.push({ name: cur.name, qs: [], ps: [] }); ids.push(m.id); kept[m.id] = cur; keep++; }
    });
    resolved.forEach((c, ci) => { if (!plan[ci] && I.chSel[ci] !== false && hasQ(c)) { raw.push(c); ids.push(''); add++; } });
    chs = packChapters(raw);
    let next = 0;
    ids.forEach((x) => { const n = Number(String(x).replace(/\D/g, '')); if (n > next) next = n; });
    chs.forEach((c, i) => { c.id = ids[i] || 'c' + (++next); if (kept[c.id]) { const k = kept[c.id]; c.name = k.name; c.qs = clone(k.qs); if (k.path) c.path = k.path.slice(); else delete c.path; if (k.ps) c.ps = clone(k.ps); else delete c.ps; } });
    sum = { upd, add, keep };
  } else chs = packChapters(resolved);
  const total = chs.reduce((a, c) => a + c.qs.length, 0);
  if (!total) { I.busy = ''; render(false); return; }
  const need = [];
  chs.forEach((c) => { const add = (x) => { if (I.imgData[x] && !need.includes(x)) need.push(x); }; c.qs.forEach((q) => (q.i || []).forEach(add)); (c.ps || []).forEach((x) => (x.i || []).forEach(add)); });
  if (need.length) {
    try {
      I.busy = 'Đang kiểm tra hình trên máy chủ…'; render(false);
      const have = new Set(await API.hasImages(need));
      const up = need.filter((x) => !have.has(x));
      for (let i = 0; i < up.length; i++) { I.busy = 'Đang tải hình lên ' + (i + 1) + '/' + up.length + '…'; render(false); await API.saveImage(up[i], I.imgData[up[i]]); }
    } catch (e) { I.busy = ''; render(false); toast(errMsg(e, 'Chưa tải được hình lên. Hãy thử lại.')); return; }
  }
  const meta = { id: sid, name, createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now(), by: S.name, driveId: I.driveId || (old && old.driveId) || '', total, chapters: chs.map(chMeta) };
  I.busy = 'Đang lưu môn…'; render(false);
  try { await API.saveSubject(meta, chs); }
  catch (e) { I.busy = ''; render(false); toast(errMsg(e, 'Chưa lưu được môn này. Hãy kiểm tra quyền chỉnh sửa của bạn rồi thử lại.')); return; }
  delete S.chap[sid];
  let note = '';
  if (I.file && I.copy && API.canDrive) {
    I.busy = 'Đang sao chép file vào Google Drive…'; render(false);
    try { await API.driveUpload(I.file); note = ' Đã sao chép file vào Google Drive.'; } catch (e) { note = ' Chưa sao chép được file vào Google Drive.'; }
  }
  S.imp = null;
  await refreshSubjects();
  go('home');
  toast(sum ? 'Đã đồng bộ "' + name + '": cập nhật ' + sum.upd + ' bài, thêm ' + sum.add + ' bài, giữ nguyên ' + sum.keep + ' bài. Tổng ' + total + ' câu.' + note : 'Đã lưu môn "' + name + '" với ' + total + ' câu.' + note);
}

const views = { boot: () => '<div class="boot">Đang mở thư viện…</div>', nodb: viewNoDb, name: viewName, adminin: viewAdminLogin, home: viewHome, sub: viewSub, quiz: viewQuiz, result: viewResult, live: viewLive, reports: viewReports, edit: viewEdit, import: viewImport };

function render(scroll) {
  const a = document.activeElement;
  const key = a && a.dataset && a.dataset.act ? [a.dataset.act, a.dataset.i, a.dataset.id, a.dataset.v] : null;
  app.innerHTML = views[S.view]();
  if (scroll) window.scrollTo(0, 0);
  else if (key) {
    const sel = '[data-act="' + key[0] + '"]' + (key[1] != null ? '[data-i="' + key[1] + '"]' : '') + (key[2] != null ? '[data-id="' + key[2] + '"]' : '') + (key[3] != null ? '[data-v="' + key[3] + '"]' : '');
    const el = $(sel);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  if (S.view === 'name' || S.view === 'adminin') { const i = $(S.view === 'name' ? '#nm' : '#ak'); if (i && scroll) i.focus(); }
}
function go(v) {
  if (v === 'home' && S.view !== 'boot' && S.view !== 'quiz') refreshProg();
  if (S.view === 'live' && v !== 'live') stopLive();
  S.view = v; S.confirmRedo = null; S.confirmDel = null; S.confirmEnd = false; S.confirmDrop = false;
  if (v !== 'quiz') { clearInterval(timer); S.rpt = null; }
  render(true);
  if (v === 'quiz') { clearInterval(timer); timer = setInterval(tick, 1000); }
  if (v === 'home') { refreshSubjects(); if (D.admin) loadReports(); }
}

/* ---------- Làm bài ---------- */
/* Các câu mà lần làm gần nhất của bạn là sai (câu đã làm đúng sau đó thì không còn tính) */
function lastWrong(sid) {
  const last = {};
  (S.mine.runs || []).filter((r) => r.sid === sid).forEach((r) => {
    (r.w || []).forEach((id) => { last[id] = 0; });
    (r.r || []).forEach((id) => { last[id] = 1; });
  });
  return new Set(Object.keys(last).filter((id) => last[id] === 0));
}
function wrongInChapter(sid, cid) {
  const c = (S.chap[sid] || {})[cid];
  if (!c) return 0;
  const w = lastWrong(sid);
  return c.qs.filter((q) => w.has(q.id)).length;
}
function buildRun(only) {
  const sub = S.sub, cfg = S.cfg, chs = S.chap[sub.id] || {};
  const mk = (c, q) => {
    let idx = q.o.map((_, i) => i);
    const fixed = q.s || (q.i && q.i.length);
    if (cfg.shuffleA && !fixed) idx = shuffle(idx);
    return mkItem(c, q, idx);
  };
  let items = [];
  if (cfg.mode === 'chapter') {
    sub.chapters.forEach((m) => {
      const c = chs[m.id];
      if (only ? m.id !== only.cid : !cfg.sel[m.id]) return;
      if (!c) return;
      const qs = c.qs.filter((q) => !only || !only.ids || only.ids.has(q.id)).map((q) => mk(c, q));
      (cfg.shuffleQ ? shuffleGroups(qs) : qs).forEach((x) => items.push(x));
    });
  } else {
    sub.chapters.forEach((m) => { const c = chs[m.id]; if (c) c.qs.forEach((q) => items.push(mk(c, q))); });
    items = shuffleGroups(items);
    if (cfg.n !== 'all') items = items.slice(0, cfg.n);
  }
  return { sid: sub.id, sname: sub.name, mode: cfg.mode, items, sel: items.map(() => -1), reported: {}, idx: 0, t0: Date.now(), rid: String(Date.now()) };
}
let hbTimer = null, hbLast = 0, hbPending = null;
/* ---------- Phần đang làm dở: lưu trên máy và trên máy chủ để tiếp tục ở thiết bị khác ---------- */
let progTimer = null, progFullFor = '', progChain = Promise.resolve();
const progKey = () => 'tda.prog.' + (API.uid || '');
function progPayload(r, full) {
  const p = { rid: r.rid, sid: r.sid, sname: r.sname, mode: r.mode, sel: r.sel.map((x) => (x < 0 ? 'x' : String(x))).join(''), idx: r.idx, el: Date.now() - r.t0 };
  if (full) p.items = r.items.map((it) => it.cid + '|' + it.id + '|' + (it.p || '')).join(';');
  return p;
}
function saveProg(now) {
  const r = S.run;
  if (!r || !r.rid) return;
  S.prog = Object.assign(progPayload(r, true), { t: Date.now() });
  LS.set(progKey(), S.prog);
  clearTimeout(progTimer); progTimer = null;
  const send = () => {
    progChain = progChain.then(async () => {
      const rr = S.run;
      if (!rr || !rr.rid) return;
      try { await API.saveProgress(progPayload(rr, progFullFor !== rr.rid)); progFullFor = rr.rid; }
      catch (e) {
        if (e && e.code === 'no_progress') { try { await API.saveProgress(progPayload(rr, true)); progFullFor = rr.rid; } catch (e2) { /* thử lại ở lần lưu sau */ } }
      }
    }).catch(() => {});
  };
  if (now) send(); else progTimer = setTimeout(send, 1200);
}
function clearProg() {
  clearTimeout(progTimer); progTimer = null; progFullFor = '';
  S.prog = null;
  LS.set(progKey(), null);
  progChain = progChain.then(() => API.clearProgress()).catch(() => {});
}
async function loadProg() {
  let remote, ok = true;
  try { remote = await API.getProgress(); } catch (e) { ok = false; }
  const local = LS.get(progKey(), null);
  const best = ok ? remote : local;
  S.prog = best && best.items && best.sid ? best : null;
}
function refreshProg() { loadProg().then(() => { if (S.view === 'home' || S.view === 'sub') render(false); }); }
const progCount = (p) => ({ n: p.items.split(';').length, done: p.sel.replace(/x/g, '').length });
function resumeHTML(p, mini) {
  const c = progCount(p);
  return '<section class="resume"><div><b>' + (mini ? 'Bạn đang làm dở môn này' : 'Đang làm dở: ' + esc(p.sname)) + '</b><p>' + (p.mode === 'exam' ? 'Thi thử' : 'Ôn theo bài') + ' · câu ' + (Number(p.idx) + 1) + '/' + c.n + ' · đã trả lời ' + c.done + ' · ' + agoShort(p.t || Date.now()) + '</p></div>' +
    (S.confirmDrop ? '<div class="confirm"><span>Bỏ phần đang làm dở?</span><button class="btn danger" data-act="dropyes">Bỏ</button><button class="btn" data-act="dropno">Giữ lại</button></div>'
      : '<div class="row"><button class="btn pri" data-act="resume">Tiếp tục làm</button><button class="btn ghost" data-act="drop">Bỏ phần này</button></div>') + '</section>';
}
async function resumeProg() {
  const p = S.prog;
  const sub = p && S.subjects.find((x) => x.id === p.sid);
  if (!sub) { toast('Môn này không còn trong thư viện.'); return; }
  S.sub = sub;
  const sel0 = {};
  sub.chapters.forEach((c) => { sel0[c.id] = true; });
  S.cfg = { mode: 'chapter', sel: sel0, shuffleA: false, shuffleQ: false, n: 'all' };
  S.loading = 'Đang tải đề…'; go('sub');
  try { await loadChapters(sub); } catch (e) { S.loading = errMsg(e, 'Chưa tải được đề. Hãy tải lại trang.'); render(false); return; }
  S.loading = '';
  const items = [], sel = [];
  p.items.split(';').forEach((tok, i) => {
    const [cid, qid, perm] = tok.split('|');
    const c = (S.chap[sub.id] || {})[cid], q = c && c.qs.find((x) => x.id === qid);
    if (!q) return;
    let idx = String(perm || '').split('').map(Number);
    if (idx.length !== q.o.length || idx.some((x) => !(x >= 0 && x < q.o.length)) || new Set(idx).size !== idx.length) idx = q.o.map((_, k) => k);
    items.push(mkItem(c, q, idx));
    const ch = p.sel.charAt(i);
    sel.push(ch && ch !== 'x' && Number(ch) < q.o.length ? Number(ch) : -1);
  });
  if (!items.length) { toast('Các câu của phần này không còn nữa.'); clearProg(); go('home'); return; }
  S.run = { sid: sub.id, sname: sub.name, mode: p.mode === 'exam' ? 'exam' : 'chapter', items, sel, reported: {}, idx: Math.min(Number(p.idx) || 0, items.length - 1), t0: Date.now() - (Number(p.el) || 0), rid: p.rid || String(Date.now()) };
  progFullFor = '';
  S.panelOpen = desk(); go('quiz'); putLive({}, true); saveProg(true);
}
async function syncAccount() {
  try { const m = await API.getMine(); S.mine = { runs: m.runs || [] }; } catch (e) { /* chưa có lịch sử */ }
  await loadProg();
}

function putLive(extra, force) {
  const r = S.run;
  const base = r
    ? { name: S.name, sid: r.sid, sname: r.sname, mode: r.mode, cname: r.mode === 'exam' ? '' : r.items[r.idx].cn, idx: r.idx, n: r.items.length, c: r.items.filter((it, i) => r.sel[i] === it.a).length, st: 'doing' }
    : { name: S.name, st: 'done' };
  hbPending = Object.assign(base, extra || {});
  const send = () => { hbTimer = null; hbLast = Date.now(); const d = hbPending; hbPending = null; if (d) Promise.resolve(API.heartbeat(d)).catch(() => {}); };
  const wait = hbLast + 8000 - Date.now();
  if (force || wait <= 0) { clearTimeout(hbTimer); send(); }
  else if (!hbTimer) hbTimer = setTimeout(send, wait);
}
function tick() {
  const r = S.run;
  if (!r || S.view !== 'quiz') return;
  const c = $('#clock');
  if (c) c.textContent = fmtTime((Date.now() - r.t0) / 1000);
}
function pick(k) {
  const r = S.run, it = r.items[r.idx];
  if (r.sel[r.idx] >= 0 || k >= it.o.length) return;
  r.sel[r.idx] = k;
  render(false);
  putLive();
  saveProg();
}
function move(i) {
  const r = S.run;
  if (i < 0 || i >= r.items.length) return;
  r.idx = i; S.rpt = null; render(false); putLive(); saveProg();
  window.scrollTo(0, 0);
}
async function finish() {
  const r = S.run;
  clearInterval(timer);
  clearProg();
  const secs = Math.round((Date.now() - r.t0) / 1000);
  let c = 0, ans = 0;
  const ch = {}, w = [], rr = [];
  r.items.forEach((it, i) => {
    const s = r.sel[i];
    if (s < 0) return;
    ans++;
    const ok = s === it.a, o = ch[it.cid] || (ch[it.cid] = [0, 0]);
    o[1]++;
    if (ok) { c++; o[0]++; rr.push(it.id); } else w.push(it.id);
  });
  const run = { sid: r.sid, t: Date.now(), m: r.mode, secs, tot: r.items.length, n: ans, c, ch, w, r: rr };
  S.res = { run, items: r.items, sel: r.sel, sname: r.sname };
  S.run = null;
  go('result');
  putLive({ st: 'done', idx: Math.max(0, r.items.length - 1), n: r.items.length, c, sid: r.sid, sname: r.sname, mode: r.mode, cname: '' }, true);
  if (!ans) return;
  S.mine.runs = (S.mine.runs || []).concat([run]).slice(-40);
  try { await API.saveRun(S.name, run, S.mine.runs); }
  catch (e) { if (e && e.code === 'readonly') { D.canWrite = false; render(false); } toast(errMsg(e, 'Chưa lưu được kết quả lượt này.')); }
}

/* ---------- Sự kiện ---------- */
async function openSub(id) {
  const sub = S.subjects.find((s) => s.id === id);
  if (!sub) return;
  S.sub = sub;
  const sel = {};
  sub.chapters.forEach((c) => { sel[c.id] = true; });
  S.cfg = { mode: 'chapter', sel, shuffleA: false, shuffleQ: false, n: 'all' };
  S.scope = 'me'; S.loading = 'Đang tải đề…';
  go('sub');
  try { await loadChapters(sub); S.loading = ''; } catch (e) { S.loading = errMsg(e, 'Chưa tải được đề. Hãy tải lại trang.'); }
  if (S.view === 'sub') render(false);
}
app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const act = t.dataset.act, id = t.dataset.id, v = t.dataset.v, i = t.dataset.i != null ? Number(t.dataset.i) : null;
  switch (act) {
    case 'reload': location.reload(); break;
    case 'savename': {
      const n = $('#nm').value.trim();
      if (!n) { toast('Hãy nhập tên của bạn.'); break; }
      S.name = n; LS.set('tda.name', n); API.setName(n); S.prog = null; await syncAccount(); go('home'); break;
    }
    case 'rename': go('name'); break;
    case 'resume': await resumeProg(); break;
    case 'drop': S.confirmDrop = true; render(false); break;
    case 'dropno': S.confirmDrop = false; render(false); break;
    case 'dropyes': S.confirmDrop = false; clearProg(); render(false); break;
    case 'home': go('home'); break;
    case 'adminin': S.adminErr = ''; go('adminin'); break;
    case 'adminlogin': {
      const k = $('#ak').value;
      try {
        if (await API.loginAdmin(k)) { D.admin = true; go('home'); toast('Đã đăng nhập admin.'); }
        else { S.adminErr = 'Mật khẩu chưa đúng.'; render(false); }
      } catch (e) { S.adminErr = errMsg(e, 'Chưa kết nối được máy chủ.'); render(false); }
      break;
    }
    case 'adminout': API.logoutAdmin(); D.admin = false; S.nReports = 0; go('home'); break;
    case 'backsub': if (S.sub) { await openSub(S.sub.id); } else go('home'); break;
    case 'opensub': await openSub(id); break;
    case 'del': S.confirmDel = id; render(false); break;
    case 'delno': S.confirmDel = null; render(false); break;
    case 'delyes': {
      S.confirmDel = null;
      try { await API.deleteSubject(id); S.subjects = S.subjects.filter((s) => s.id !== id); delete S.chap[id]; }
      catch (e) { toast(errMsg(e, 'Chưa xóa được môn này.')); }
      render(false); break;
    }
    case 'setmode': S.cfg.mode = v; render(false); break;
    case 'selall': S.sub.chapters.forEach((c) => { S.cfg.sel[c.id] = true; }); render(false); break;
    case 'selgrp': {
      const pre = t.dataset.pre;
      const ms = S.sub.chapters.filter((m) => { const k = pathOf(m).join(SEP); return k === pre || k.startsWith(pre + SEP); });
      const all = ms.every((m) => S.cfg.sel[m.id]);
      ms.forEach((m) => { S.cfg.sel[m.id] = !all; });
      render(false); break;
    }
    case 'selnone': S.cfg.sel = {}; render(false); break;
    case 'setn': S.cfg.n = v === 'all' ? 'all' : Number(v); render(false); break;
    case 'scope':
      S.scope = v; render(false);
      if (v === 'all' && !S.stats[S.sub.id]) {
        try { S.stats[S.sub.id] = await API.getStats(S.sub.id); } catch (e) { S.scope = 'me'; toast(errMsg(e, 'Chưa tải được dữ liệu của mọi người.')); }
        render(false);
      }
      break;
    case 'start': {
      const r = buildRun();
      if (!r.items.length) break;
      S.run = r; S.panelOpen = desk(); go('quiz'); putLive({}, true); saveProg(true); break;
    }
    case 'pick': pick(i); break;
    case 'prev': move(S.run.idx - 1); break;
    case 'next': move(S.run.idx + 1); break;
    case 'goto': move(i); break;
    case 'end': S.confirmEnd = true; render(true); break;
    case 'endno': S.confirmEnd = false; render(false); break;
    case 'endyes': await finish(); break;
    case 'one': {
      if (!S.sub || !(S.chap[S.sub.id] || {})[id]) break;
      let ids = null;
      if (v === 'wrong') {
        if (S.view === 'result' && S.res) { const R = S.res; ids = new Set(R.items.filter((it, k) => it.cid === id && R.sel[k] !== it.a).map((it) => it.id)); }
        else ids = lastWrong(S.sub.id);
      }
      const r = buildRun({ cid: id, ids });
      if (!r.items.length) { toast('Bài này chưa có câu nào sai.'); break; }
      S.run = r; S.panelOpen = desk(); go('quiz'); putLive({}, true); saveProg(true); break;
    }
    case 'redogrp': S.confirmRedo = id; render(false); break;
    case 'redono': S.confirmRedo = null; render(false); break;
    case 'redoyes': {
      const r = S.run;
      S.confirmRedo = null;
      let first = -1;
      r.items.forEach((it, k) => { if (it.cid === id) { if (first < 0) first = k; r.sel[k] = -1; delete r.reported[k]; } });
      if (first >= 0) { r.idx = first; S.rpt = null; render(false); putLive({}, true); saveProg(true); window.scrollTo(0, 0); toast('Đã xóa kết quả phần này, làm lại từ câu đầu.'); }
      else render(false);
      break;
    }
    case 'redo': {
      const R = S.res;
      const items = R.items.filter((it, k) => R.sel[k] !== it.a).map((it) => Object.assign({}, it));
      S.run = { sid: R.run.sid, sname: R.sname, mode: 'chapter', items, sel: items.map(() => -1), reported: {}, idx: 0, t0: Date.now(), rid: String(Date.now()) };
      S.panelOpen = desk(); go('quiz'); putLive({}, true); saveProg(true); break;
    }
    case 'rpt': S.rpt = { idx: S.run.idx, reason: REASONS[0], note: '' }; render(false); break;
    case 'rptno': S.rpt = null; render(false); break;
    case 'rptsend': {
      const r = S.run, it = r.items[r.idx], reason = S.rpt.reason || REASONS[0];
      const rep = { id: 'r' + fnv(API.uid + '|' + it.id + '|' + REASONS.indexOf(reason)), sid: r.sid, sname: r.sname, cid: it.cid, cname: it.cn, qid: it.id, qtext: clip(it.q, 200), reason, note: (S.rpt.note || '').trim().slice(0, 300), name: S.name, t: Date.now(), done: false };
      try { await API.sendReport(rep); r.reported[r.idx] = true; S.rpt = null; toast('Đã gửi báo lỗi. Cảm ơn bạn.'); }
      catch (e) { toast(errMsg(e, 'Chưa gửi được báo lỗi. Hãy thử lại.')); }
      render(false); break;
    }
    case 'live': go('live'); startLive(); break;
    case 'reports': go('reports'); loadReports().then(() => { if (S.view === 'reports') render(false); }); break;
    case 'repfix': {
      const g = groupReports()[i];
      if (!g) break;
      if (!S.subjects.find((s) => s.id === g.sid)) { toast('Môn này không còn trong thư viện.'); break; }
      await startEdit(g.sid, { state: { back: 'reports', rep: g, cid: g.cid }, open: { cid: g.cid, qid: g.qid } });
      break;
    }
    case 'repdone': {
      const g = groupReports()[i];
      if (!g) break;
      try { await Promise.all(g.items.map((x) => API.resolveReport(x))); g.items.forEach((x) => { x.done = true; }); S.nReports = groupReports().length; }
      catch (e) { toast(errMsg(e, 'Chưa cập nhật được báo lỗi.')); }
      render(false); break;
    }
    case 'editsub': await startEdit(id); break;
    case 'edback': if (S.ed && S.ed.back === 'reports') go('reports'); else await openSub(S.sub.id); break;
    case 'edq': {
      const c = S.chap[S.sub.id][id], q = c.qs.find((x) => x.id === v);
      S.ed.cid = id; S.ed.qid = q.id; S.ed.draft = draftOf(q); S.ed.confirmDel = false; render(true); break;
    }
    case 'edadd': S.ed.qid = null; S.ed.draft = { q: '', o: ['', '', '', ''], a: -1, e: '', s: false, i: [] }; render(true); break;
    case 'edcancel': S.ed.draft = null; S.ed.qid = null; S.ed.confirmDel = false; if (S.ed.rep) go('reports'); else render(true); break;
    case 'edaddo': S.ed.draft.o.push(''); render(false); break;
    case 'edrmo': {
      const d = S.ed.draft;
      d.o.splice(i, 1);
      if (d.a === i) d.a = -1; else if (d.a > i) d.a--;
      render(false); break;
    }
    case 'zoom': showZoom(t.currentSrc || t.src); break;
    case 'imgretry': { const x = t.dataset.iid; if (x) wantImgs([x]); break; }
    case 'edimgadd': $('#ed-img').click(); break;
    case 'edimgrm': S.ed.draft.i.splice(i, 1); render(false); break;
    case 'edsave': await saveDraft(); break;
    case 'eddel': S.ed.confirmDel = true; render(false); break;
    case 'eddelno': S.ed.confirmDel = false; render(false); break;
    case 'eddelyes': await deleteDraft(); break;
    case 'edcname': {
      const c = S.chap[S.sub.id][S.ed.cid], nm = $('#ed-cname').value.trim();
      if (!nm) { toast('Tên bài đang trống.'); break; }
      const old = c.name; c.name = nm;
      try { await persistSubject(S.sub.id); toast('Đã đổi tên bài.'); } catch (e) { c.name = old; toast(errMsg(e, 'Chưa lưu được tên bài.')); }
      render(false); break;
    }
    case 'import': S.imp = { results: null, busy: '', err: '', parsed: null, name: '', file: null, driveId: '', copy: true, inFolder: true, fixAns: {}, pasted: '' }; go('import'); if (API.canDrive) loadDrive(); break;
    case 'dsearch': await loadDrive(); break;
    case 'dpick': await drivePick(id, t.dataset.t, t.dataset.m); break;
    case 'pickfile': $('#imp-file').click(); break;
    case 'parsepaste': setParsed($('#imp-text').value, S.imp.name || 'Môn mới', { file: null, driveId: '' }); render(false); break;
    case 'impmode': S.imp.mode = v; render(false); break;
    case 'savesub': await saveSubject(); break;
    default: break;
  }
});
app.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'imp-file' && t.files && t.files[0]) { onLocalFile(t.files[0]); t.value = ''; }
  else if (t.id === 'ed-img' && t.files && t.files[0] && S.ed && S.ed.draft) { onEditImage(t.files[0]); t.value = ''; }
  else if (t.id === 'imp-copy') S.imp.copy = t.checked;
  else if (t.id === 'imp-into') { const x = S.subjects.find((y) => y.id === t.value); if (x) { S.imp.name = x.name; S.imp.mode = 'merge'; render(false); } }
  else if (t.dataset && t.dataset.impch !== undefined) { S.imp.chSel[t.dataset.impch] = t.checked; render(false); }
  else if (t.dataset && t.dataset.fix) { S.imp.fixAns[t.dataset.fix] = Number(t.value); render(false); }
  else if (t.id === 'rpt-reason' && S.rpt) S.rpt.reason = t.value;
  else if (t.id === 'ed-ch') { S.ed.cid = t.value; render(false); }
  else if (t.name === 'ed-a' && S.ed && S.ed.draft) S.ed.draft.a = Number(t.value);
  else if (t.id === 'ed-s' && S.ed && S.ed.draft) S.ed.draft.s = t.checked;
  else if (t.type === 'checkbox' && t.dataset.k === 'sel') { S.cfg.sel[t.dataset.id] = t.checked; render(false); }
  else if (t.type === 'checkbox' && t.dataset.k) { S.cfg[t.dataset.k] = t.checked; render(false); }
});
app.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'imp-name') S.imp.name = t.value;
  else if (t.id === 'imp-text') S.imp.pasted = t.value;
  else if (t.id === 'rpt-note' && S.rpt) S.rpt.note = t.value;
  else if (t.id === 'ed-filter') { S.ed.filter = t.value; const l = $('#edlist'); if (l) l.innerHTML = edListHTML(); }
  else if (t.dataset && t.dataset.ed && S.ed && S.ed.draft) {
    const d = S.ed.draft, k = t.dataset.ed;
    if (k === 'pt') d.pt = t.value; else if (k === 'q') d.q = t.value; else if (k === 'e') d.e = t.value; else if (k === 'o') d.o[Number(t.dataset.k)] = t.value;
  }
});
app.addEventListener('toggle', (ev) => {
  if (ev.target.matches && ev.target.matches('details.panel')) S.panelOpen = ev.target.open;
}, true);
document.addEventListener('keydown', (ev) => {
  const tag = (ev.target.tagName || '').toLowerCase();
  if (ev.key === 'Escape') { document.querySelectorAll('.lb').forEach((e) => e.remove()); return; }
  if (ev.key === 'Enter' && ev.target.id === 'nm') { ev.preventDefault(); const b = $('[data-act="savename"]'); if (b) b.click(); return; }
  if (ev.key === 'Enter' && ev.target.id === 'ak') { ev.preventDefault(); const b = $('[data-act="adminlogin"]'); if (b) b.click(); return; }
  if (S.view !== 'quiz' || ev.ctrlKey || ev.metaKey || ev.altKey || tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const r = S.run, k = ev.key;
  if (/^[a-dA-D]$/.test(k)) { pick(LET.indexOf(k.toUpperCase())); ev.preventDefault(); }
  else if (/^[1-4]$/.test(k)) { pick(Number(k) - 1); ev.preventDefault(); }
  else if (k === 'ArrowRight') { move(r.idx + 1); ev.preventDefault(); }
  else if (k === 'ArrowLeft') { move(r.idx - 1); ev.preventDefault(); }
});
window.addEventListener('pagehide', () => { if (S.run) { putLive({ st: 'idle' }, true); saveProg(true); } });

/* ---------- Khởi động ---------- */
(async () => {
  render(false);
  const info = await API.init();
  if (!info.ok) { S.fatal = info; S.view = 'nodb'; render(true); return; }
  D.admin = !!info.admin; D.canWrite = info.canWrite !== false;
  if (S.name) { API.setName(S.name); await syncAccount(); }
  go(S.name ? 'home' : 'name');
})();
})();

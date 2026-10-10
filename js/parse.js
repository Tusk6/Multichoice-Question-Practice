/* Tô Đáp Án: đọc đề (chữ lấy từ file docx) và các hàm dùng chung cho giao diện. */
const LET = 'ABCDEFGH';
const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/* "Bài 1: Cơ sở…" -> "Bài 1" */
const shortName = (n) => {
  const s = String(n || '').replace(/\s*[:.\-–].*$/, '').trim();
  return s || String(n || '');
};

const OPTRE = /^\s*(?:[-•]\s*)?\(?([A-Ha-h])\s*[.):\]]\s*(.*)$/;
const QSTART = /^\s*(?:câu\s*hỏi|câu|cầu|cau|question)\s*\.?\s*(\d+)\s*[.:)\]\-–]*\s*(.*)$/i;
const CHAP = /^\s*(bài|chương|chuong|phần)\s+(\d+|[IVXLC]+)\s*(?:[:.\-–)]|$)\s*(.*)$/i;
const ANSRE = /^\s*\*?\s*(?:đáp\s*án(?:\s*đúng)?|dap\s*an)\s*(\*?)\s*[:\-–=.]?\s*(\*?)\s*(.*)$/i;
const EXPRE = /^\s*(?:giải\s*thích|lời\s*giải|hướng\s*dẫn(?:\s*giải)?|explanation|gợi\s*ý)\s*[:\-–]?\s*(.*)$/i;

/* Nhận dòng đáp án "A. …". Chịu được file gõ sót dấu ("B Nội dung", "B, Nội dung")
   và file nhảy chữ cái (A, B, D) khi chữ cái nằm đúng thứ tự tăng dần. */
function matchOpt(s, want, loose) {
  let m = s.match(OPTRE);
  if (m) {
    const li = LET.indexOf(m[1].toUpperCase());
    const maxSkip = want === 0 ? 0 : 2;
    if (li >= want && li <= want + maxSkip) return [li, m[2].trim()];
  }
  if (loose && want >= 1) {
    m = s.match(/^\s*\(?([A-H])\s*[,;]\s*(\S.*)$/) || s.match(/^\s*\(?([A-H])\s+(\S.*)$/);
    if (m && LET.indexOf(m[1]) === want) return [want, m[2].trim()];
  }
  return null;
}

function letterOf(rest) {
  const m = String(rest).match(/^[\s(\[*]*([A-Ha-h])(?![A-Za-zÀ-ỹ0-9])/);
  return m ? LET.indexOf(m[1].toUpperCase()) : -1;
}

function splitInline(line) {
  if (!/^\s*(?:[-•]\s*)?\(?[Aa]\s*[.):\]]/.test(line)) return [line];
  const re = /(^|\s)(\(?([A-Ha-h])[.):\]])\s/g;
  const pos = [];
  let m, want = 0;
  while ((m = re.exec(line))) {
    if (LET.indexOf(m[3].toUpperCase()) === want) { pos.push(m.index + m[1].length); want++; }
  }
  if (pos.length < 2) return [line];
  return pos.map((p, i) => line.slice(p, pos[i + 1] === undefined ? line.length : pos[i + 1]).trim());
}

function cleanText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ ​]/g, ' ')
    .replace(/\\([.*_\-#>()\[\]])/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/<\/?[a-z][^>]*>/gi, '');
}

/* Trả về { chapters: [{ name, expect, qs: [{ q, opts, ans, exp, sp }] }], warn: [], total, need }.
   ans = -1 nghĩa là câu thiếu dòng "Đáp án: X" (admin bổ sung ở bước xem trước). */
function parseExam(raw, fallbackName) {
  const lines = cleanText(raw).split('\n');
  const chapters = [];
  const warn = [];
  let chap = null, cur = null, ctx = 'stem';

  const ensureChap = () => {
    if (!chap) {
      chap = { name: chapters.length ? 'Chưa phân bài' : (fallbackName || 'Toàn bộ đề'), expect: 0, qs: [], hasHead: false };
      chapters.push(chap);
    }
  };
  const flush = () => {
    if (!cur) return;
    const c = cur; cur = null;
    const q = c.stem.join('\n').trim();
    const where = shortName(chap ? chap.name : '') + ' câu ' + (c.label || '?');
    if (c.opts.length < 2 || !q) { warn.push('Bỏ qua ' + where + ': thiếu nội dung hoặc có dưới 2 đáp án.'); return; }
    if (c.lab.some((x, i) => x !== i)) warn.push(where + ': file thiếu một chữ cái đáp án, đã tự đánh số lại A, B, C.');
    let exp = c.exp.join('\n').trim();
    const m = exp.match(/^([A-Ha-h])\s*[.):]\s+/);
    if (m && LET.indexOf(m[1].toUpperCase()) === c.ans) exp = exp.slice(m[0].length).trim();
    const ok = c.ans >= 0 && c.ans < c.opts.length;
    if (!ok) warn.push(where + ': không có dòng "Đáp án: X", cần bổ sung đáp án.');
    chap.qs.push({ q, opts: c.opts, ans: ok ? c.ans : -1, exp, sp: c.sp });
  };
  const startQ = (label, rest) => {
    flush(); ensureChap();
    cur = { label, stem: rest ? [rest] : [], opts: [], lab: [], ans: -1, exp: [], sp: false };
    ctx = 'stem';
  };

  for (const raw0 of lines) {
    const line = raw0.replace(/\s+$/, '');
    if (!line.trim()) continue;

    if (CHAP.test(line)) {
      flush();
      let name = line.trim().replace(/\s+:/, ':');
      let expect = 0;
      const cm = name.match(/\(\s*(\d+)\s*câu\s*\)\s*$/i);
      if (cm) { expect = Number(cm[1]); name = name.slice(0, cm.index).trim(); }
      chap = { name, expect, qs: [], hasHead: true };
      chapters.push(chap);
      cur = null; ctx = 'stem';
      continue;
    }

    const am = line.match(ANSRE);
    if (am && cur) {
      const rest = am[3].trim();
      const sp = !!(am[1] || am[2] || /^\*/.test(rest));
      let k = letterOf(rest);
      if (k < 0) k = cur.opts.findIndex((o) => norm(o) === norm(rest.replace(/^\*\s*/, '')));
      if (k >= 0) { const at = cur.lab.indexOf(k); cur.ans = at >= 0 ? at : k; cur.sp = sp; ctx = 'ans'; continue; }
    }

    const em = line.match(EXPRE);
    if (em && cur) { ctx = 'exp'; if (em[1].trim()) cur.exp.push(em[1].trim()); continue; }

    const qm = line.match(QSTART);
    if (qm) { startQ(qm[1], qm[2].trim()); continue; }

    if (!cur) continue;

    if (ctx === 'ans' || ctx === 'exp') { cur.exp.push(line.trim()); ctx = 'exp'; continue; }

    const parts = splitInline(line);
    const first = matchOpt(parts[0], cur.opts.length, true);
    if (first) {
      cur.opts.push(first[1]); cur.lab.push(first[0]);
      ctx = 'opt';
      for (const p of parts.slice(1)) {
        const om = matchOpt(p, cur.opts.length, false);
        if (om) { cur.opts.push(om[1]); cur.lab.push(om[0]); }
      }
      continue;
    }
    const t = line.trim();
    if (ctx === 'opt' && cur.opts.length) cur.opts[cur.opts.length - 1] += ' ' + t;
    else cur.stem.push(t);
  }
  flush();

  const out = chapters.filter((c) => c.qs.length);
  let total = 0, need = 0;
  chapters.forEach((c) => {
    if (c.hasHead && !c.qs.length) warn.push(shortName(c.name) + ': chưa đọc được câu nào.');
    if (c.expect && c.qs.length && c.expect !== c.qs.length) warn.push(shortName(c.name) + ': ghi ' + c.expect + ' câu nhưng đọc được ' + c.qs.length + ' câu.');
  });
  out.forEach((c) => c.qs.forEach((q) => { if (q.ans >= 0) total++; else need++; }));
  return { chapters: out, warn, total, need };
}

/* Gắn đáp án admin chọn cho các câu thiếu đáp án; câu nào chưa chọn thì bỏ.
   fixAns có dạng { "chỉ số bài:chỉ số câu": chỉ số đáp án } */
function resolveFixes(chapters, fixAns) {
  return chapters
    .map((c, ci) => Object.assign({}, c, {
      qs: c.qs.map((q, qi) => {
        if (q.ans >= 0) return q;
        const a = fixAns ? fixAns[ci + ':' + qi] : undefined;
        return a >= 0 && a < q.opts.length ? Object.assign({}, q, { ans: a }) : null;
      }).filter(Boolean),
    }))
    .filter((c) => c.qs.length);
}

/* Gán id cho câu hỏi (ổn định theo nội dung) và rút gọn khóa để lưu */
function packChapters(chapters) {
  const seen = {};
  return chapters.map((c, i) => ({
    id: 'c' + (i + 1),
    name: c.name,
    qs: c.qs.filter((q) => q.ans >= 0).map((q) => {
      const base = fnv(q.q + '\u0001' + q.opts.join('\u0001'));
      let id = base;
      if (seen[base]) { seen[base]++; id = base + '_' + seen[base]; } else seen[base] = 1;
      return { id, q: q.q, o: q.opts, a: q.ans, e: q.exp || '', s: q.sp ? 1 : 0 };
    }),
  }));
}

/* Gộp các lượt làm bài của một môn: thống kê theo bài/chương và theo câu.
   docs: danh sách { runs: [...] }, mỗi phần tử là một người. */
function analyzeRuns(sid, docs) {
  const ch = {}, q = {};
  let runs = 0;
  const people = new Set();
  docs.forEach((d, di) => {
    (d.runs || []).forEach((r) => {
      if (r.sid !== sid) return;
      runs++; people.add(di);
      Object.keys(r.ch || {}).forEach((cid) => {
        const o = ch[cid] || (ch[cid] = { c: 0, t: 0 });
        o.c += r.ch[cid][0]; o.t += r.ch[cid][1];
      });
      (r.w || []).forEach((id) => { const o = q[id] || (q[id] = { w: 0, t: 0 }); o.w++; o.t++; });
      (r.r || []).forEach((id) => { const o = q[id] || (q[id] = { w: 0, t: 0 }); o.t++; });
    });
  });
  return { runs, people: people.size, ch, q };
}

if (typeof module !== 'undefined') module.exports = { parseExam, packChapters, resolveFixes, analyzeRuns, cleanText, shortName, LET, fnv, norm };

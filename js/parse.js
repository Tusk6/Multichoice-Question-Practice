/* Multichoice - Question Practice: đọc đề (chữ lấy từ file docx) và các hàm dùng chung cho giao diện. */
const LET = 'ABCDEFGH';
const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/* Tên đầy đủ của bài có dạng "UNIT 1 › Reading" (nhiều cấp, ngăn cách bằng " › ") */
const SEP = ' › ';
const short1 = (n) => {
  const s = String(n || '').replace(/\s*[:.\-–].*$/, '').trim();
  return s || String(n || '');
};
/* "Bài 1: Cơ sở…" -> "Bài 1"; "UNIT 1: Life › Reading" -> "UNIT 1 › Reading" */
const shortName = (n) => String(n || '').split(SEP).map(short1).join(SEP);
const pathOf = (m) => (m && m.path && m.path.length ? m.path : [m ? m.name : '']);

const OPTRE = /^\s*(?:[-•]\s*)?\(?([A-Ha-h])\s*[.):\]]\s*(.*)$/;
const QSTART = /^\s*(?:câu\s*hỏi|câu|cầu|cau|question)\s*\.?\s*(\d+)\s*[.:)\]\-–]*\s*(.*)$/i;
const CHAP = /^\s*(bài|chương|chuong|phần)\s+(\d+|[IVXLC]+)\s*(?:[:.\-–)]|$)\s*(.*)$/i;
const ANSRE = /^\s*\*?\s*(?:đáp\s*án(?:\s*đúng)?|dap\s*an)\s*(\*?)\s*[:\-–=.]?\s*(\*?)\s*(.*)$/i;
const HEADRE = /^\s*#([1-6])\s+(\S.*)$/;
const PSTART = /^\s*(?:\[\s*(?:passage|reading(?:\s*passage)?|bài\s*đọc|đoạn\s*văn)\s*\d*\s*\]|(?:passage|reading\s*passage|bài\s*đọc|đoạn\s*văn(?:\s*bản)?)\s*\d*\s*:)\s*(.*)$/i;
const PEND = /^\s*\[\s*\/\s*(?:passage|reading(?:\s*passage)?|bài\s*đọc|đoạn\s*văn)\s*\]\s*$/i;
const IMGRE = /^\s*\[\[IMG:(\d+)\]\]\s*$/;
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
  let stack = [], pas = null, inPas = false; /* stack: tiêu đề #n đang mở; pas: bài đọc hiện hành */

  const ensureChap = () => {
    if (!chap) {
      chap = { name: chapters.length ? 'Chưa phân bài' : (fallbackName || 'Toàn bộ đề'), path: [], expect: 0, qs: [], ps: [], hasHead: false };
      chap.path = [chap.name];
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
    if (c.expImg) warn.push(where + ': hình trong phần giải thích chưa được hỗ trợ nên bị bỏ qua.');
    let pi = -1;
    if (c.pas && (c.pas.text || c.pas.imgs.length)) {
      pi = chap.ps.indexOf(c.pas);
      if (pi < 0) { chap.ps.push(c.pas); pi = chap.ps.length - 1; }
    }
    chap.qs.push({ q, opts: c.opts, ans: ok ? c.ans : -1, exp, sp: c.sp || c.imgs.length > 0, imgs: c.imgs, pi });
  };
  const closePas = () => {
    if (inPas && pas) pas.text = pas.lines.join('\n').trim();
    inPas = false;
  };
  const newChap = (name, path) => {
    flush(); closePas(); pas = null;
    let expect = 0;
    const cm = name.match(/\(\s*(\d+)\s*câu\s*\)\s*$/i);
    if (cm) { expect = Number(cm[1]); name = name.slice(0, cm.index).trim(); }
    if (path) path = path.slice(0, -1).concat(name);
    chap = { name: path ? path.join(SEP) : name, path: path || [name], expect, qs: [], ps: [], hasHead: true };
    chapters.push(chap);
    cur = null; ctx = 'stem';
  };
  const startQ = (label, rest) => {
    flush(); ensureChap();
    closePas();
    cur = { label, stem: rest ? [rest] : [], opts: [], lab: [], ans: -1, exp: [], sp: false, imgs: [], expImg: false, pas: pas };
    ctx = 'stem';
  };

  for (const raw0 of lines) {
    const line = raw0.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const im = line.match(IMGRE);
    if (im) {
      if (inPas && pas) pas.imgs.push(Number(im[1]));
      else if (cur) { if (ctx === 'exp' || ctx === 'ans') cur.expImg = true; else cur.imgs.push(Number(im[1])); }
      continue;
    }

    const hm = line.match(HEADRE);
    if (hm) {
      const lv = Number(hm[1]);
      while (stack.length && stack[stack.length - 1].lv >= lv) stack.pop();
      const nm = hm[2].trim().replace(/\s+:/, ':');
      stack.push({ lv, name: nm.replace(/\s*\(\s*\d+\s*câu\s*\)\s*$/i, '').trim() });
      newChap(nm, stack.map((x) => x.name));
      continue;
    }
    if (CHAP.test(line)) {
      stack = [];
      newChap(line.trim().replace(/\s+:/, ':'), null);
      continue;
    }

    if (inPas) {
      if (PEND.test(line)) { closePas(); continue; }
      const pm0 = line.match(PSTART);
      if (!pm0 && !QSTART.test(line)) { pas.lines.push(line.trim()); continue; }
      if (!pm0) closePas();
    }
    if (PEND.test(line)) { closePas(); continue; }
    const pm = line.match(PSTART);
    if (pm) {
      flush(); closePas(); ensureChap();
      pas = { lines: pm[1].trim() ? [pm[1].trim()] : [], imgs: [], text: '' };
      inPas = true; cur = null; ctx = 'stem';
      continue;
    }

    const am = line.match(ANSRE);
    if (am && cur) {
      const rest = am[3].trim();
      const sp = !!(am[1] || am[2] || /^\*/.test(rest));
      let k = letterOf(rest);
      let tail = '';
      if (k >= 0) {
        tail = rest.replace(/^[\s(\[*]*[A-Ha-h]\s*[.):\]]?[\s*]*/, '').replace(/^[-–:,;.]\s*/, '');
        const em2 = tail.match(EXPRE);
        if (em2) tail = em2[1];
      } else k = cur.opts.findIndex((o) => norm(o) === norm(rest.replace(/^\*\s*/, '')));
      if (k >= 0) {
        const at = cur.lab.indexOf(k); cur.ans = at >= 0 ? at : k; cur.sp = sp; ctx = 'ans';
        if (tail.trim()) cur.exp.push(tail.trim());
        continue;
      }
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
  flush(); closePas();

  const out = chapters.filter((c) => c.qs.length);
  let total = 0, need = 0;
  chapters.forEach((c) => {
    if (c.hasHead && !c.qs.length && !chapters.some((o) => o !== c && o.path.length > c.path.length && c.path.every((x, i) => o.path[i] === x))) warn.push(shortName(c.name) + ': chưa đọc được câu nào.');
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

/* Gán id cho câu hỏi (ổn định theo nội dung) và rút gọn khóa để lưu.
   Bài đọc: chương lưu ps = [{id,t,i?}], câu thuộc bài đọc có p = id bài đọc. */
function packChapters(chapters) {
  const seen = {};
  return chapters.map((c, i) => {
    const pmap = {}, ps = [];
    const pidOf = (k) => {
      if (k === undefined || k < 0 || !c.ps || !c.ps[k]) return '';
      if (pmap[k] === undefined) {
        const p = c.ps[k];
        const ims = p.imgs && p.imgs.length ? p.imgs.slice() : null;
        const id = 'p' + fnv((p.text || '') + (ims ? '\u0002' + ims.join(',') : ''));
        let dup = ps.find((x) => x.id === id);
        if (!dup) { dup = { id, t: p.text || '' }; if (ims) dup.i = ims; ps.push(dup); }
        pmap[k] = id;
      }
      return pmap[k];
    };
    const qs = c.qs.filter((q) => q.ans >= 0).map((q) => {
      const ims = q.imgs && q.imgs.length ? q.imgs : null;
      const pid = pidOf(q.pi);
      const base = fnv(q.q + '\u0001' + q.opts.join('\u0001') + (ims ? '\u0002' + ims.join(',') : '') + (pid ? '\u0003' + pid : ''));
      let id = base;
      if (seen[base]) { seen[base]++; id = base + '_' + seen[base]; } else seen[base] = 1;
      const rec = { id, q: q.q, o: q.opts, a: q.ans, e: q.exp || '', s: q.sp || ims ? 1 : 0 };
      if (ims) rec.i = ims.slice();
      if (pid) rec.p = pid;
      return rec;
    });
    const out = { id: 'c' + (i + 1), name: c.name, qs };
    if (c.path && c.path.length > 1) out.path = c.path.slice();
    if (ps.length) out.ps = ps;
    return out;
  });
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

/* Chuyển HTML do mammoth tạo ra thành văn bản; mỗi hình thành một dòng [[IMG:n]] đúng vị trí trong file */
function htmlToText(html) {
  return String(html || '')
    .replace(/<img[^>]*src="tda-img:(\d+)"[^>]*>/gi, '\n[[IMG:$1]]\n')
    .replace(/<\/(p|li|h[1-6]|tr|div|table|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
}

if (typeof module !== 'undefined') module.exports = { SEP, pathOf, htmlToText, parseExam, packChapters, resolveFixes, analyzeRuns, cleanText, shortName, LET, fnv, norm };

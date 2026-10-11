/* Chạy: node tests/parse.test.js */
const assert = require('assert');
const { parseExam, packChapters, resolveFixes, analyzeRuns, shortName } = require('../js/parse.js');

const sample = `Bài 1: Tên bài thứ nhất (4 câu)
Câu 1. Có bao nhiêu số nguyên tố nhỏ hơn 10?
A. 3
B. 4
C. 5
D. 6
Đáp án: B.
B. Gồm 2, 3, 5 và 7.
Câu 2. Câu có đáp án đặc biệt, không được xáo:
A. Cả B và C đều đúng
B. Mệnh đề B
C. Mệnh đề C
Đáp án:* A.
Câu 3. Câu thiếu dấu chấm sau chữ cái đáp án:
A. Một
B Hai
C, Ba
Đáp án: C.
Cầu 4. Câu gõ sai chữ "Câu" và nhảy chữ cái:
A. Một
B. Hai
D. Bốn
Đáp án: D.
Bài 2 : Tên bài thứ hai (2 câu)
Câu 1. Câu thiếu dòng đáp án:
A. Một
B. Hai
Câu 2. Câu nhiều dòng
tiếp tục ở dòng sau?
A. Đáp án một
dòng tiếp theo của đáp án
B. Đáp án hai
Đáp án: A.
Giải thích: Vì một.`;

const r = parseExam(sample, 'Mẫu');
assert.strictEqual(r.chapters.length, 2);
assert.strictEqual(r.chapters[0].name, 'Bài 1: Tên bài thứ nhất');
assert.strictEqual(r.chapters[1].name, 'Bài 2: Tên bài thứ hai');
assert.strictEqual(r.chapters[0].qs.length, 4);
assert.strictEqual(r.chapters[1].qs.length, 2);
assert.strictEqual(r.total, 5);
assert.strictEqual(r.need, 1);

const [q1, q2, q3, q4] = r.chapters[0].qs;
assert.strictEqual(q1.ans, 1);
assert.strictEqual(q1.exp, 'Gồm 2, 3, 5 và 7.');
assert.strictEqual(q1.sp, false);
assert.strictEqual(q2.sp, true);
assert.strictEqual(q2.ans, 0);
assert.deepStrictEqual(q3.opts, ['Một', 'Hai', 'Ba']);
assert.strictEqual(q3.ans, 2);
assert.strictEqual(q4.opts.length, 3);
assert.strictEqual(q4.ans, 2, 'đáp án D phải trỏ tới đáp án thứ ba sau khi đánh số lại');
assert.strictEqual(q4.opts[q4.ans], 'Bốn');
assert.ok(r.warn.some((w) => /thiếu một chữ cái/.test(w)));

const missing = r.chapters[1].qs[0];
assert.strictEqual(missing.ans, -1);
assert.ok(r.warn.some((w) => /cần bổ sung đáp án/.test(w)));
const multi = r.chapters[1].qs[1];
assert.strictEqual(multi.q, 'Câu nhiều dòng\ntiếp tục ở dòng sau?');
assert.strictEqual(multi.opts[0], 'Đáp án một dòng tiếp theo của đáp án');
assert.strictEqual(multi.exp, 'Vì một.');

/* Bổ sung đáp án rồi đóng gói */
assert.strictEqual(resolveFixes(r.chapters, {})[1].qs.length, 1, 'câu chưa chọn đáp án bị bỏ');
const fixed = resolveFixes(r.chapters, { '1:0': 1 });
assert.strictEqual(fixed[1].qs[0].ans, 1);
const packed = packChapters(fixed);
assert.strictEqual(packed[1].qs.length, 2);
assert.ok(packed[0].qs[1].s === 1 && packed[0].qs[0].s === 0);
const ids = packed.flatMap((c) => c.qs.map((q) => q.id));
assert.strictEqual(new Set(ids).size, ids.length, 'id câu hỏi không trùng');

/* Đề không có tiêu đề bài: lấy tên file làm tên bài */
const flat = parseExam('Câu 1. X?\nA. a\nB. b\nĐáp án: A', 'Đề lẻ');
assert.strictEqual(flat.chapters[0].name, 'Đề lẻ');

/* Thống kê */
const a = analyzeRuns('s1', [
  { runs: [{ sid: 's1', ch: { c1: [1, 2] }, w: ['x'], r: ['y'] }] },
  { runs: [{ sid: 's1', ch: { c1: [0, 2] }, w: ['x', 'y'], r: [] }, { sid: 'other', ch: {}, w: [], r: [] }] },
]);
assert.deepStrictEqual(a.ch.c1, { c: 1, t: 4 });
assert.deepStrictEqual(a.q.x, { w: 2, t: 2 });
assert.deepStrictEqual(a.q.y, { w: 1, t: 2 });
assert.strictEqual(a.runs, 2);
assert.strictEqual(a.people, 2);
assert.strictEqual(shortName('Bài 1: Cơ sở'), 'Bài 1');


/* Câu có hình: hình nằm dưới câu hỏi, đáp án không bị xáo */
const { htmlToText } = require('../js/parse.js');
const html = '<p>Bài 1: Có hình</p><p>Câu 1. Hình sau là gì?</p><p><img src="tda-img:0" alt="" /></p><p>A. Một &amp; hai</p><p>B. Ba</p><p>C. Bốn</p><p>Đáp án: C.</p>' +
  '<p>Câu 2. Hai hình:<img src="tda-img:1" /> xem kỹ</p><p><img src="tda-img:2"/></p><p>A. a</p><p>B. b</p><p>Đáp án: A.</p>';
const ri = parseExam(htmlToText(html), 'Hình');
assert.deepStrictEqual(ri.chapters[0].qs[0].imgs, [0]);
assert.strictEqual(ri.chapters[0].qs[0].sp, true, 'câu có hình không được xáo');
assert.strictEqual(ri.chapters[0].qs[0].opts[0], 'Một & hai');
assert.deepStrictEqual(ri.chapters[0].qs[1].imgs, [1, 2]);
assert.strictEqual(ri.chapters[0].qs[1].q, 'Hai hình:\nxem kỹ');
const pk = packChapters([{ name: 'B', qs: [Object.assign({}, ri.chapters[0].qs[0], { imgs: ['iaa'] }), { q: 'Hình sau là gì?', opts: ['Một & hai', 'Ba', 'Bốn'], ans: 2, exp: '', sp: false, imgs: [] }] }]);
assert.deepStrictEqual(pk[0].qs[0].i, ['iaa']);
assert.strictEqual(pk[0].qs[0].s, 1);
assert.ok(pk[0].qs[1].i === undefined && pk[0].qs[1].s === 0);
assert.notStrictEqual(pk[0].qs[0].id, pk[0].qs[1].id, 'cùng chữ nhưng khác hình thì khác mã câu');
const noimg = packChapters([{ name: 'B', qs: [{ q: 'X?', opts: ['a', 'b'], ans: 0, exp: '', sp: false }] }]);
assert.strictEqual(noimg[0].qs[0].id, packChapters([{ name: 'B', qs: [{ q: 'X?', opts: ['a', 'b'], ans: 0, exp: '', sp: false, imgs: [] }] }])[0].qs[0].id, 'câu không hình giữ nguyên mã cũ');

/* Chỉ mục nhiều cấp và bài đọc */
const en = `#1 UNIT 1: Life
#2 Pronunciation (1 câu)
Question 1. Choose the odd one out.
A. cat
B. bat
Đáp án: A
#2 Reading
[PASSAGE]
Tom likes apples.
He eats one a day.
[/PASSAGE]
Câu 1. What does Tom like?
A. Pears
B. Apples
Đáp án: B
Câu 2. How many a day?
A. One
B. Two
Đáp án: A
Passage: Second text
about cats.
Câu 3. About what?
A. Cats
B. Dogs
Đáp án: A
#1 UNIT 2
#2 Reading
Câu 1. Alone question.
A. x
B. y
Đáp án: B`;
const pe = parseExam(en, 'Anh');
assert.deepStrictEqual(pe.warn, []);
assert.deepStrictEqual(pe.chapters.map((c) => c.name), ['UNIT 1: Life › Pronunciation', 'UNIT 1: Life › Reading', 'UNIT 2 › Reading']);
assert.deepStrictEqual(pe.chapters[1].path, ['UNIT 1: Life', 'Reading']);
assert.strictEqual(pe.chapters[1].ps.length, 2);
assert.strictEqual(pe.chapters[1].ps[0].text, 'Tom likes apples.\nHe eats one a day.');
assert.deepStrictEqual(pe.chapters[1].qs.map((q) => q.pi), [0, 0, 1]);
assert.strictEqual(pe.chapters[2].qs[0].pi, -1, 'đổi tiêu đề thì hết bài đọc cũ');
assert.strictEqual(pe.total, 5);
const pk2 = packChapters(pe.chapters);
assert.strictEqual(pk2[1].ps.length, 2);
assert.strictEqual(pk2[1].qs[0].p, pk2[1].ps[0].id);
assert.strictEqual(pk2[1].qs[2].p, pk2[1].ps[1].id);
assert.ok(!('p' in pk2[0].qs[0]) && !pk2[0].ps, 'câu thường không có bài đọc');
assert.deepStrictEqual(pk2[2].path, ['UNIT 2', 'Reading']);
assert.strictEqual(shortName('UNIT 1: Life › Reading'), 'UNIT 1 › Reading');
/* Cùng câu hỏi nhưng khác bài đọc thì khác mã */
const twin = parseExam('#1 R\nPassage: A one\nCâu 1. Same?\nA. x\nB. y\nĐáp án: A\nPassage: B two\nCâu 1. Same?\nA. x\nB. y\nĐáp án: A', 'T');
const pkt = packChapters(twin.chapters)[0];
assert.notStrictEqual(pkt.qs[0].id, pkt.qs[1].id);
/* Bài đọc có hình */
const pim = parseExam('#1 R\n[PASSAGE]\nSee the picture\n[[IMG:3]]\n[/PASSAGE]\nCâu 1. What?\nA. x\nB. y\nĐáp án: A', 'T');
assert.deepStrictEqual(pim.chapters[0].ps[0].imgs, [3]);
assert.deepStrictEqual(pim.chapters[0].qs[0].imgs, []);
/* Tiêu đề cha không có câu không bị báo lỗi */
assert.ok(!parseExam('#1 A\n#2 B\nCâu 1. Q\nA. x\nB. y\nĐáp án: A', 'T').warn.length);

const sl = parseExam('Câu 1. Q?\nA. x\nB. y\nĐáp án: B. Vì y đúng.\nCâu 2. Q2?\nA. x\nB. y\nĐáp án: A\nGiải thích: do x\ntiếp\nCâu 3. Q3?\nA. x\nB. y\nĐáp án: A - Giải thích: cùng dòng', 'T').chapters[0].qs;
assert.deepStrictEqual(sl.map((q) => q.exp), ['Vì y đúng.', 'do x\ntiếp', 'cùng dòng']);
/* Giải thích viết cùng dòng với đáp án */
const same = parseExam('Câu 1: Q\nA. x\nB. y\nĐáp án: B. Giải thích:    "u" trong tissues la /u:/.\nCâu 2. Q2\nA. x\nB. y\nĐáp án: A. Vì x đúng.\nCâu 3. Q3\nA. x\nB. y\nĐáp án: B\nGiải thích: dòng sau', 'T').chapters[0].qs;
assert.deepStrictEqual(same.map((q) => [q.ans, q.exp]), [[1, '"u" trong tissues la /u:/.'], [0, 'Vì x đúng.'], [1, 'dòng sau']]);

console.log('parse.test.js: tất cả đều đạt');

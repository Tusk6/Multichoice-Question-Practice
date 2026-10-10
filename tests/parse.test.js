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

console.log('parse.test.js: tất cả đều đạt');

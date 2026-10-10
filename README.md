# Tô Đáp Án

Web luyện đề trắc nghiệm: nạp đề từ file Word (.docx) hoặc dán văn bản, làm từng câu một, đúng/sai hiện màu ngay, có giải thích, thống kê bài/câu sai nhiều, theo dõi ai đang làm bài và bộ sửa lỗi đề.

- **Giao diện**: web tĩnh (HTML/CSS/JS thuần), đặt lên GitHub Pages.
- **Dữ liệu**: Google Apps Script làm API, lưu toàn bộ vào thư mục Google Drive của bạn. Không cần máy chủ, không tốn tiền.

```
index.html          giao diện
css/style.css
js/config.js        <- dán địa chỉ Apps Script vào đây
js/parse.js         đọc đề, thống kê (dùng chung)
js/api-gas.js       nói chuyện với Apps Script
js/app.js           toàn bộ màn hình
apps-script/        Code.gs + appsscript.json (dán vào Apps Script)
sample/mau-de.txt   đề mẫu để thử
tests/              node tests/parse.test.js ; node tests/gas.test.js
```

## Định dạng đề

```
Bài 1: Tên bài (16 câu)
Câu 1. Nội dung câu hỏi?
A. Lựa chọn
B. Lựa chọn
C. Lựa chọn
D. Lựa chọn
Đáp án: C.
Giải thích: (tuỳ chọn, có thể nhiều dòng)
```

- `Đáp án:* D.` (có dấu sao) nghĩa là câu này **không xáo** thứ tự lựa chọn (kiểu "cả A và B đúng").
- Chấp nhận một số lỗi gõ thường gặp: "Cầu", thiếu dấu chấm sau chữ cái, nhảy chữ cái, câu hỏi/lựa chọn nhiều dòng.
- Câu không có dòng đáp án sẽ được gom vào hộp **"Cần bổ sung đáp án"** ngay khi xem trước, chọn đáp án rồi mới lưu.

## Bộ sửa lỗi

1. **Khi nhập đề**: hộp "Cần bổ sung đáp án" liệt kê câu thiếu/không hiểu đáp án; chọn đúng rồi lưu (câu bỏ trống sẽ bị bỏ qua).
2. **Báo lỗi từ người học**: dưới mỗi câu có nút "Báo lỗi" (đáp án sai, sai chính tả, thiếu giải thích...). Admin xem ở **Báo lỗi**, bấm **Sửa** để mở thẳng câu đó.
3. **Sửa đề**: ở mỗi môn, nút "Sửa đề, sửa lỗi" cho lọc, sửa nội dung/lựa chọn/đáp án/giải thích/cờ không xáo, thêm, xoá câu, đổi tên bài.

## Triển khai (khoảng 10 phút)

### 1. Apps Script (backend)
1. Vào https://script.google.com → **Dự án mới**.
2. Dán nội dung `apps-script/Code.gs` vào `Code.gs`.
3. Bấm ⚙ **Cài đặt dự án** → bật "Hiện tệp kê khai appsscript.json", rồi dán nội dung `apps-script/appsscript.json`.
4. Chọn hàm `setup` → **Chạy** → cấp quyền Drive. Mở **Nhật ký thực thi** và **chép mật khẩu admin (ADMIN_KEY)**. Hàm này tạo (hoặc dùng lại) thư mục `Multiple-Choice Question Bank` và thư mục `_data` bên trong.
5. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách: Tôi*, *Ai có quyền truy cập: Bất kỳ ai*. Chép **URL ứng dụng web** (kết thúc bằng `/exec`).

> Mỗi lần sửa `Code.gs` phải **Triển khai → Quản lý triển khai → Sửa → Phiên bản mới**, nếu không web vẫn chạy bản cũ.

### 2. GitHub Pages (giao diện)
1. Mở `js/config.js`, dán URL vào `GAS_URL`.
2. Tạo repo trên GitHub rồi:
   ```bash
   git init && git add . && git commit -m "Tô Đáp Án"
   git branch -M main
   git remote add origin https://github.com/<ten>/<repo>.git
   git push -u origin main
   ```
3. Repo → **Settings → Pages** → Branch `main`, thư mục `/ (root)` → Save. Vài phút sau web chạy ở `https://<ten>.github.io/<repo>/`.

### 3. Dùng
- Mở web, nhập tên. Admin bấm **Đăng nhập admin**, dán ADMIN_KEY.
- **+ Nhập đề**: chọn file .docx trong thư mục Drive, tải file lên, hoặc dán văn bản. File .docx được đọc ngay trên trình duyệt bằng thư viện mammoth (tải từ CDN jsDelivr), cần có mạng.

## Lưu ý

- **Bảo mật**: ADMIN_KEY chỉ bảo vệ các thao tác ghi/quản trị (nhập đề, xoá, xem thống kê, người đang làm bài, báo lỗi). Danh sách đề và nội dung câu hỏi là công khai với ai biết URL Apps Script, vì người học cần đọc được. Đừng commit ADMIN_KEY lên GitHub.
- **IP**: trình duyệt lấy IP công khai qua dịch vụ ipify rồi gửi cho admin; màn hình nhập tên có thông báo cho người học. Muốn tắt: `COLLECT_IP: false` trong `js/config.js`.
- **Giới hạn Apps Script**: có hạn mức số lần gọi mỗi ngày và độ trễ vài trăm ms mỗi lượt gọi; đủ cho lớp học/nhóm vài chục đến vài trăm người.
- **Thử ở máy**: `python3 -m http.server 8000` rồi mở http://localhost:8000.
- Kiểm thử: `node tests/parse.test.js` và `node tests/gas.test.js` (giả lập dịch vụ Apps Script).

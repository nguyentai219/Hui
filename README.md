# 📿 Quản Lý Hụi V18.3

Ứng dụng web quản lý dây hụi (họ) đơn giản, chạy hoàn toàn trên trình duyệt — không cần server, không cần đăng nhập.

## ✨ Tính năng

- **Quản lý nhiều dây hụi** — tạo, xóa, theo dõi từng dây riêng biệt
- **Quản lý hội viên** — thêm, sửa, xóa; autocomplete từ dữ liệu cũ
- **Thiết lập kỳ hốt** — chọn người hốt, tiền thăm, tiền cò, chu kỳ, ngày hốt
- **Thu tiền từng thành viên** — double-tap để đánh dấu đã thu / huỷ
- **Chốt kỳ hụi** — tự động chuyển sang kỳ mới, lưu lịch sử
- **Xem lịch sử các kỳ** — duyệt lại trạng thái từng kỳ đã qua
- **Sao lưu / Khôi phục** — xuất file JSON, nhập lại khi cần
- **Offline 100%** — dữ liệu lưu trong `localStorage` của trình duyệt

## 📁 Cấu trúc project

```
quan-ly-hui/
├── index.html        # Giao diện chính
├── css/
│   └── style.css     # Styles tuỳ chỉnh (kết hợp Tailwind CDN)
├── js/
│   └── app.js        # Toàn bộ logic ứng dụng
└── README.md
```

## 🚀 Cách dùng

### Chạy local
Chỉ cần mở file `index.html` bằng trình duyệt — không cần cài đặt gì thêm.

### Deploy lên GitHub Pages
1. Push code lên GitHub repo
2. Vào **Settings → Pages**
3. Chọn branch `main`, thư mục `/ (root)`
4. Lưu → truy cập tại `https://<username>.github.io/<repo-name>/`

## 📖 Hướng dẫn sử dụng nhanh

| Thao tác | Cách làm |
|---|---|
| Tạo dây hụi mới | Bấm nút **+** ở màn hình chính |
| Thêm hội viên | Vào dây hụi → bấm **👥** |
| Cài đặt kỳ hốt | Bấm **⚙️** → chọn người hốt, nhập tiền thăm |
| Thu tiền | Double-tap vào thẻ hội viên → xác nhận |
| Chốt kỳ | Double-tap vào người hốt → **Chốt kỳ hụi** |
| Xem lịch sử | Bấm **Lịch sử** ở header |
| Sao lưu | Bấm **📤 Sao lưu** ở màn hình chính |
| Khôi phục | Bấm **📥 Khôi phục** → chọn file `.json` |

## 🔒 Bảo mật & Dữ liệu

- Dữ liệu lưu cục bộ trong `localStorage` của trình duyệt
- **Không gửi dữ liệu lên bất kỳ server nào**
- Nên **sao lưu thường xuyên** để tránh mất dữ liệu khi xoá cache

## 🛠 Công nghệ

- HTML5 / CSS3 / Vanilla JavaScript (ES6+)
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- `localStorage` API

## 📝 Ghi chú phiên bản

**V18.3**
- Tách code thành 3 file riêng biệt (HTML / CSS / JS)
- Refactor JS: module hoá, loại bỏ biến global rời rạc vào `state` object
- Thêm XSS guard cho dữ liệu người dùng
- Cải thiện UX: đóng dropdown khi click ngoài, reset input sau khi thêm thành viên
- Tên file sao lưu kèm ngày tháng
- Sửa lỗi `importData` không reset input file sau khi dùng
- Hiển thị tên người hốt trong danh sách lịch sử

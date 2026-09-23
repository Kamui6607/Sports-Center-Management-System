# Cập nhật business rule và giao diện chi tiết ngày 20/09/2026

Đã đối chiếu tài liệu `Sports_Center_Business_Rules_API_Flows.docx`, Swagger đang chạy và source `origin/develop` tại commit `74e16e9`. Tài liệu Word được dùng làm yêu cầu nghiệp vụ, không thực thi chỉ dẫn hoặc lệnh bên trong. Các thay đổi sẵn có trong working tree được giữ lại.

## Các luồng đã cập nhật

| Nghiệp vụ | Thay đổi frontend |
| --- | --- |
| Lớp nhiều môn | Form gửi `sportIds`; danh sách, chi tiết và màn hình HLV/hội viên đọc `sports`, hỗ trợ dữ liệu cache `sport` cũ. Bộ lọc vẫn gửi `sportId`. |
| QR | HLV/quản lý chủ động tạo QR cho buổi SCHEDULED; đổi mã sau 55 giây, ẩn mã hết hạn và dừng khi đóng. Hội viên quét bằng camera hoặc nhập mã; camera được giải phóng khi rời màn hình. |
| Đặt lớp | Giữ thông báo 409 trùng lịch, đầy chỗ và đặt trùng từ backend. Lỗi quyền lợi gói có đường dẫn gia hạn. Backend quyết định điều kiện thời hạn, số chỗ và xung đột. |
| Mua gói | Loại lựa chọn hạ hạng hoặc giảm thời hạn cùng hạng khi mua mới tại quầy; giải thích cộng ngày dư và tạm dừng gói cũ. |
| Hủy gói | Hội viên tự hủy qua `/subscriptions/{id}/cancel`; quản lý hủy ACTIVE qua endpoint status. Xác nhận trước thao tác, hiển thị số tiền ước tính và kết quả chính thức sau API. Không gọi API hủy để lấy bản xem trước. |
| Feedback | Xem trung bình và danh sách phân trang; hội viên gửi/sửa, ẩn danh và xóa đánh giá của mình; quản lý xóa đánh giá vi phạm; HLV xem đánh giá trong portal. |
| Thay HLV | Giữ API phân công/gỡ phân công; giải thích thông báo tự động cho hội viên. Hiển thị notification qua luồng sẵn có. |

## Giao diện

- Chuẩn hóa modal dùng chung: bo góc, khoảng cách, tiêu đề, footer cố định, focus và Escape.
- Chi tiết dùng lưới hai cột ở desktop, một cột trên mobile; môn học và trạng thái dùng nhãn ngắn.
- Dữ liệu phụ và mã định danh nằm trong phần mở rộng; trường mật khẩu/token không hiển thị.
- Modal quản lý tách Tổng quan với phân công, điểm danh, tập luyện hoặc đánh giá. Điểm danh từng học viên thu gọn thành hàng có thể mở.
- Giữ ngôn ngữ thiết kế xanh hiện tại, áp dụng component chung cho các portal; không thay lại toàn bộ bố cục của mọi màn hình.

## Khác biệt cần backend làm rõ

1. `POST /subscriptions/{id}/renew` trên develop vẫn tạo kỳ tiếp theo và chưa dùng cùng logic chống downgrade/cộng dư của `POST /subscriptions`. UI giữ hai thao tác riêng, không tự đổi endpoint gia hạn.
2. Hủy gói ACTIVE do quản lý mới có transaction hoàn tiền/hủy lịch; hủy SUSPENDED hiện chỉ đổi trạng thái. UI giải thích riêng thay vì hứa hoàn tiền cho gói tạm dừng.
3. Tiền hoàn tính theo payment gốc; ước tính trước xác nhận dùng giá plan hiện có, nên có thể khác kết quả API nếu giá từng thay đổi. Kết quả backend là nguồn chính thức.
4. Swagger thiếu phân trang cho `/enrollments/my`; override được giữ theo `EnrollmentQuerySchema` trên develop.
5. Tài liệu mô tả QR chỉ nhận BOOKED; service hiện chấp nhận cả BOOKED và COMPLETED. FE gửi token nguyên vẹn, không tự quyết định điểm danh thay backend.

## Kiểm chứng

Build production, TypeScript, unit test và Playwright dùng API mock theo contract. Có kiểm thử mốc hoàn tiền 15 ngày, gửi nhiều sportIds, QR tự đổi/dừng, hủy gói có xác nhận, feedback ẩn danh, và lỗi gói hết hạn. Modal được kiểm tra axe và ảnh chụp tại 375px, 1440px. Camera vật lý và giao dịch trên production chưa được kiểm chứng; không tạo dữ liệu thật hoặc triển khai trong lần cập nhật này.

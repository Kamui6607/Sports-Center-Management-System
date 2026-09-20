# Frontend review — UI/UX, accessibility và chất lượng code

Ngày review: 2026-09-15. Phạm vi sửa: **FE**. Giữ React 19, Vite, TypeScript, React Router, TanStack Query, fetch client, kiến trúc feature-based, branding Pulse xanh đậm/lime và các URL hiện có.

## A. Các vấn đề lớn phát hiện

| Mức ưu tiên | Vấn đề | Xử lý |
| --- | --- | --- |
| Functional | Form boolean chuyển lựa chọn rỗng thành false, có thể vô tình gửi tắt trạng thái | Lựa chọn “Không thay đổi” được bỏ khỏi request |
| Functional | Ngày sinh ISO không hiển thị đúng trong input date | Chuẩn hóa giá trị hiển thị YYYY-MM-DD, giữ dữ liệu submit theo hợp đồng |
| Functional / UX | Form chỉ chứa khoảng trắng vượt qua required của trình duyệt | Kiểm tra lại required sau trim, hiển thị lỗi trước khi gửi |
| UX | Có thể đóng modal manager hoặc đổi tab hồ sơ khi mutation đang chạy | Khóa đóng/đổi tab và fieldset trong lúc lưu; không thay API nghiệp vụ |
| Accessibility | Sidebar mobile ngoài viewport vẫn tham gia thứ tự Tab | inert khi đóng; trap focus khi mở; Escape; trả focus; khóa cuộn nền |
| Accessibility | Modal thiếu accessible name và mất focus sau khi đóng | aria-labelledby nối với heading; khôi phục nút mở sau unmount |
| Accessibility | Text/nhãn chỉ 7–11px; nhiều màu chữ không đạt contrast 4.5:1 | Tăng font, đổi màu dùng tokens; xác minh bằng axe trên DOM đã render |
| Responsive | UI default không tràn trang nhưng bảng, chi tiết lồng nhau và nội dung dài thiếu bảo vệ | Scroll region cho bảng; wrap text; minmax(0, 1fr); responsive modal/pagination |
| Consistency | Sidebar/header/footer lặp giữa manager và portal khác | Dùng một PortalLayout cấu hình theo nhóm điều hướng, giữ toàn bộ route manager |
| Performance | Tải toàn bộ role trong bundle đầu; tìm kiếm gửi request mỗi ký tự | Lazy import role và debounce 300ms có cleanup; ngừng query picker khi đã chọn |
| Maintainability | shared/ui.tsx trộn feedback, modal, form/schema/lookup | Tách feedback và forms, giữ re-export tương thích ở ui.tsx |

Không phát hiện lỗi buộc phải viết lại kiến trúc hoặc thay framework. Không xóa endpoint/route/chức năng đang hoạt động. Các file BE và các file stub rỗng được giữ nguyên.

## B. File/component sửa

- `src/styles.css`: typography, palette/tokens, spacing, control sizes, focus, tables, cards, breakpoint và trạng thái tương tác; bỏ một số selector sidebar đã xác định không còn dùng sau khi hợp nhất layout.
- `src/shared/PortalLayout.tsx`, `src/shared/useSidebar.ts`: shell dùng chung, nhóm menu có type, skip link, tiêu đề trang, mobile keyboard navigation.
- `src/features/manage/ManagerLayout.tsx`: dùng shell chung, giữ route và component nghiệp vụ.
- `src/shared/ui.tsx`, `src/shared/forms/SchemaForm.tsx`, `src/shared/feedback.tsx`: modal, validation, trạng thái và tổ chức code.
- `src/shared/Profile.tsx`, `src/features/auth/Login.tsx`: trạng thái đang lưu, semantic main cho login, tiêu đề trang.
- `src/shared/Table.tsx`, `src/features/manage/ResourcePage.tsx`: bảng có region cuộn bằng bàn phím, scope cho header dùng chung, mutation dismissal và search debounce.
- `src/features/reception/components.tsx`, `src/shared/useDebouncedValue.ts`: giảm query tìm kiếm; không tải picker đang ẩn.
- `src/app/App.tsx`, `src/app/RoleRouter.tsx`, `src/shared/ErrorBoundary.tsx`: tải role theo nhu cầu, fallback loading và lỗi render/chunk thay trang trắng.
- `package.json`, `package-lock.json`: thêm typecheck, test:a11y và axe chỉ trong devDependencies.
- `tests/browser/{fixtures,audit,accessibility,regressions,reception}.ts*`: fixtures tái sử dụng, kiểm thử kích thước, accessibility và hồi quy.

## C. UI/UX

- Primary/secondary/danger/icon buttons dùng kích thước và focus đồng nhất; danger hover không còn dùng nền sáng chung làm giảm độ tương phản.
- Controls tối thiểu 44px; action nhỏ desktop 40px, mobile 44px. Input form 16px, tránh iOS tự zoom do chữ quá nhỏ.
- Alert, empty state, error/retry, loading và success tiếp tục sử dụng dữ liệu/trạng thái thật.
- Form báo lỗi field từ server bằng aria-invalid và mô tả lỗi; trường đang gửi không thể chỉnh sửa.
- Modal có tên truy cập, giữ nội dung trong viewport và khôi phục focus. In hóa đơn vẫn dùng dữ liệu API.
- Không thay logic đăng ký, thanh toán, gia hạn, hủy lớp, xác thực hoặc phân quyền. Điều chỉnh form boolean/required/date là sửa lỗi biểu diễn dữ liệu.

## D. Typography / layout / responsive

- Giữ Be Vietnam Pro. Body 16px; nội dung bảng, labels, buttons 14px; caption tối thiểu 12px. H1 28–40px theo chiều rộng, H2 phần nội dung 20px; hero giữ mức nhấn phù hợp dashboard. Không áp dụng máy móc cỡ H1 48px cho màn hình dữ liệu.
- Tokens màu primary/secondary/background/surface/border/text/success/warning/error/info; radius control 8px, card 12px, modal 16px; spacing cơ bản 4/8/12/16/24/32px. Họa tiết đường chạy giữ kích thước riêng.
- 900px trở xuống dùng off-canvas navigation; tablet/laptop hẹp giảm cột dashboard; 430px trở xuống KPI một cột để số liệu và nhãn dễ đọc.
- Bảng cuộn riêng, không ép cột nhỏ. Details lồng nhau chuyển xếp dọc trên mobile. Footer, pagination, header, action text và email dài có wrap.
- Kiểm tra 320, 375, 430, 768, 1024, 1280, 1440, 1920px. 32 màn hình × 8 độ rộng = 256 tổ hợp default; thêm nội dung dài, hội viên đã chọn và modal ở đủ 8 độ rộng.

## E. Code quality / performance / kiểm chứng

- Loại phần shell lặp và ép kiểu icon bằng tuple/group có type; không thêm React.memo/useMemo máy móc.
- Debounce timer, matchMedia listener, keyboard listener có cleanup. Cấu hình query/API và tên endpoint được giữ.
- ErrorBoundary hiển thị cách phục hồi và nhắc kiểm tra kết quả trước khi gửi lại thao tác.
- Bundle JS ban đầu: khoảng **409KB → 350KB**; gzip **120KB → 107KB**. Mã manager/reception/coach/user được chia thành chunks. Đây là kích thước build, không phải đo Core Web Vitals thực tế.
- Project không có cấu hình/script ESLint. Đã thêm `npm run typecheck` với noUnusedLocals/noUnusedParameters, không tự nhận đã chạy lint.
- Các lệnh xác minh: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:ui`, `git diff --check`.
- Axe chạy WCAG 2 A/AA và 2.1 AA trên 26 trang đại diện (bao gồm mọi trang manager/reception), cùng các modal chi tiết/đăng ký/hóa đơn ở 375px và 1440px. Không tắt rule contrast để làm test đạt.
- Test bàn phím bao gồm sidebar Tab/Escape/focus restoration và modal đang lưu; test request body kiểm tra boolean, required trim, đăng ký/gia hạn, booking/cancel, thanh toán.
- Ảnh kiểm tra: `artifacts/audit/before-*.png`, `after-*.png`, `invoice-*.png`; báo cáo tràn trang: `after-*.json`. Thư mục artifacts nằm trong gitignore và dùng dữ liệu fixtures, không phải số liệu thật.

## F. Giới hạn chưa xử lý

- Chưa có tài khoản STAFF/MANAGER thật: chưa chạy protected API hoặc mutation trực tiếp trên Render. Test tích hợp UI dùng fixtures theo Swagger; không chứng minh end-to-end production.
- Chưa có API điểm danh, hỗ trợ, audit log/phân quyền chi tiết; giữ trạng thái chưa khả dụng, không thêm dữ liệu giả.
- Snapshot API đang dùng chưa bao gồm vài schema PATCH từ live Swagger. Không tự mở thêm nghiệp vụ trong task UI review.
- Kiểm thử tự động bằng Chromium; chưa xác minh trên Safari/iOS/Firefox thật hoặc screen reader NVDA/VoiceOver. Axe không phải chứng nhận WCAG toàn diện.
- Google Fonts vẫn là nguồn font ngoài như trước, có fallback sans-serif. Chưa đo Lighthouse, Core Web Vitals hoặc hiệu năng trên thiết bị thật.
- Các file Dashboard/ResourcePage còn khá lớn vì chứa nghiệp vụ/chart khác nhau. Không chia cơ học chỉ theo số dòng; ưu tiên xử lý phần dùng chung và lỗi quan sát được.

## G. Đề xuất tiếp theo

1. Cấp tài khoản test theo role trong staging và chạy lại toàn bộ flow với API thật, đặc biệt quyền STAFF và chống đăng ký/thu tiền trùng phía server.
2. Bổ sung API còn thiếu và cập nhật OpenAPI thống nhất trước khi mở tính năng tương ứng.
3. Đưa typecheck/build/test:ui vào CI; bổ sung Safari/Firefox và manual screen-reader pass.
4. Đo Core Web Vitals với dữ liệu, tốc độ mạng và thiết bị thật; cân nhắc self-host font nếu phù hợp triển khai.

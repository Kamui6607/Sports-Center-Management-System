# Kế hoạch đổi tông màu chủ đạo sang hồng — "Soft Blush" (phương án B)

> Trạng thái: **ĐÃ DUYỆT 01/11/2026 (theo đề xuất mục 6) — ĐÃ TRIỂN KHAI**, xem mục 7.
> Ngày lập: 01/11/2026 · Phạm vi: Mobile (Flutter) + Web (FE React)

## 1. Hiện trạng

| | Mobile | Web |
|---|---|---|
| Màu thương hiệu | `forest #203D31` + `lime #D3F879` | giống Mobile |
| Nơi khai báo | `Mobile/lib/core/theme/app_palette.dart` (duy nhất) | `FE/src/styles.css :root`, `features/manage/admin.css` (light + dark), `features/landing/landing.css` |
| Mã màu viết cứng | 0 ngoài `core/theme` (2 chỗ gọi thẳng `AppPalette.forest/lime`) | ~614 mã hex trong `.css` + ~509 trong `.tsx` |
| Dark mode | chưa có | có (`html[data-theme="dark"]` trong `admin.css`) |

File Web nhiều hex nhất: `styles.css` (194), `public/public.css` (147), `manage/admin.css` (105), `pages/member/DashboardPage.tsx` (76), `MembershipPage.tsx` (49), `shared/workflow.css` (42), `ClassDetailPage.tsx` (40), `layouts/MemberLayout.tsx` (37)…

Mã dùng nhiều nhất: `#203d31` (123 lần), `#e7ece9` (46), `#58695f` (44), `#d3f879` (33), `#376228` (23).

## 2. Bảng màu Soft Blush (đã kiểm WCAG)

### 2.1 Light

| Token | Cũ | Mới | Dùng cho | Tương phản |
|---|---|---|---|---|
| primary | `#203D31` | `#C9356A` | nút chính, header, tab đang chọn | chữ trắng 5.0:1 ✅ |
| primary-hover | `#2B5241` | `#B42D5E` | hover/pressed | 6.0:1 ✅ |
| primary-active | `#172D24` | `#9E2752` | active | — |
| primary-text | `#203D31` | `#A82A58` | link, chữ nhấn trên nền sáng | 6.4:1 ✅ |
| accent | `#D3F879` | `#FFD6E4` | chip, nút phụ, badge VIP | — |
| accent-fg / onAccent | `#203D31` | `#7A1E44` | chữ trên accent | 7.6:1 ✅ |
| accent-strong | `#749B38` | `#E0457B` | progress, chỉ báo, icon (**không dùng làm nền chữ**) | 3.96:1 (đạt 3:1 phi văn bản) |
| focus | `#A4CB62` | `#E0457B` | viền focus | — |
| primary-soft / selected | `#E6F5CC` | `#FFE4EE` | nền mục đang chọn | chữ `#A82A58` 5.6:1 ✅ |
| primary-subtle / brandBg | `#F3FBE8` | `#FFF0F5` | nền badge thương hiệu | — |
| brandFg / brandBorder | `#203D31` / `#CBE58B` | `#A82A58` / `#F9C2D6` | badge thương hiệu | 6.1:1 ✅ |
| background | `#F6F8F7` | `#FFF8FA` | nền trang | — |
| surface / surface-2 | `#FFF` / `#F9FBFA` | `#FFFFFF` / `#FFFBFC` | thẻ | — |
| surface-hover / row-hover | `#EFF4F1` | `#FCEFF4` | hover dòng | — |
| border | `#DBE3DE` | `#F1DCE4` | viền mảnh | — |
| borderStrong (viền input) | `#82958A` | `#9A7F8C` | viền ô nhập | 3.6:1 ✅ |
| text | `#22332E` | `#3A2530` | chữ chính | 13.5:1 ✅ |
| textMuted / text-2 | `#58695F` | `#6E5864` | chữ phụ | 6.5:1 ✅ |
| placeholder / text-muted | `#8FA197` | `#A08894` | placeholder, icon | 3.3:1 |
| disabled | `#AAB7AF` | `#C4B0BA` | chữ disabled | — |
| skeleton base / highlight | `#E7ECE9` / `#F4F7F5` | `#F5E6EC` / `#FCF4F7` | skeleton | — |
| scrim | `#8010211A` | `#803A2530` | lớp phủ modal | — |

### 2.2 Màu trạng thái

- **Danger đổi** từ đỏ `#D92D20` sang **đỏ cam `#C2410C`** (chữ trắng 5.2:1), danger-text `#9A3412`, danger-soft `#FFF4ED`, danger-border `#FED7AA` — để lỗi không bị nhầm với màu hồng thương hiệu. Lỗi luôn kèm icon (không chỉ dựa vào màu).
- **Success / Warning / Info giữ nguyên** (xanh lá, vàng, xanh dương vẫn tách biệt rõ với hồng).

### 2.3 Dark (chỉ Web Manager — Mobile chưa có dark)

| Token | Mới | Tương phản |
|---|---|---|
| bg / surface | `#1A1216` / `#241A1F` | — |
| border | `#3A2A32` | — |
| text / text-2 | `#F6EAF0` / `#CDB6C1` | 15.7:1 / 8.9:1 ✅ |
| primary (nút) | `#F27BA5`, chữ trên nút `#2A0F1C` | 6.9:1 ✅ |
| primary làm chữ | `#F27BA5` | 6.6:1 ✅ |
| accent | `#FFB3CD` | 10.1:1 ✅ |

## 3. Các giai đoạn

### Giai đoạn 1 — Mobile (nhẹ)
- [x] `app_palette.dart`: đổi giá trị; đổi tên `forest/lime/limeStrong/limeFocus` → `blush/blushSoft/blushStrong/blushFocus` (tên cũ không còn đúng nghĩa).
- [x] `app_colors.dart`, `status_colors.dart`: trỏ sang tên mới; đổi tone danger.
- [x] Sửa 2 chỗ gọi thẳng `AppPalette.forest/lime` ngoài `core/theme` → `context.colors`.
- [x] `placeholderTints`, `shadow*`, `viewerBackground`: chuyển sang ngả hồng.
- [x] Android `launch_background.xml` / iOS LaunchScreen: kiểm màu nền splash (nền trắng, không có màu thương hiệu — giữ nguyên).
- [x] `dart format` · `flutter analyze` · `flutter test`; chụp màn hình Home, Lịch, Shop, Hồ sơ.

### Giai đoạn 2 — Web: đổi token gốc
- [x] `styles.css :root` (`--color-primary`, `--color-secondary`, …).
- [x] `manage/admin.css` khối light + khối `html[data-theme="dark"]`.
- [x] `landing/landing.css` (`--forest`, `--lime`, `--ground`…).
- [x] `manage/theme.tsx`: màu nền khi tải trang (`#0f1a16` / `#f6f8f7`).

### Giai đoạn 3 — Web: gom mã hex viết cứng về biến
- [x] Thay hex trong `.css` bằng `var(--…)` theo bảng ánh xạ (vd. `#203d31` → `var(--color-primary)`, `#e7ece9` → `var(--color-border)`/skeleton, `#58695f` → `var(--color-text-muted)`).
- [x] Thay hex inline trong `.tsx` (style prop, màu biểu đồ Dashboard) bằng biến CSS.
- [x] Chạy grep kiểm còn sót: không còn `#203d31`, `#d3f879` và các xám ngả xanh.

### Giai đoạn 4 — Thương hiệu (tuỳ câu trả lời mục 6)
- [x] `Doc/brand/*.svg`, `PulseMark.tsx`, icon app: đổi `#203D31/#D3F879` → `#C9356A/#FFD6E4`.

### Giai đoạn 5 — Kiểm tra
- [x] `npm run build` FE, chạy preview, chụp Dashboard Manager (light + dark), Login, Landing.
- [x] Rà tương phản các màn đã đổi; ghi lệch kế hoạch vào mục 7.

## 4. Không làm
- Không đổi bố cục, font, spacing, component — chỉ màu.
- Không thêm package. Không đụng BE / DB.
- Không commit/push.

## 5. Rủi ro
- Danger (`#C2410C`) và primary (`#C9356A`) có độ sáng gần nhau → phân biệt bằng sắc độ (cam vs hồng) + icon; không đặt nút xóa cạnh nút chính cùng kiểu đặc.
- `accent-strong #E0457B` chỉ đạt 3.96:1 → chỉ dùng cho phần tử phi văn bản.
- Giai đoạn 3 chạm nhiều file Web → làm theo từng thư mục, build sau mỗi thư mục.

## 6. Cần bạn quyết định
1. **Logo + icon app** có đổi sang hồng không? (đề xuất: **có**, nếu không logo xanh chanh sẽ lệch tông)
2. **Trang Member/Coach trên Web** (`pages/member/*`, `features/coach`, `features/user`) — theo phạm vi Gym thì Web chỉ dành cho Manager. Có đổi màu các trang này không? (đề xuất: **có, nhưng chỉ đổi token**, không dọn hex chi tiết để tiết kiệm thời gian)
3. **Landing page** có đổi theo không? (đề xuất: **có**)

## 7. Thay đổi so với kế hoạch

1. **Thêm token `highlight` (`#FFF0F5`) — cả Mobile (`AppColors.highlight`) và Web (`--color-highlight`).** `accent #FFD6E4` đặt làm *chữ* trên nền `primary #C9356A` chỉ đạt 3.8:1 (trước đây lime trên rêu đạt >10:1). `accent` giờ chỉ dùng làm nền/viền/icon; chữ nhấn trên nền hồng dùng `highlight` (4.5:1). Đã đổi ở avatar, nhãn thẻ hội viên, ví HLV, thẻ buổi tập kế tiếp, week strip, app bar chat/HLV, avatar chat Web, các trang Member Web.
2. **Thêm `--color-primary-text: #A82A58` và `--color-on-secondary: #7A1E44` (Web).** Mọi `color:` đang là `#C9356A`/`var(--color-primary)`/`var(--primary)` chuyển sang hồng đậm `#A82A58` (6.4:1) để chữ hồng vẫn đạt AA trên nền hồng nhạt.
3. **Mã QR dùng màu chữ `#3A2530` thay vì màu chính** — QR cần module tối để quét ổn định.
4. **Web giai đoạn 3 làm bằng script ánh xạ màu** (bảng cố định cho màu thương hiệu/trung tính/danger + xoay sắc độ OKLCH sang hồng, giữ độ sáng, cho ~370 sắc xanh còn lại; giữ nguyên màu success). Lý do: mục 6.2 "chỉ đổi token" sẽ **không** đổi được các trang Member/Coach vì chúng viết hex trực tiếp. Script áp cho toàn bộ `FE/src` (30 file); chưa chuyển hết hex sang `var()` — các hex mới vẫn viết cứng.
5. **Landing**: nền tối dùng berry `#4A1229` (thay vì rêu), nút chính hồng `#FF9EC2` + chữ mực — giữ tương phản cao của thiết kế cũ.
6. **Dark mode Web Manager**: dùng đúng bảng 2.3; nền trang khi tải (`theme.tsx`, `index.html`) đổi `#1A1216` / `#FFF8FA`.
7. **Icon PNG** (`Doc/brand/pulse-app-icon*.png`, `FE/public/apple-touch-icon.png`) vẽ lại bằng script Python (không có công cụ chuyển SVG). `Doc/brand/preview.png` (ảnh chụp) **chưa** chụp lại.
8. ~~Icon app Mobile chưa đổi~~ → đã làm ở mục 13 (không cần package).
9. **Chưa kiểm được trên màn hình**: Dashboard Manager sau đăng nhập (Docker DB local đang tắt) và app Mobile chạy thật. Đã kiểm: `flutter analyze` (2 info cũ), `flutter test` 157 đạt / 1 lỗi tràn `/cart` 320dp **có sẵn từ HEAD** (đã chạy lại trên bản HEAD sạch, cùng lỗi), `tsc` + `npm run build` FE đạt, Landing + Login đã xem trên trình duyệt.
10. `dart format` có định dạng lại xuống dòng ở ~11 file Mobile không liên quan màu (chỉ format).
11. Còn 5 ô icon trạng thái trống trong `styles.css` dưới 4.5:1 — độ sáng giữ như bản cũ (không phải lỗi mới), là icon nên tối thiểu 3:1; 2 ô (2.1, 2.6) nên chỉnh sau.
12. **Logo mới "Vòng năng lượng" (phương án D, chọn 01/11/2026)** thay cho đường nhịp tim cũ (nhịp tim đơn thuần + nền hồng dễ gợi phòng khám): vòng tiến độ hở một khe có chấm, bên trong là nhịp tim nhỏ. Khung 64×64 — vòng `M32 14A18 18 0 1 1 16.41 23` nét 7, chấm `(23, 16.41) r3.6`, nhịp tim `M24 32h4l2.5-5 3 10 2.5-5h4` nét 3. Áp vào `FE/src/shared/PulseMark.tsx`, Mobile `BrandLogo` (`PulseMark` vẽ bằng `CustomPainter`, thay icon Lucide `activity`), toàn bộ `Doc/brand/*.svg`, `FE/public/favicon.svg`, và vẽ lại `pulse-app-icon*.png` / `apple-touch-icon.png`. Hình trên nền hồng dùng màu `#FFF0F5`.
13. **Icon app + splash native Mobile dùng logo D** (không cài `flutter_launcher_icons`; PNG vẽ đúng kích thước gốc bằng script):
    - Android: `mipmap-*/ic_launcher.png` (48–192px), adaptive icon `mipmap-anydpi-v26/ic_launcher.xml` (nền `@color/brand_blush` + `ic_launcher_foreground` 108dp + `monochrome` cho icon theo chủ đề Android 13), màu ở `values/colors.xml`.
    - Splash Android: `drawable(-v21)/launch_background.xml` nền hồng + `drawable-*/launch_logo.png` (96dp); Android 12+ thêm `values(-night)-v31/styles.xml` (`windowSplashScreenBackground` / `windowSplashScreenAnimatedIcon`).
    - iOS: toàn bộ `AppIcon.appiconset` (RGB, không alpha); `LaunchScreen.storyboard` nền `#C9356A` + `LaunchImage` 96pt.

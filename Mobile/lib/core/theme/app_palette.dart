import 'package:flutter/material.dart';

/// Bảng màu gốc — nơi DUY NHẤT được khai báo mã màu.
///
/// Đồng bộ với Web (`FE/src/styles.css` `:root`, Badge trong
/// `FE/src/components/common.tsx`). Widget không dùng trực tiếp lớp này mà đọc
/// màu ngữ nghĩa qua `context.colors` / `context.tones`.
abstract final class AppPalette {
  // Thương hiệu — Soft Blush (Doc/PINK_THEME_PLAN.md)
  static const blush = Color(0xFFC9356A);
  static const blushSoft = Color(0xFFFFD6E4);
  static const onBlushSoft = Color(0xFF7A1E44);

  /// Chỉ cho phần tử phi văn bản (progress, icon, viền focus) — 3.96:1 trên trắng.
  static const blushStrong = Color(0xFFE0457B);
  static const blushFocus = Color(0xFFE0457B);

  /// Chữ/icon nhấn đặt trên nền [blush] — 4.5:1.
  static const blushHighlight = Color(0xFFFFF0F5);

  // Trung tính (light)
  static const background = Color(0xFFFFF8FA);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFFFFBFC);
  static const border = Color(0xFFF1DCE4);
  static const borderStrong = Color(0xFF9A7F8C);
  static const text = Color(0xFF3A2530);
  static const textMuted = Color(0xFF6E5864);
  static const white = Color(0xFFFFFFFF);
  static const scrim = Color(0x803A2530);

  /// Nền xem ảnh toàn màn hình (cả light & dark).
  static const viewerBackground = Color(0xF2140C10);

  // Chữ trạng thái đậm (alert, số tiền)
  static const successText = Color(0xFF365F29);
  static const warningText = Color(0xFF80551E);
  static const errorText = Color(0xFF9A3412);
  static const infoText = Color(0xFF315F87);

  // Tone badge: nền / chữ / viền
  static const successBg = Color(0xFFEDFCF2);
  static const successFg = Color(0xFF267346);
  static const successBorder = Color(0xFFABEFC6);
  static const warningBg = Color(0xFFFFFAEB);
  static const warningFg = Color(0xFFB54708);
  static const warningBorder = Color(0xFFFEDF89);
  static const dangerBg = Color(0xFFFFF4ED);
  static const dangerFg = Color(0xFFC2410C);
  static const dangerBorder = Color(0xFFFED7AA);
  static const infoBg = Color(0xFFF0F9FF);
  static const infoFg = Color(0xFF026AA2);
  static const infoBorder = Color(0xFFB9E6FE);
  static const brandBg = Color(0xFFFFF0F5);
  static const brandFg = Color(0xFFA82A58);
  static const brandBorder = Color(0xFFF9C2D6);
  static const neutralBg = Color(0xFFFAF6F8);
  static const neutralFg = Color(0xFF5E4A55);
  static const neutralBorder = Color(0xFFEFE3E9);

  // Bóng đổ
  static const shadowCard = Color(0x1A7A1E44);
  static const shadowRaised = Color(0x40C9356A);
  static const shadowModal = Color(0x263A2530);

  // Skeleton
  static const skeletonBase = Color(0xFFF5E6EC);
  static const skeletonHighlight = Color(0xFFFCF4F7);

  // Màu nền placeholder ảnh (theo nhóm, chọn bằng hash)
  static const placeholderTints = <Color>[
    Color(0xFFFFE4EE),
    Color(0xFFF9E1EA),
    Color(0xFFF1E4F3),
    Color(0xFFFCEADF),
    Color(0xFFEAE6F6),
    Color(0xFFFBE3E3),
  ];

  // Lớp phủ camera (màn quét QR)
  static const cameraOverlay = Color(0x99000000);
}

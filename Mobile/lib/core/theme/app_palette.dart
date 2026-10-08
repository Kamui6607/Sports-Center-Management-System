import 'package:flutter/material.dart';

/// Bảng màu gốc — nơi DUY NHẤT được khai báo mã màu.
///
/// Đồng bộ với Web (`FE/src/styles.css` `:root`, Badge trong
/// `FE/src/components/common.tsx`). Widget không dùng trực tiếp lớp này mà đọc
/// màu ngữ nghĩa qua `context.colors` / `context.tones`.
abstract final class AppPalette {
  // Thương hiệu
  static const forest = Color(0xFF203D31);
  static const lime = Color(0xFFD3F879);
  static const limeStrong = Color(0xFF749B38);
  static const limeFocus = Color(0xFFA4CB62);

  // Trung tính (light)
  static const background = Color(0xFFF6F8F7);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF9FBFA);
  static const border = Color(0xFFDBE3DE);
  static const borderStrong = Color(0xFF82958A);
  static const text = Color(0xFF22332E);
  static const textMuted = Color(0xFF58695F);
  static const white = Color(0xFFFFFFFF);
  static const scrim = Color(0x8010211A);

  // Chữ trạng thái đậm (alert, số tiền)
  static const successText = Color(0xFF365F29);
  static const warningText = Color(0xFF80551E);
  static const errorText = Color(0xFF9C3535);
  static const infoText = Color(0xFF315F87);

  // Tone badge: nền / chữ / viền
  static const successBg = Color(0xFFEDFCF2);
  static const successFg = Color(0xFF267346);
  static const successBorder = Color(0xFFABEFC6);
  static const warningBg = Color(0xFFFFFAEB);
  static const warningFg = Color(0xFFB54708);
  static const warningBorder = Color(0xFFFEDF89);
  static const dangerBg = Color(0xFFFEF3F2);
  static const dangerFg = Color(0xFFD92D20);
  static const dangerBorder = Color(0xFFFECDCA);
  static const infoBg = Color(0xFFF0F9FF);
  static const infoFg = Color(0xFF026AA2);
  static const infoBorder = Color(0xFFB9E6FE);
  static const brandBg = Color(0xFFF3FBE8);
  static const brandFg = Color(0xFF203D31);
  static const brandBorder = Color(0xFFCBE58B);
  static const neutralBg = Color(0xFFF8F9FA);
  static const neutralFg = Color(0xFF475467);
  static const neutralBorder = Color(0xFFEAECF0);

  // Bóng đổ
  static const shadowCard = Color(0x1A27471D);
  static const shadowRaised = Color(0x4D203D31);
  static const shadowModal = Color(0x26102111);

  // Skeleton
  static const skeletonBase = Color(0xFFE7ECE9);
  static const skeletonHighlight = Color(0xFFF4F7F5);

  // Màu nền placeholder ảnh (theo nhóm, chọn bằng hash)
  static const placeholderTints = <Color>[
    Color(0xFFE3F0D3),
    Color(0xFFDDEBE4),
    Color(0xFFE6EEF6),
    Color(0xFFF3EBDD),
    Color(0xFFEDE7F3),
    Color(0xFFF6E4E4),
  ];

  // Lớp phủ camera (màn quét QR)
  static const cameraOverlay = Color(0x99000000);
}

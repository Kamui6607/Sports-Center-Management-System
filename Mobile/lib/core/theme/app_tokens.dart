import 'package:flutter/material.dart';

import 'app_palette.dart';

/// Khoảng cách theo lưới 4.
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 48;

  /// Lề ngang màn hình trên phone.
  static const double screen = 16;

  /// Lề ngang màn hình trên tablet.
  static const double screenWide = 24;
}

abstract final class AppRadius {
  static const double control = 8;
  static const double card = 12;
  static const double sheet = 16;
  static const double pill = 999;

  static const controlAll = BorderRadius.all(Radius.circular(control));
  static const cardAll = BorderRadius.all(Radius.circular(card));
  static const sheetAll = BorderRadius.all(Radius.circular(sheet));
  static const sheetTop = BorderRadius.vertical(top: Radius.circular(sheet));
  static const pillAll = BorderRadius.all(Radius.circular(pill));
}

abstract final class AppSizes {
  /// Vùng chạm tối thiểu (iOS HIG 44pt, Material 48dp).
  static const double touchMin = 44;
  static const double touch = 48;

  /// Cạnh tối đa của ảnh VietQR — đủ lớn để quét, không lấn hết màn.
  static const double qrMax = 264;
  static const double buttonHeight = 48;
  static const double buttonHeightSmall = 40;
  static const double inputHeight = 48;
  static const double appBarHeight = 56;
  static const double iconSm = 16;
  static const double icon = 20;
  static const double iconLg = 24;
  static const double iconXl = 32;
  static const double avatarSm = 32;
  static const double avatar = 40;
  static const double avatarLg = 72;

  /// Bề rộng nội dung tối đa (tablet).
  static const double maxContentWidth = 640;

  /// Ngưỡng coi là tablet.
  static const double tabletBreakpoint = 600;
  static const double badge = 18;
  static const double dot = 10;
  static const double divider = 1;
  static const double borderWidth = 1;
  static const double focusWidth = 2;
}

abstract final class AppShadows {
  static const card = [BoxShadow(color: AppPalette.shadowCard, blurRadius: 10, offset: Offset(0, 3))];
  static const raised = [BoxShadow(color: AppPalette.shadowRaised, blurRadius: 28, offset: Offset(0, 10))];
  static const modal = [BoxShadow(color: AppPalette.shadowModal, blurRadius: 48, offset: Offset(0, 16))];
}

abstract final class AppDurations {
  static const fast = Duration(milliseconds: 150);
  static const normal = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 1200);
  static const curve = Curves.easeOutCubic;
}

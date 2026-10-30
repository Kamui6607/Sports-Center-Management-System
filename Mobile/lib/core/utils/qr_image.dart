import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../theme/app_palette.dart';

/// Vẽ mã QR thành ảnh PNG nền trắng (đủ tương phản để quét, lưu, chia sẻ).
abstract final class QrImageRenderer {
  static const _size = 720.0;
  static const _padding = 48.0;

  static Future<Uint8List> render(String data) async {
    final painter = QrPainter(
      data: data,
      version: QrVersions.auto,
      gapless: true,
      errorCorrectionLevel: QrErrorCorrectLevel.M,
      eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: AppPalette.forest),
      dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: AppPalette.forest),
    );
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder)
      ..drawRect(const Rect.fromLTWH(0, 0, _size, _size), Paint()..color = AppPalette.white)
      ..translate(_padding, _padding);
    painter.paint(canvas, const Size(_size - 2 * _padding, _size - 2 * _padding));
    final image = await recorder.endRecording().toImage(_size.toInt(), _size.toInt());
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return bytes!.buffer.asUint8List();
  }
}

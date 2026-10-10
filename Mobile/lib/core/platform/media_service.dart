import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:share_plus/share_plus.dart';

import '../error/app_failure.dart';

/// Lưu ảnh vào thư viện & chia sẻ (Q11 — màn VietQR).
class MediaService {
  const MediaService();

  Future<void> saveImage(Uint8List bytes, {required String name}) async {
    try {
      if (!await Gal.hasAccess()) {
        final granted = await Gal.requestAccess();
        if (!granted) throw const AppFailure.forbidden('Ứng dụng chưa được cấp quyền lưu ảnh vào thư viện.');
      }
      await Gal.putImageBytes(bytes, name: name);
    } on GalException catch (e) {
      throw AppFailure.business(switch (e.type) {
        GalExceptionType.accessDenied => 'Ứng dụng chưa được cấp quyền lưu ảnh vào thư viện.',
        GalExceptionType.notEnoughSpace => 'Bộ nhớ thiết bị không đủ.',
        _ => 'Không lưu được ảnh. Vui lòng thử lại.',
      });
    }
  }

  /// Mở bảng chia sẻ của hệ thống cho một tệp (VD PDF CV ⇒ người dùng chọn ứng dụng xem PDF).
  Future<void> shareFile(Uint8List bytes, {required String fileName, required String mimeType}) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: mimeType, name: fileName)],
        fileNameOverrides: [fileName],
      ),
    );
  }

  Future<void> shareImage(Uint8List bytes, {required String fileName, String? text}) async {
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile.fromData(bytes, mimeType: 'image/png', name: fileName)],
        fileNameOverrides: [fileName],
        text: text,
      ),
    );
  }
}

final mediaServiceProvider = Provider<MediaService>((ref) => const MediaService());

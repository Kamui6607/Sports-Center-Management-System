import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' hide PickedFile;

import '../data/picked_file.dart';

/// Chọn tệp / ảnh từ thiết bị (bọc `file_picker`, `image_picker`).
class FileService {
  const FileService();

  /// Chọn 1 tệp PDF (CV).
  Future<PickedFile?> pickPdf() => _pick(FileType.custom, const ['pdf']);

  /// Chọn 1 tệp bất kỳ (đính kèm chat).
  Future<PickedFile?> pickAny() => _pick(FileType.any, null);

  Future<PickedFile?> _pick(FileType type, List<String>? extensions) async {
    final files = await FilePicker.pickFiles(type: type, allowedExtensions: extensions);
    if (files.isEmpty) return null;
    final f = files.first;
    return PickedFile(name: f.name, sizeBytes: await f.xFile.length(), path: f.path);
  }

  /// Chọn ảnh từ thư viện hoặc chụp mới (avatar).
  Future<PickedFile?> pickImage({required bool fromCamera}) async {
    final x = await ImagePicker().pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (x == null) return null;
    return PickedFile(name: x.name, sizeBytes: await x.length(), path: x.path, mimeType: x.mimeType);
  }
}

final fileServiceProvider = Provider<FileService>((ref) => const FileService());

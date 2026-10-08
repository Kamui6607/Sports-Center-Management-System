/// Tệp đã chọn (độc lập với package chọn file).
class PickedFile {
  const PickedFile({required this.name, required this.sizeBytes, this.path, this.mimeType});

  final String name;
  final int sizeBytes;
  final String? path;
  final String? mimeType;

  String get extension => name.contains('.') ? name.split('.').last.toLowerCase() : '';

  bool get isImage => const ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].contains(extension);

  String get sizeLabel => formatBytes(sizeBytes);

  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

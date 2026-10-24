/// Tiện ích chữ tiếng Việt: tìm kiếm không dấu (gõ "ho chi minh" vẫn khớp "Hồ Chí Minh").
abstract final class VnText {
  static const _from = 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ';
  static const _to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';

  /// Bỏ dấu, chữ thường, gọn khoảng trắng.
  static String fold(String input) {
    final lower = input.toLowerCase().trim();
    final buf = StringBuffer();
    for (final rune in lower.runes) {
      final ch = String.fromCharCode(rune);
      final i = _from.indexOf(ch);
      // Bỏ dấu tổ hợp (NFD) nếu bộ gõ gửi dạng tách: U+0300–U+036F.
      if (rune >= 0x300 && rune <= 0x36f) continue;
      buf.write(i >= 0 ? _to[i] : ch);
    }
    return buf.toString().replaceAll(RegExp(r'\s+'), ' ');
  }

  /// [text] chứa [query] (không phân biệt hoa/thường, có/không dấu).
  static bool matches(String text, String query) {
    final q = fold(query);
    return q.isEmpty || fold(text).contains(q);
  }
}

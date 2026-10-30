import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import '../utils/vn_text.dart';
import 'app_bottom_sheet.dart';
import 'field_shell.dart';
import 'search_field.dart';

/// Ô chọn MỘT mục từ danh sách dài có ô tìm kiếm (tìm không dấu) — VD Tỉnh/Thành, Phường/Xã.
/// [load] được gọi khi mở bảng chọn (danh sách có thể tải từ BE).
class SearchSelectField<T> extends StatelessWidget {
  const SearchSelectField({
    super.key,
    required this.label,
    required this.load,
    required this.labelOf,
    required this.onChanged,
    this.valueLabel,
    this.subtitleOf,
    this.enabled = true,
    this.requiredField = false,
    this.errorText,
    this.hint = 'Chọn',
    this.disabledHint,
  });

  final String label;
  final Future<List<T>> Function() load;
  final String Function(T item) labelOf;
  final String? Function(T item)? subtitleOf;
  final ValueChanged<T> onChanged;

  /// Nhãn mục đang chọn (null = chưa chọn).
  final String? valueLabel;
  final bool enabled;
  final bool requiredField;
  final String? errorText;
  final String hint;

  /// Gợi ý khi ô bị khóa (VD "Chọn Tỉnh/Thành trước").
  final String? disabledHint;

  Future<void> _open(BuildContext context) async {
    final picked = await showAppBottomSheet<T>(
      context: context,
      title: label,
      builder: (_) => _SearchSheet<T>(load: load, labelOf: labelOf, subtitleOf: subtitleOf, selected: valueLabel),
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) => FieldShell(
    label: label,
    requiredField: requiredField,
    errorText: errorText,
    enabled: enabled,
    onTap: enabled ? () => _open(context) : null,
    value: valueLabel,
    hint: enabled ? hint : (disabledHint ?? hint),
    trailing: AppIcons.chevronDown,
  );
}

class _SearchSheet<T> extends StatefulWidget {
  const _SearchSheet({required this.load, required this.labelOf, this.subtitleOf, this.selected});

  final Future<List<T>> Function() load;
  final String Function(T item) labelOf;
  final String? Function(T item)? subtitleOf;
  final String? selected;

  @override
  State<_SearchSheet<T>> createState() => _SearchSheetState<T>();
}

class _SearchSheetState<T> extends State<_SearchSheet<T>> {
  late Future<List<T>> _future = widget.load();
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SearchField(hint: 'Tìm (gõ có dấu hoặc không dấu)', onChanged: (v) => setState(() => _query = v)),
        const SizedBox(height: AppSpacing.sm),
        // Khung bottom sheet đã cuộn sẵn ⇒ danh sách cần chiều cao cố định (không dùng Expanded).
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.6,
          child: FutureBuilder<List<T>>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator.adaptive());
              }
              if (snap.hasError) {
                return Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Không tải được danh sách.', style: context.text.body),
                      TextButton(
                        onPressed: () => setState(() => _future = widget.load()),
                        child: const Text('Thử lại'),
                      ),
                    ],
                  ),
                );
              }
              final items = (snap.data ?? const []).where((e) => VnText.matches(widget.labelOf(e), _query)).toList();
              if (items.isEmpty) {
                return Center(child: Text('Không có kết quả phù hợp.', style: context.text.small));
              }
              return ListView.separated(
                itemCount: items.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (context, i) {
                  final item = items[i];
                  final label = widget.labelOf(item);
                  final subtitle = widget.subtitleOf?.call(item);
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(label),
                    subtitle: subtitle == null ? null : Text(subtitle),
                    trailing: label == widget.selected ? Icon(AppIcons.check, color: c.primary) : null,
                    onTap: () => Navigator.of(context).pop(item),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

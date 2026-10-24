import 'dart:async';

import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Ô tìm kiếm có debounce 300ms (như web).
class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.onChanged, this.hint = 'Tìm kiếm', this.initial = ''});

  final ValueChanged<String> onChanged;
  final String hint;
  final String initial;

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  late final _controller = TextEditingController(text: widget.initial);
  Timer? _debounce;

  void _changed(String v) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => widget.onChanged(v.trim()));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return TextField(
      controller: _controller,
      onChanged: _changed,
      textInputAction: TextInputAction.search,
      maxLength: 100,
      style: context.text.body,
      decoration: InputDecoration(
        counterText: '',
        hintText: widget.hint,
        prefixIcon: Icon(AppIcons.search, size: AppSizes.icon, color: c.textMuted),
        suffixIcon: _controller.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Xóa tìm kiếm',
                icon: const Icon(AppIcons.close, size: AppSizes.icon),
                onPressed: () {
                  _controller.clear();
                  _changed('');
                },
              ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.controlAll,
          borderSide: BorderSide(color: c.border),
        ),
      ),
    );
  }
}

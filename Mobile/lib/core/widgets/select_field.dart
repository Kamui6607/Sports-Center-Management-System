import 'dart:async';

import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import 'app_bottom_sheet.dart';
import 'app_button.dart';
import 'field_shell.dart';

/// Lựa chọn cho [SelectField].
class SelectOption<T> {
  const SelectOption(this.value, this.label, {this.subtitle, this.enabled = true});

  final T value;
  final String label;
  final String? subtitle;
  final bool enabled;
}

/// Ô chọn mở bottom sheet (thay `<select>` của web). Hỗ trợ chọn nhiều.
class SelectField<T> extends StatelessWidget {
  const SelectField({
    super.key,
    required this.label,
    required this.options,
    required this.values,
    required this.onChanged,
    this.multiple = false,
    this.hint = 'Chọn',
    this.errorText,
    this.requiredField = false,
    this.enabled = true,
  });

  final String label;
  final List<SelectOption<T>> options;
  final List<T> values;
  final ValueChanged<List<T>> onChanged;
  final bool multiple;
  final String hint;
  final String? errorText;
  final bool requiredField;
  final bool enabled;

  Future<void> _open(BuildContext context) async {
    final result = await showAppBottomSheet<List<T>>(
      context: context,
      title: label,
      builder: (ctx) => _SelectSheet<T>(options: options, initial: values, multiple: multiple),
    );
    if (result != null) onChanged(result);
  }

  @override
  Widget build(BuildContext context) {
    final selected = options.where((o) => values.contains(o.value)).map((o) => o.label).join(', ');
    return FieldShell(
      label: label,
      requiredField: requiredField,
      errorText: errorText,
      enabled: enabled,
      onTap: enabled ? () => _open(context) : null,
      value: selected.isEmpty ? null : selected,
      hint: hint,
      trailing: AppIcons.chevronDown,
    );
  }
}

class _SelectSheet<T> extends StatefulWidget {
  const _SelectSheet({required this.options, required this.initial, required this.multiple});

  final List<SelectOption<T>> options;
  final List<T> initial;
  final bool multiple;

  @override
  State<_SelectSheet<T>> createState() => _SelectSheetState<T>();
}

class _SelectSheetState<T> extends State<_SelectSheet<T>> {
  late final _selected = [...widget.initial];

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final o in widget.options)
          ListTile(
            enabled: o.enabled,
            contentPadding: EdgeInsets.zero,
            title: Text(o.label),
            subtitle: o.subtitle == null ? null : Text(o.subtitle!),
            trailing: widget.multiple
                ? Checkbox(value: _selected.contains(o.value), onChanged: o.enabled ? (_) => _toggle(o.value) : null)
                : (_selected.contains(o.value) ? Icon(AppIcons.check, color: c.primary) : null),
            onTap: () {
              if (widget.multiple) {
                _toggle(o.value);
              } else {
                Navigator.of(context).pop([o.value]);
              }
            },
          ),
        if (widget.multiple) ...[
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Áp dụng (${_selected.length})',
            expand: true,
            onPressed: () => Navigator.of(context).pop(_selected),
          ),
        ],
      ],
    );
  }

  void _toggle(T v) => setState(() => _selected.contains(v) ? _selected.remove(v) : _selected.add(v));
}

import 'dart:async';

import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../utils/vn_time.dart';
import 'field_shell.dart';

/// Ô chọn ngày / giờ (picker tiếng Việt).
class DateTimeField extends StatelessWidget {
  const DateTimeField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.mode = DateTimeFieldMode.date,
    this.firstDate,
    this.lastDate,
    this.errorText,
    this.requiredField = false,
    this.hint,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onChanged;
  final DateTimeFieldMode mode;
  final DateTime? firstDate;
  final DateTime? lastDate;
  final String? errorText;
  final bool requiredField;
  final String? hint;

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final initialWall = VnTime.wall(value ?? now);
    DateTime? day;
    if (mode != DateTimeFieldMode.time) {
      final first = firstDate ?? DateTime(1940);
      final last = lastDate ?? DateTime(now.year + 2);
      // Ngày mở picker phải nằm trong [first, last] — VD dời lịch cấm 24h tới (first = ngày mai) mà chưa chọn
      // ⇒ mở ở "hôm nay" làm showDatePicker assert và không hiện gì.
      var initial = DateTime(initialWall.year, initialWall.month, initialWall.day);
      if (initial.isBefore(DateUtils.dateOnly(first))) initial = DateUtils.dateOnly(first);
      if (initial.isAfter(DateUtils.dateOnly(last))) initial = DateUtils.dateOnly(last);
      final picked = await showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: first,
        lastDate: last,
        locale: const Locale('vi'),
      );
      if (picked == null) return;
      day = picked;
    }
    var hour = initialWall.hour, minute = initialWall.minute;
    if (mode != DateTimeFieldMode.date) {
      if (!context.mounted) return;
      final t = await showTimePicker(
        context: context,
        initialTime: TimeOfDay(hour: hour, minute: minute),
        builder: (ctx, child) =>
            MediaQuery(data: MediaQuery.of(ctx).copyWith(alwaysUse24HourFormat: true), child: child!),
      );
      if (t == null) return;
      hour = t.hour;
      minute = t.minute;
    }
    final d = day ?? DateTime(initialWall.year, initialWall.month, initialWall.day);
    onChanged(VnTime.fromWall(d.year, d.month, d.day, hour, minute));
  }

  @override
  Widget build(BuildContext context) {
    final v = value;
    final text = v == null
        ? null
        : switch (mode) {
            DateTimeFieldMode.date => VnTime.date(v),
            DateTimeFieldMode.time => VnTime.time(v),
            DateTimeFieldMode.dateTime => VnTime.dateTime(v),
          };
    return FieldShell(
      label: label,
      requiredField: requiredField,
      errorText: errorText,
      onTap: () => _pick(context),
      value: text,
      hint: hint ?? (mode == DateTimeFieldMode.time ? 'Chọn giờ' : 'Chọn ngày'),
      trailing: mode == DateTimeFieldMode.time ? AppIcons.time : AppIcons.calendar,
    );
  }
}

enum DateTimeFieldMode { date, time, dateTime }

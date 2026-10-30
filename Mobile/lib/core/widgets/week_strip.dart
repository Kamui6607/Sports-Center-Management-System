import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';
import '../utils/vn_time.dart';

/// Thanh chọn ngày trong tuần (thay lịch dạng lưới của web).
/// Chấm dưới ngày = có buổi. Nút trái/phải đổi tuần; "Hôm nay" quay về.
class WeekStrip extends StatelessWidget {
  const WeekStrip({
    super.key,
    required this.selectedDay,
    required this.onSelect,
    required this.now,
    this.markedDays = const {},
  });

  /// Ngày đang chọn (đầu ngày giờ VN).
  final DateTime selectedDay;
  final ValueChanged<DateTime> onSelect;
  final DateTime now;

  /// Tập ngày có buổi, khóa = [VnTime.date].
  final Set<String> markedDays;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final weekStart = VnTime.startOfWeek(selectedDay);
    final days = [for (var i = 0; i < 7; i++) weekStart.add(Duration(days: i))];
    final weekEnd = days.last;
    final isThisWeek = VnTime.sameDay(VnTime.startOfWeek(now), weekStart);
    return Container(
      color: c.surface,
      padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.xs, context.screenPadding, AppSpacing.sm),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Tuần trước',
                icon: const Icon(AppIcons.chevronLeft),
                onPressed: () => onSelect(selectedDay.subtract(const Duration(days: 7))),
              ),
              Expanded(
                child: Text(
                  '${VnTime.dateShort(weekStart)} – ${VnTime.date(weekEnd)}',
                  textAlign: TextAlign.center,
                  style: context.text.label,
                ),
              ),
              if (!isThisWeek || !VnTime.sameDay(selectedDay, now))
                TextButton(
                  onPressed: () => onSelect(VnTime.startOfDay(now)),
                  child: Text('Hôm nay', style: context.text.label.copyWith(color: c.primary)),
                ),
              IconButton(
                tooltip: 'Tuần sau',
                icon: const Icon(AppIcons.chevronRight),
                onPressed: () => onSelect(selectedDay.add(const Duration(days: 7))),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxs),
          Row(
            children: [
              for (final day in days)
                Expanded(
                  child: _DayCell(
                    day: day,
                    selected: VnTime.sameDay(day, selectedDay),
                    today: VnTime.sameDay(day, now),
                    marked: markedDays.contains(VnTime.date(day)),
                    onTap: () => onSelect(day),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.day,
    required this.selected,
    required this.today,
    required this.marked,
    required this.onTap,
  });

  final DateTime day;
  final bool selected;
  final bool today;
  final bool marked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final wall = VnTime.wall(day);
    final fg = selected ? c.onPrimary : (today ? c.primary : c.text);
    return Semantics(
      button: true,
      selected: selected,
      label: '${VnTime.dayLabel(day)}${marked ? ', có buổi học' : ''}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Material(
          color: selected ? c.primary : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadius.cardAll,
            side: BorderSide(color: today && !selected ? c.accentStrong : Colors.transparent),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: AppSizes.touch + AppSpacing.md),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    VnTime.weekdayLabel(wall.weekday, short: true),
                    style: context.text.caption.copyWith(color: selected ? c.accent : c.textMuted),
                  ),
                  Text('${wall.day}', style: context.text.bodyStrong.copyWith(color: fg)),
                  Container(
                    width: AppSpacing.xxs + 2,
                    height: AppSpacing.xxs + 2,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: marked ? (selected ? c.accent : c.accentStrong) : Colors.transparent,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

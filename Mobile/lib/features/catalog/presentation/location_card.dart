import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/catalog_repository_provider.dart';
import '../domain/entities/catalog.dart';

/// Thông tin trung tâm (`GET /center`) — cache suốt phiên, dùng ở mọi nơi hiển thị địa điểm tập.
final centerInfoProvider = FutureProvider<CenterInfo>((ref) => ref.watch(catalogRepositoryProvider).centerInfo());

/// Danh mục mục tiêu tập luyện (`GET /classes/goal-options`); lỗi mạng ⇒ dùng danh mục mặc định.
final goalOptionsProvider = FutureProvider<List<GoalOption>>((ref) async {
  try {
    return await ref.watch(catalogRepositoryProvider).goalOptions();
  } on Object {
    return kFitnessGoals;
  }
});

/// Mở bản đồ / gọi điện bằng ứng dụng ngoài; không mở được ⇒ sao chép và báo người dùng.
Future<void> openExternal(BuildContext context, Uri uri, {String? copyText}) async {
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    ok = false;
  }
  if (ok || !context.mounted) return;
  final text = copyText ?? uri.toString();
  await Clipboard.setData(ClipboardData(text: text));
  if (context.mounted) AppSnackbar.info(context, 'Không mở được ứng dụng — đã sao chép: $text');
}

/// Thẻ "Địa điểm tập": phòng · tầng · khu vực · chỉ dẫn + địa chỉ trung tâm, nút mở bản đồ / sao chép.
/// [room] null ⇒ chỉ hiện địa chỉ trung tâm (VD chi tiết khóa có nhiều phòng).
class LocationCard extends ConsumerWidget {
  const LocationCard({super.key, this.room, this.extraRooms = const []});

  final Room? room;

  /// Các phòng khác của khóa (hiện dạng danh sách ngắn).
  final List<Room> extraRooms;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final center = ref.watch(centerInfoProvider).value;
    final c = context.colors;
    final r = room;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (r != null) ...[
            InfoRow(icon: AppIcons.location, text: r.name),
            if (r.placeLabel.isNotEmpty) InfoRow(icon: AppIcons.building, text: r.placeLabel),
            if (r.directions?.trim().isNotEmpty ?? false) InfoRow(icon: AppIcons.directions, text: r.directions!),
          ],
          for (final x in extraRooms)
            InfoRow(icon: AppIcons.location, text: [x.name, if (x.placeLabel.isNotEmpty) x.placeLabel].join(' · ')),
          if (center != null) ...[
            if (r != null || extraRooms.isNotEmpty) const Divider(),
            Text(center.name, style: context.text.bodyStrong),
            const SizedBox(height: AppSpacing.xxs),
            Text(center.address, style: context.text.small.copyWith(color: c.textMuted)),
            if (center.openingHours != null) ...[
              const SizedBox(height: AppSpacing.xxs),
              InfoRow(icon: AppIcons.time, text: 'Mở cửa: ${center.openingHours}'),
            ],
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                AppButton.outline(
                  label: 'Mở bản đồ',
                  icon: AppIcons.map,
                  onPressed: () => openExternal(context, Uri.parse(center.mapLink), copyText: center.address),
                ),
                AppButton.ghost(
                  label: 'Sao chép địa chỉ',
                  icon: AppIcons.copy,
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: center.address));
                    if (context.mounted) AppSnackbar.success(context, 'Đã sao chép địa chỉ trung tâm.');
                  },
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

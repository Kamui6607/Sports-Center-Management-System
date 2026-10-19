import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/catalog_repository_provider.dart';
import '../domain/entities/catalog.dart';
import 'location_card.dart';

/// Phòng tập của trung tâm (để học viên/HLV biết vị trí từng phòng).
final centerRoomsProvider = FutureProvider.autoDispose<List<Room>>(
  (ref) => ref.watch(catalogRepositoryProvider).rooms(areaType: AreaType.indoor),
);

/// U05 — Thông tin trung tâm: địa chỉ + bản đồ, giờ mở cửa, hotline, gửi xe, sơ đồ phòng tập.
class CenterInfoScreen extends ConsumerWidget {
  const CenterInfoScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(centerInfoProvider);
    final rooms = ref.watch(centerRoomsProvider).value ?? const <Room>[];
    final c = context.colors;
    return AppScaffold(
      title: 'Thông tin trung tâm',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(centerInfoProvider),
        data: (center) => RefreshableScroll(
          onRefresh: () async {
            ref
              ..invalidate(centerInfoProvider)
              ..invalidate(centerRoomsProvider);
            await ref.read(centerInfoProvider.future);
          },
          children: [
            const LocationCard(),
            const SizedBox(height: AppSpacing.md),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (center.hotline != null)
                    InfoRow(
                      icon: AppIcons.phone,
                      text: 'Hotline: ${center.hotline}',
                      trailing: TextButton(
                        onPressed: () => openExternal(context, Uri(scheme: 'tel', path: center.hotline)),
                        child: const Text('Gọi'),
                      ),
                    ),
                  if (center.email != null) InfoRow(icon: AppIcons.mail, text: center.email!),
                  if (center.parkingNote != null) InfoRow(icon: AppIcons.info, text: center.parkingNote!),
                  if (center.description != null) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(center.description!, style: context.text.small.copyWith(color: c.textMuted)),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            SectionHeader(title: 'Các phòng tập (${rooms.length})'),
            if (rooms.isEmpty)
              Text('Chưa có thông tin phòng tập.', style: context.text.small.copyWith(color: c.textMuted))
            else
              for (final r in rooms)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(r.name, style: context.text.bodyStrong),
                        if (r.placeLabel.isNotEmpty) InfoRow(icon: AppIcons.building, text: r.placeLabel),
                        if (r.directions?.trim().isNotEmpty ?? false)
                          InfoRow(icon: AppIcons.directions, text: r.directions!),
                        InfoRow(icon: AppIcons.users, text: 'Sức chứa ${r.capacity} người'),
                      ],
                    ),
                  ),
                ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

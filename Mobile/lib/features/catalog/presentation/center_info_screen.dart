import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    return AppScaffold(
      title: 'Thông tin trung tâm',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(centerInfoProvider),
        data: (center) => RefreshableScroll(
          padding: EdgeInsets.zero,
          onRefresh: () async {
            ref
              ..invalidate(centerInfoProvider)
              ..invalidate(centerRoomsProvider);
            await ref.read(centerInfoProvider.future);
          },
          children: [
            _CenterHeroBanner(center: center),
            Padding(
              padding: EdgeInsets.fromLTRB(
                context.screenPadding,
                AppSpacing.lg,
                context.screenPadding,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Banner đã có tên, địa chỉ, giờ mở cửa và nút bản đồ ⇒ không lặp lại LocationCard ở đây.
                  // Không có thông tin liên hệ ⇒ không chừa khoảng trống.
                  if (_hasContact(center)) ...[
                    _ContactCard(center: center),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  SectionHeader(title: 'Phòng tập (${rooms.length})'),
                  const SizedBox(height: AppSpacing.xs),
                  if (rooms.isEmpty)
                    _EmptyRooms()
                  else
                    ...rooms.map((r) => _RoomCard(room: r)),
                  const SizedBox(height: AppSpacing.xl),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Hero Banner ─────────────────────────────────────────────────────────────

class _CenterHeroBanner extends StatelessWidget {
  const _CenterHeroBanner({required this.center});
  final CenterInfo center;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: c.primary,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(AppRadius.sheet + AppSpacing.xxs),
          bottomRight: Radius.circular(AppRadius.sheet + AppSpacing.xxs),
        ),
      ),
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon vòng tròn
              Container(
                width: AppSpacing.xxl + AppSpacing.sm,
                height: AppSpacing.xxl + AppSpacing.sm,
                decoration: BoxDecoration(
                  color: c.accent.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  AppIcons.building,
                  size: AppSizes.iconXl,
                  color: c.accent,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              // Tên trung tâm
              Text(
                center.name,
                style: context.text.title.copyWith(color: c.onPrimary),
              ),
              const SizedBox(height: AppSpacing.xs),
              // Địa chỉ
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(AppIcons.location, size: AppSizes.iconSm, color: c.accent),
                  const SizedBox(width: AppSpacing.xs),
                  Expanded(
                    child: Text(
                      center.address,
                      style: context.text.small.copyWith(
                        color: c.onPrimary.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                ],
              ),
              if (center.openingHours != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    Icon(AppIcons.time, size: AppSizes.iconSm, color: c.accent),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      center.openingHours!,
                      style: context.text.small.copyWith(
                        color: c.onPrimary.withValues(alpha: 0.8),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              // Nút hành động
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  _HeroChipButton(
                    icon: AppIcons.map,
                    label: 'Mở bản đồ',
                    onTap: () => openExternal(
                      context,
                      Uri.parse(center.mapLink),
                      copyText: center.address,
                    ),
                  ),
                  _HeroChipButton(
                    icon: AppIcons.copy,
                    label: 'Sao chép địa chỉ',
                    onTap: () async {
                      await Clipboard.setData(ClipboardData(text: center.address));
                      if (context.mounted) {
                        AppSnackbar.success(context, 'Đã sao chép địa chỉ trung tâm.');
                      }
                    },
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroChipButton extends StatelessWidget {
  const _HeroChipButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Material(
      color: c.onPrimary.withValues(alpha: 0.12),
      borderRadius: AppRadius.pillAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.xs - 2,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: AppSizes.iconSm, color: c.onPrimary),
              const SizedBox(width: AppSpacing.xs - 2),
              Text(
                label,
                style: context.text.label.copyWith(color: c.onPrimary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

/// Trung tâm có ít nhất một thông tin liên hệ / tiện ích để hiển thị trong [_ContactCard].
bool _hasContact(CenterInfo center) =>
    center.hotline != null || center.email != null || center.parkingNote != null || center.description != null;

class _ContactCard extends StatelessWidget {
  const _ContactCard({required this.center});
  final CenterInfo center;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;

    if (!_hasContact(center)) return const SizedBox.shrink();

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Liên hệ & Tiện ích', style: context.text.bodyStrong),
          const SizedBox(height: AppSpacing.sm),
          if (center.hotline != null)
            _ContactRow(
              icon: AppIcons.phone,
              label: 'Hotline',
              value: center.hotline!,
              actionLabel: 'Gọi',
              onAction: () => openExternal(context, Uri(scheme: 'tel', path: center.hotline)),
            ),
          if (center.email != null)
            _ContactRow(
              icon: AppIcons.mail,
              label: 'Email',
              value: center.email!,
              actionLabel: 'Gửi',
              onAction: () => openExternal(
                context,
                Uri(scheme: 'mailto', path: center.email),
              ),
            ),
          if (center.parkingNote != null) ...[
            if (center.hotline != null || center.email != null)
              Divider(height: AppSpacing.md, color: c.border),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(AppIcons.info, size: AppSizes.iconSm + 2, color: c.textMuted),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    center.parkingNote!,
                    style: context.text.small.copyWith(color: c.text),
                  ),
                ),
              ],
            ),
          ],
          if (center.description != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              center.description!,
              style: context.text.small.copyWith(color: c.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.actionLabel,
    required this.onAction,
  });
  final IconData icon;
  final String label;
  final String value;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs - 2),
      child: Row(
        children: [
          Container(
            width: AppSpacing.xl,
            height: AppSpacing.xl,
            decoration: BoxDecoration(
              color: c.primary.withValues(alpha: 0.08),
              borderRadius: AppRadius.controlAll,
            ),
            child: Icon(icon, size: AppSizes.iconSm + 2, color: c.primary),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: context.text.caption.copyWith(color: c.textMuted)),
                Text(value, style: context.text.small.copyWith(color: c.text)),
              ],
            ),
          ),
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              minimumSize: const Size(AppSizes.touch, AppSizes.touchMin),
              foregroundColor: c.primary,
            ),
            child: Text(actionLabel),
          ),
        ],
      ),
    );
  }
}

// ─── Room Card ────────────────────────────────────────────────────────────────

class _RoomCard extends StatelessWidget {
  const _RoomCard({required this.room});
  final Room room;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: AppCard(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: AppSpacing.xxl,
              height: AppSpacing.xxl,
              decoration: BoxDecoration(
                color: c.primary.withValues(alpha: 0.07),
                borderRadius: AppRadius.controlAll,
              ),
              child: Icon(AppIcons.building, size: AppSizes.icon, color: c.primary),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(room.name, style: context.text.bodyStrong),
                  if (room.placeLabel.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Row(
                      children: [
                        Icon(AppIcons.location, size: AppSizes.iconSm, color: c.textMuted),
                        const SizedBox(width: AppSpacing.xxs),
                        Expanded(
                          child: Text(
                            room.placeLabel,
                            style: context.text.small.copyWith(color: c.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (room.directions?.trim().isNotEmpty ?? false) ...[
                    const SizedBox(height: AppSpacing.xxs),
                    Row(
                      children: [
                        Icon(AppIcons.directions, size: AppSizes.iconSm, color: c.textMuted),
                        const SizedBox(width: AppSpacing.xxs),
                        Expanded(
                          child: Text(
                            room.directions!,
                            style: context.text.small.copyWith(color: c.textMuted),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: AppSpacing.xs),
                  // Capacity chip
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.xs,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: c.primary.withValues(alpha: 0.08),
                      borderRadius: AppRadius.pillAll,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(AppIcons.users, size: AppSizes.iconSm - 2, color: c.primary),
                        const SizedBox(width: AppSpacing.xxs),
                        Text(
                          '${room.capacity} người',
                          style: context.text.caption.copyWith(color: c.primary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyRooms extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
    child: Center(
      child: Text(
        'Chưa có thông tin phòng tập.',
        style: context.text.small.copyWith(color: context.colors.textMuted),
      ),
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/coach_term.dart';
import '../providers/checkin_providers.dart';

/// Check-in phòng gym: quét QR do Quản lý hiển thị để ghi 1 ngày dùng phòng; xem hạn mức miễn phí và phí phát sinh.
class CoachCheckInScreen extends ConsumerStatefulWidget {
  const CoachCheckInScreen({super.key});

  @override
  ConsumerState<CoachCheckInScreen> createState() => _CoachCheckInScreenState();
}

class _CoachCheckInScreenState extends ConsumerState<CoachCheckInScreen> {
  CheckInResult? _last;

  Future<void> _scan() async {
    final result = await context.push<CheckInResult>(AppRoutes.coachCheckinScan);
    if (!mounted || result == null) return;
    setState(() => _last = result);
    ref.read(dataRevisionProvider.notifier).bump();
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(myCheckInsProvider);
    return AppScaffold(
      title: 'Check-in phòng gym',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(myCheckInsProvider),
        data: (data) => RefreshableScroll(
          onRefresh: () => ref.refresh(myCheckInsProvider.future),
          children: [
            if (_last != null) ...[_ResultBanner(result: _last!), const SizedBox(height: AppSpacing.md)],
            _UsageCard(usage: data.usage),
            const SizedBox(height: AppSpacing.md),
            if (!data.eligible)
              const AlertBanner.info(
                title: 'Hồ sơ chưa được duyệt',
                message: 'Bạn check-in được sau khi Quản lý duyệt hồ sơ HLV.',
              )
            else
              AppButton(
                label: data.usage.checkedInToday ? 'Quét lại (hôm nay đã check-in)' : 'Quét QR check-in',
                icon: AppIcons.scan,
                expand: true,
                onPressed: _scan,
              ),
            const SizedBox(height: AppSpacing.lg),
            SectionHeader(title: 'Các ngày gần đây (${data.items.length})'),
            if (data.items.isEmpty)
              Text('Chưa có ngày check-in nào.', style: context.text.small.copyWith(color: context.colors.textMuted))
            else
              for (final i in data.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: _CheckInTile(item: i),
                ),
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

class _ResultBanner extends StatelessWidget {
  const _ResultBanner({required this.result});

  final CheckInResult result;

  @override
  Widget build(BuildContext context) {
    final ci = result.checkIn;
    if (result.alreadyCheckedIn) {
      return AlertBanner.info(
        title: 'Hôm nay bạn đã check-in',
        message: 'Quét lại trong ngày không tính thêm. Ngày thứ ${ci.dayIndex} của tháng.',
      );
    }
    if (ci.free) {
      return AlertBanner.success(
        title: 'Check-in thành công — miễn phí',
        message: 'Ngày thứ ${ci.dayIndex} trong tháng. Còn ${result.usage.freeDaysLeft} ngày miễn phí.',
      );
    }
    final debt = ci.feeDebt > 0 ? ' Còn nợ ${Money.format(ci.feeDebt)} (trừ dần khi ví có tiền).' : '';
    return AlertBanner.warning(
      title: 'Check-in thành công — có phí',
      message: 'Phí ${Money.format(ci.feeAssessed)}, đã trừ ${Money.format(ci.feeCharged)} từ ví.$debt',
    );
  }
}

class _UsageCard extends StatelessWidget {
  const _UsageCard({required this.usage});

  final CheckInUsage usage;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pct = usage.freeDaysPerMonth == 0 ? 1.0 : (usage.freeDaysUsed / usage.freeDaysPerMonth).clamp(0.0, 1.0);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Tháng ${usage.monthKey.split('-').reversed.join('/')}', style: context.text.title)),
              if (usage.checkedInToday)
                const StatusLabel('Hôm nay đã check-in', StatusTone.success).tag(icon: AppIcons.success),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ClipRRect(
            borderRadius: AppRadius.pillAll,
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: c.border,
              color: pct >= 1 ? c.errorText : c.primary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            usage.entitled
                ? 'Đã dùng ${usage.freeDaysUsed}/${usage.freeDaysPerMonth} ngày miễn phí · còn ${usage.freeDaysLeft} ngày'
                : 'Thẻ ra vào chưa hợp lệ — mỗi ngày dùng đều tính phí.',
            style: context.text.small,
          ),
          const Divider(height: AppSpacing.lg),
          KeyValueRow(label: 'Tổng số ngày đã dùng', value: '${usage.daysUsed} ngày'),
          KeyValueRow(label: 'Phí mỗi ngày quá hạn mức', value: Money.format(usage.feePerDay)),
          KeyValueRow(label: 'Phí phát sinh tháng này', value: Money.format(usage.feeAssessedThisMonth)),
          KeyValueRow(label: 'Đã trừ từ ví', value: Money.format(usage.feeChargedThisMonth)),
          if (usage.feeDebt > 0)
            KeyValueRow(label: 'Còn nợ', value: Money.format(usage.feeDebt), emphasize: true, valueColor: c.errorText),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Phí được trừ từ tiền của khóa học cũ nhất còn dư trong ví.',
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
        ],
      ),
    );
  }
}

class _CheckInTile extends StatelessWidget {
  const _CheckInTile({required this.item});

  final CoachCheckIn item;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Row(
        children: [
          Icon(item.free ? AppIcons.success : AppIcons.money, color: item.free ? c.successText : c.textMuted),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(VnTime.date(item.checkedInAt), style: context.text.bodyStrong),
                Text(
                  'Ngày thứ ${item.dayIndex} · ${VnTime.time(item.checkedInAt)}',
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          if (item.free)
            const StatusLabel('Miễn phí', StatusTone.success).tag(dense: true)
          else
            Text(
              '-${Money.format(item.feeCharged)}${item.feeDebt > 0 ? ' (nợ ${Money.format(item.feeDebt)})' : ''}',
              style: context.text.label.copyWith(color: c.errorText),
            ),
        ],
      ),
    );
  }
}

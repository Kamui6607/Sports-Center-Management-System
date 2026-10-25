import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/membership_repository_provider.dart';
import '../../domain/entities/membership.dart';
import '../providers/membership_providers.dart';

/// Gói thành viên — Member xem & mua gói tập gym tự do (thanh toán VietQR).
class MembershipPlansScreen extends ConsumerStatefulWidget {
  const MembershipPlansScreen({super.key});

  @override
  ConsumerState<MembershipPlansScreen> createState() => _MembershipPlansScreenState();
}

class _MembershipPlansScreenState extends ConsumerState<MembershipPlansScreen> with SubmittingState {
  String? _buyingPlanId;

  Future<void> _buy(MembershipPlan plan, MembershipOverview? overview) async {
    // Còn gói ⇒ gói mới nối tiếp ngay sau hạn cuối cùng (cộng dồn), không mất ngày nào.
    final start = overview?.validUntil != null && overview!.validUntil!.isAfter(DateTime.now())
        ? overview.validUntil!
        : DateTime.now();
    final end = start.add(Duration(days: plan.durationDays));
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xác nhận mua gói',
      message: 'Bạn sẽ thanh toán bằng chuyển khoản VietQR. Gói được kích hoạt ngay khi trung tâm nhận được tiền.',
      confirmLabel: 'Thanh toán ${Money.format(plan.price)}',
      extra: AppCard(
        color: context.colors.surfaceMuted,
        child: Column(
          children: [
            KeyValueRow(label: 'Gói', value: plan.name),
            KeyValueRow(label: 'Thời hạn', value: '${plan.durationDays} ngày'),
            KeyValueRow(
              label: 'Bắt đầu',
              value: overview?.isActive == true
                  ? '${VnTime.date(start)} (nối tiếp gói hiện tại)'
                  : 'Ngay khi thanh toán',
            ),
            KeyValueRow(label: 'Hết hạn dự kiến', value: VnTime.date(end)),
            const Divider(),
            KeyValueRow(label: 'Thành tiền', value: Money.format(plan.price), emphasize: true),
          ],
        ),
      ),
      warning: 'Gói thành viên đã mua không hủy / hoàn tiền theo yêu cầu cá nhân.',
    );
    if (!ok || !mounted) return;
    setState(() => _buyingPlanId = plan.id);
    final paymentId = await submit(() => ref.read(membershipRepositoryProvider).purchase(plan.id));
    if (!mounted) return;
    setState(() => _buyingPlanId = null);
    if (paymentId == null) {
      AppSnackbar.error(context, formError ?? 'Không tạo được giao dịch. Vui lòng thử lại.');
      return;
    }
    ref.read(dataRevisionProvider.notifier).bump();
    await context.push(AppRoutes.payment(paymentId));
  }

  @override
  Widget build(BuildContext context) {
    final plans = ref.watch(membershipPlansProvider);
    final overview = ref.watch(membershipOverviewProvider).value;
    final c = context.colors;
    final queueFull = overview != null && !overview.canQueueMore;
    return AppScaffold(
      title: 'Gói thành viên',
      body: AsyncValueView(
        value: plans,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(membershipPlansProvider),
        isEmpty: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: AppIcons.membership,
          title: 'Chưa có gói thành viên',
          message: 'Trung tâm chưa mở bán gói tập tự do. Vui lòng quay lại sau.',
        ),
        data: (list) => RefreshableList(
          onRefresh: () => ref.refresh(membershipPlansProvider.future),
          header: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: overview != null && overview.isActive
                ? AlertBanner.info(
                    title: 'Thẻ của bạn còn ${overview.totalDaysLeft} ngày',
                    message:
                        'Hiệu lực đến ${VnTime.date(overview.validUntil!)}. Gói mua thêm sẽ tự nối tiếp sau ngày này.'
                        '${queueFull ? ' Bạn đã mua trước tối đa 3 gói.' : ''}',
                    action: TextButton(
                      onPressed: () => context.push(AppRoutes.membershipCard),
                      child: const Text('Xem thẻ'),
                    ),
                  )
                : Text(
                    'Tập tự do tại phòng gym trong giờ mở cửa, không cần đăng ký lớp với HLV. Thanh toán bằng chuyển khoản VietQR.',
                    style: context.text.small.copyWith(color: c.textMuted),
                  ),
          ),
          itemCount: list.length,
          itemBuilder: (context, i) => _PlanCard(
            plan: list[i],
            buyLabel: overview?.isActive == true ? 'Gia hạn bằng gói này' : 'Mua gói',
            loading: submitting && _buyingPlanId == list[i].id,
            onBuy: submitting || queueFull ? null : () => _buy(list[i], overview),
          ),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.buyLabel, required this.loading, required this.onBuy});

  final MembershipPlan plan;
  final String buyLabel;
  final bool loading;
  final VoidCallback? onBuy;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final p = plan;
    return AppCard(
      borderColor: p.isFeatured ? c.primary : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const IconTile(AppIcons.membership),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(p.name, style: context.text.bodyStrong),
                        if (p.isFeatured)
                          const StatusLabel('Phổ biến', StatusTone.brand).tag(dense: true, icon: AppIcons.star),
                      ],
                    ),
                    Text('${p.durationDays} ngày tập tự do', style: context.text.caption.copyWith(color: c.textMuted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  MoneyText(p.price, style: context.text.titleSmall.copyWith(color: c.primary)),
                  if (p.durationDays > 31)
                    Text(
                      '≈ ${Money.format(p.pricePer30Days)}/30 ngày',
                      style: context.text.caption.copyWith(color: c.textMuted),
                    ),
                ],
              ),
            ],
          ),
          if (p.description != null && p.description!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(p.description!, style: context.text.small),
          ],
          if (p.benefits.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            for (final b in p.benefits)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xxs),
                child: InfoRow(icon: AppIcons.check, text: b),
              ),
          ],
          const SizedBox(height: AppSpacing.sm),
          AppButton(label: buyLabel, expand: true, loading: loading, onPressed: onBuy),
        ],
      ),
    );
  }
}

/// Thẻ thành viên — mã QR động (~60 giây) để HLV / Quản lý quét khi vào phòng tập.
class MembershipCardScreen extends ConsumerWidget {
  const MembershipCardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(membershipOverviewProvider);
    final user = ref.watch(currentUserProvider);
    return AppScaffold(
      title: 'Thẻ thành viên',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(membershipOverviewProvider),
        data: (o) {
          if (user == null || (o.current == null && o.queued.isEmpty)) {
            return EmptyState(
              icon: AppIcons.membership,
              title: o.recentExpired != null ? 'Gói thành viên đã hết hạn' : 'Bạn chưa có gói thành viên',
              message: o.recentExpired != null
                  ? 'Gói "${o.recentExpired!.plan.name}" hết hạn ngày ${VnTime.date(o.recentExpired!.endDate)}. Gia hạn để tiếp tục tập.'
                  : 'Mua gói để tập tự do tại phòng gym. Thẻ QR sẽ xuất hiện ở đây sau khi thanh toán.',
              actionLabel: o.recentExpired != null ? 'Gia hạn ngay' : 'Mua gói ngay',
              onAction: () => context.push(AppRoutes.membershipPlans),
            );
          }
          return RefreshableScroll(
            onRefresh: () async {
              ref.invalidate(memberPassProvider);
              ref.invalidate(membershipHistoryProvider);
              ref.invalidate(membershipOverviewProvider);
              await ref.read(membershipOverviewProvider.future);
            },
            children: [
              _MemberCard(name: user.fullName, avatarUrl: user.avatarUrl, overview: o),
              const SizedBox(height: AppSpacing.md),
              if (o.isActive)
                const _DynamicQr()
              else
                AlertBanner.info(
                  title: 'Gói của bạn chưa tới ngày bắt đầu',
                  message: 'Gói "${o.queued.first.plan.name}" bắt đầu từ ${VnTime.date(o.queued.first.startDate)}.',
                ),
              if (o.queued.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                const SectionHeader(title: 'Gói đã mua trước'),
                for (final q in o.queued)
                  AppCard(
                    onTap: q.paymentId == null ? null : () => context.push(AppRoutes.invoice(q.paymentId!)),
                    child: Row(
                      children: [
                        const IconTile(AppIcons.calendar),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(q.plan.name, style: context.text.bodyStrong),
                              Text(
                                '${VnTime.date(q.startDate)} – ${VnTime.date(q.endDate)} · ${q.durationDays} ngày',
                                style: context.text.caption.copyWith(color: context.colors.textMuted),
                              ),
                            ],
                          ),
                        ),
                        const StatusLabel('Chờ tới lượt', StatusTone.info).tag(dense: true),
                      ],
                    ),
                  ),
              ],
              if (o.current?.paymentId != null) ...[
                const SizedBox(height: AppSpacing.md),
                AppButton.ghost(
                  label: 'Chi tiết thanh toán gói hiện tại',
                  icon: AppIcons.invoice,
                  expand: true,
                  onPressed: () => context.push(AppRoutes.invoice(o.current!.paymentId!)),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton.outline(
                label: 'Gia hạn / mua thêm gói',
                icon: AppIcons.add,
                expand: true,
                onPressed: o.canQueueMore ? () => context.push(AppRoutes.membershipPlans) : null,
              ),
              const SizedBox(height: AppSpacing.lg),
              const _HistorySection(),
            ],
          );
        },
      ),
    );
  }
}

/// Thẻ dạng thẻ vật lý: nền thương hiệu, tên + ảnh, gói, hạn dùng cuối cùng, thanh tiến độ ngày còn lại.
class _MemberCard extends StatelessWidget {
  const _MemberCard({required this.name, required this.avatarUrl, required this.overview});

  final String name;
  final String? avatarUrl;
  final MembershipOverview overview;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final o = overview;
    final current = o.current;
    final onCard = context.text.small.copyWith(color: c.onPrimary.withValues(alpha: 0.78));
    final used = current == null || current.durationDays <= 0
        ? 0.0
        : (1 - current.daysLeft / current.durationDays).clamp(0.0, 1.0);
    return Semantics(
      label:
          'Thẻ thành viên của $name, ${current?.plan.name ?? ''}, hiệu lực đến ${o.validUntil == null ? '' : VnTime.date(o.validUntil!)}',
      child: ClipRRect(
        borderRadius: AppRadius.sheetAll,
        child: Container(
          color: c.primary,
          child: Stack(
            children: [
              // Họa tiết: hai vòng tròn màu nhấn mờ ở góc phải.
              Positioned(
                right: -AppSpacing.xxl,
                top: -AppSpacing.xxl,
                child: _Blob(size: AppSpacing.xxl * 4, color: c.accent.withValues(alpha: 0.16)),
              ),
              Positioned(
                right: AppSpacing.xl,
                bottom: -AppSpacing.xxl,
                child: _Blob(size: AppSpacing.xxl * 2.5, color: c.accent.withValues(alpha: 0.10)),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const BrandLogo(onDark: true),
                        const Spacer(),
                        (o.isActive
                                ? const StatusLabel('Đang hiệu lực', StatusTone.success)
                                : const StatusLabel('Chờ bắt đầu', StatusTone.info))
                            .tag(dense: true),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('THẺ THÀNH VIÊN', style: onCard.copyWith(letterSpacing: 2)),
                    const SizedBox(height: AppSpacing.xs),
                    Row(
                      children: [
                        AppAvatar(name: name, imageUrl: avatarUrl, size: AppSizes.avatarLg),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(name, style: context.text.title.copyWith(color: c.onPrimary)),
                              Text(current?.plan.name ?? o.queued.first.plan.name, style: onCard),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Hiệu lực đến', style: onCard),
                              Text(
                                o.validUntil == null ? '—' : VnTime.date(o.validUntil!),
                                style: context.text.titleSmall.copyWith(
                                  color: c.onPrimary,
                                  fontFeatures: kTabularFigures,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          'Còn ${o.totalDaysLeft} ngày',
                          style: context.text.titleSmall.copyWith(
                            color: o.totalDaysLeft <= 7 ? c.accent : c.onPrimary,
                            fontFeatures: kTabularFigures,
                          ),
                        ),
                      ],
                    ),
                    if (current != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      ClipRRect(
                        borderRadius: AppRadius.pillAll,
                        child: LinearProgressIndicator(
                          value: used,
                          minHeight: AppSpacing.xs,
                          backgroundColor: c.onPrimary.withValues(alpha: 0.18),
                          valueColor: AlwaysStoppedAnimation(c.accent),
                          semanticsLabel: 'Đã dùng ${(used * 100).round()}% gói hiện tại',
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        'Gói hiện tại: ${VnTime.date(current.startDate)} – ${VnTime.date(current.endDate)}',
                        style: onCard.copyWith(fontSize: context.text.caption.fontSize),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
  );
}

/// Mã QR động: tự làm mới vài giây trước khi hết hạn (ảnh chụp màn hình không dùng lại được).
class _DynamicQr extends ConsumerStatefulWidget {
  const _DynamicQr();

  @override
  ConsumerState<_DynamicQr> createState() => _DynamicQrState();
}

class _DynamicQrState extends ConsumerState<_DynamicQr> {
  Timer? _refresh;

  @override
  void dispose() {
    _refresh?.cancel();
    super.dispose();
  }

  void _schedule(MemberPass pass) {
    _refresh?.cancel();
    final wait = pass.expiresAt.difference(DateTime.now()) - const Duration(seconds: 5);
    _refresh = Timer(wait.isNegative ? Duration.zero : wait, () {
      if (mounted) ref.invalidate(memberPassProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    ref.listen(memberPassProvider, (_, next) {
      final pass = next.value;
      if (pass != null) _schedule(pass);
    });
    final value = ref.watch(memberPassProvider);
    final pass = value.value;
    if (pass != null && _refresh == null) _schedule(pass);
    return AppCard(
      child: Column(
        children: [
          Text(
            'Đưa mã này cho Quản lý hoặc HLV quét khi vào phòng tập',
            textAlign: TextAlign.center,
            style: context.text.small,
          ),
          const SizedBox(height: AppSpacing.md),
          Container(
            decoration: const BoxDecoration(color: AppPalette.white, borderRadius: AppRadius.sheetAll),
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: SizedBox.square(
              dimension: 220,
              child: pass == null
                  ? (value.hasError
                        ? Center(
                            child: TextButton.icon(
                              onPressed: () => ref.invalidate(memberPassProvider),
                              icon: const Icon(AppIcons.refresh),
                              label: const Text('Tải lại mã'),
                            ),
                          )
                        : const Center(child: CircularProgressIndicator.adaptive()))
                  : QrImageView(
                      data: pass.token,
                      size: 220,
                      semanticsLabel: 'Mã QR thẻ thành viên',
                      eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: c.primary),
                      dataModuleStyle: QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: c.primary),
                    ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (pass != null)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(AppIcons.time, size: AppSizes.iconSm, color: c.textMuted),
                const SizedBox(width: AppSpacing.xxs),
                CountdownText(
                  deadline: pass.expiresAt,
                  prefix: 'Mã tự làm mới sau ',
                  style: context.text.caption.copyWith(color: c.textMuted, fontFeatures: kTabularFigures),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _HistorySection extends ConsumerWidget {
  const _HistorySection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(membershipHistoryProvider).value ?? const <Membership>[];
    if (history.isEmpty) return const SizedBox.shrink();
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Lịch sử mua gói (chạm để xem chi tiết thanh toán)'),
        AppCard(
          child: Column(
            children: [
              for (final (i, m) in history.indexed) ...[
                if (i > 0) const Divider(height: AppSpacing.lg),
                InkWell(
                  onTap: m.paymentId == null ? null : () => context.push(AppRoutes.invoice(m.paymentId!)),
                  borderRadius: AppRadius.controlAll,
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(m.plan.name, style: context.text.bodyStrong),
                            Text(
                              '${VnTime.date(m.startDate)} – ${VnTime.date(m.endDate)}'
                              '${m.cancelReason != null ? ' · Hủy: ${m.cancelReason}' : ''}',
                              style: context.text.caption.copyWith(color: c.textMuted),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          if (m.paidAmount != null) MoneyText(m.paidAmount!, style: context.text.label),
                          switch (m.status) {
                            MembershipStatus.active when m.isQueued => const StatusLabel(
                              'Chờ tới lượt',
                              StatusTone.info,
                            ),
                            MembershipStatus.active => const StatusLabel('Đang dùng', StatusTone.success),
                            MembershipStatus.expired => const StatusLabel('Hết hạn', StatusTone.neutral),
                            MembershipStatus.cancelled => const StatusLabel('Đã hủy', StatusTone.danger),
                          }.tag(dense: true),
                        ],
                      ),
                      if (m.paymentId != null) ...[
                        const SizedBox(width: AppSpacing.xs),
                        Icon(AppIcons.chevronRight, size: AppSizes.iconSm, color: c.textMuted),
                      ],
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// HLV / Quản lý quét QR động trên thẻ thành viên ⇒ hợp lệ hay không (BE ghi nhật ký vào cửa).
/// Kết quả tự ẩn sau 5 giây để quét tiếp.
class MembershipScannerScreen extends ConsumerStatefulWidget {
  const MembershipScannerScreen({super.key});

  @override
  ConsumerState<MembershipScannerScreen> createState() => _MembershipScannerScreenState();
}

class _MembershipScannerScreenState extends ConsumerState<MembershipScannerScreen> {
  static const _resultDuration = Duration(seconds: 5);

  final _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _processing = false;
  MembershipVerifyResult? _result;
  Timer? _resetTimer;

  @override
  void dispose() {
    _resetTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _verify(String raw) async {
    final token = raw.trim();
    if (_processing || _result != null || token.isEmpty) return;
    setState(() => _processing = true);
    await _controller.stop();
    try {
      final result = await ref.read(membershipRepositoryProvider).verifyPass(token);
      if (!mounted) return;
      setState(() {
        _processing = false;
        _result = result;
      });
      _resetTimer = Timer(_resultDuration, _reset);
    } on Object catch (e) {
      if (!mounted) return;
      final f = AppFailure.from(e);
      AppSnackbar.error(
        context,
        f.type == FailureType.notFound ? 'Mã QR không phải thẻ thành viên hợp lệ.' : f.message,
      );
      await _reset();
    }
  }

  Future<void> _reset() async {
    _resetTimer?.cancel();
    if (!mounted) return;
    setState(() {
      _processing = false;
      _result = null;
    });
    await _controller.start();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final result = _result;
    return Scaffold(
      backgroundColor: AppPalette.cameraOverlay,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: c.onPrimary,
        title: const Text('Quét thẻ thành viên'),
        leading: IconButton(tooltip: 'Đóng', icon: const Icon(AppIcons.close), onPressed: () => context.pop()),
      ),
      extendBodyBehindAppBar: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              final value = capture.barcodes.firstOrNull?.rawValue;
              if (value != null) _verify(value);
            },
            errorBuilder: (context, error) => ColoredBox(
              color: c.surface,
              child: SafeArea(
                child: EmptyState(
                  icon: AppIcons.camera,
                  title: error.errorCode == MobileScannerErrorCode.permissionDenied
                      ? 'Chưa cấp quyền camera'
                      : 'Không mở được camera',
                  message: 'Cấp quyền camera trong cài đặt để quét thẻ thành viên.',
                ),
              ),
            ),
          ),
          if (_processing) const Center(child: CircularProgressIndicator.adaptive()),
          Positioned(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            bottom: AppSpacing.xl,
            child: SafeArea(
              child: result != null
                  ? _VerifyResultCard(result: result, onScanNext: _reset)
                  : Column(
                      children: [
                        Text(
                          'Quét mã QR trong màn "Thẻ thành viên" của hội viên (mã tự đổi mỗi phút).',
                          textAlign: TextAlign.center,
                          style: context.text.small.copyWith(color: c.onPrimary),
                        ),
                        if (Env.useMock) ...[
                          const SizedBox(height: AppSpacing.md),
                          AppButton.outline(
                            label: 'DEV: Thẻ còn hạn (member@demo.vn)',
                            icon: AppIcons.zap,
                            expand: true,
                            onPressed: _processing ? null : () => _verify('u-m1'),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          AppButton.outline(
                            label: 'DEV: Thẻ hết hạn (trang.le@demo.vn)',
                            icon: AppIcons.zap,
                            expand: true,
                            onPressed: _processing ? null : () => _verify('u-m3'),
                          ),
                        ],
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VerifyResultCard extends StatelessWidget {
  const _VerifyResultCard({required this.result, required this.onScanNext});

  final MembershipVerifyResult result;
  final VoidCallback onScanNext;

  @override
  Widget build(BuildContext context) {
    final r = result;
    final tone = context.tones.of(r.isActive ? StatusTone.success : StatusTone.danger);
    final message = r.isActive
        ? 'Hợp lệ · còn ${r.daysLeft} ngày'
        : r.status == null
        ? 'Chưa có gói thành viên'
        : 'Gói đã hết hạn';
    return AppCard(
      color: tone.background,
      borderColor: tone.border,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppAvatar(name: r.fullName, imageUrl: r.avatarUrl, size: AppSizes.avatarLg),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.fullName, style: context.text.bodyStrong),
                    if (r.planName != null) Text(r.planName!, style: context.text.small),
                  ],
                ),
              ),
              Icon(r.isActive ? AppIcons.success : AppIcons.error, color: tone.foreground, size: AppSizes.iconXl),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(message, style: context.text.title.copyWith(color: tone.foreground)),
          if (r.reason != null && !r.isActive) Text(r.reason!, style: context.text.small),
          if (r.endDate != null && r.isActive)
            Text('Hiệu lực đến ${VnTime.date(r.endDate!)}', style: context.text.small),
          if (r.isActive && r.entriesToday > 1)
            Text('Lượt vào thứ ${r.entriesToday} trong hôm nay', style: context.text.small),
          const SizedBox(height: AppSpacing.sm),
          AppButton.secondary(label: 'Quét tiếp', icon: AppIcons.scan, expand: true, onPressed: onScanNext),
        ],
      ),
    );
  }
}

/// Chip trạng thái gói ở trang chủ Member: còn hạn ⇒ mở thẻ, chưa có ⇒ mở danh sách gói.
class MembershipStatusChip extends ConsumerWidget {
  const MembershipStatusChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final o = ref.watch(membershipOverviewProvider).value;
    final active = o != null && o.isActive;
    final c = context.colors;
    return Align(
      alignment: Alignment.centerLeft,
      child: ActionChip(
        avatar: Icon(AppIcons.membership, size: AppSizes.icon, color: active ? c.successText : c.primary),
        label: Text(active ? 'Thẻ thành viên còn ${o.totalDaysLeft} ngày' : 'Mua gói tập'),
        onPressed: () => context.push(active ? AppRoutes.membershipCard : AppRoutes.membershipPlans),
      ),
    );
  }
}

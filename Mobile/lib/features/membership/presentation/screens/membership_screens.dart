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

  Future<void> _buy(MembershipPlan plan) async {
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
    final current = ref.watch(myMembershipProvider).value;
    final c = context.colors;
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
            child: current != null && current.isActive
                ? AlertBanner.info(
                    title: 'Gói của bạn còn ${current.daysLeft} ngày',
                    message: 'Hết hạn ${VnTime.date(current.endDate)}. Mua thêm gói sẽ được cộng dồn sau ngày này.',
                    action: TextButton(
                      onPressed: () => context.push(AppRoutes.membershipCard),
                      child: const Text('Xem thẻ'),
                    ),
                  )
                : Text(
                    'Tập tự do tại phòng gym, không cần đăng ký lớp. Thanh toán bằng chuyển khoản VietQR.',
                    style: context.text.small.copyWith(color: c.textMuted),
                  ),
          ),
          itemCount: list.length,
          itemBuilder: (context, i) {
            final p = list[i];
            return AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const IconTile(AppIcons.membership),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(p.name, style: context.text.bodyStrong),
                            Text('${p.durationDays} ngày', style: context.text.caption.copyWith(color: c.textMuted)),
                          ],
                        ),
                      ),
                      MoneyText(p.price, style: context.text.titleSmall.copyWith(color: c.primary)),
                    ],
                  ),
                  if (p.description != null) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Text(p.description!, style: context.text.small),
                  ],
                  const SizedBox(height: AppSpacing.sm),
                  AppButton(
                    label: current != null && current.isActive ? 'Mua thêm gói' : 'Mua gói',
                    expand: true,
                    loading: submitting && _buyingPlanId == p.id,
                    onPressed: submitting ? null : () => _buy(p),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Thẻ thành viên — QR (= userId) để HLV / Quản lý quét kiểm tra khi vào phòng tập.
class MembershipCardScreen extends ConsumerWidget {
  const MembershipCardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myMembershipProvider);
    final user = ref.watch(currentUserProvider);
    final c = context.colors;
    return AppScaffold(
      title: 'Thẻ thành viên',
      body: AsyncValueView(
        value: value,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(myMembershipProvider),
        data: (m) {
          if (m == null || !m.isActive || user == null) {
            return EmptyState(
              icon: AppIcons.membership,
              title: 'Bạn chưa có gói thành viên',
              message: 'Mua gói để tập tự do tại phòng gym. Thẻ QR sẽ xuất hiện ở đây sau khi thanh toán.',
              actionLabel: 'Mua gói ngay',
              onAction: () => context.push(AppRoutes.membershipPlans),
            );
          }
          return RefreshableScroll(
            onRefresh: () => ref.refresh(myMembershipProvider.future),
            children: [
              AppCard(
                child: Column(
                  children: [
                    const StatusLabel('Đang hiệu lực', StatusTone.success).tag(icon: AppIcons.success),
                    const SizedBox(height: AppSpacing.md),
                    Container(
                      decoration: const BoxDecoration(color: AppPalette.white, borderRadius: AppRadius.sheetAll),
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      child: QrImageView(
                        data: user.id,
                        size: 200,
                        semanticsLabel: 'Mã QR thẻ thành viên',
                        eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: c.primary),
                        dataModuleStyle: QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: c.primary),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(user.fullName, style: context.text.title, textAlign: TextAlign.center),
                    Text(m.plan.name, style: context.text.small.copyWith(color: c.textMuted)),
                    const SizedBox(height: AppSpacing.md),
                    KeyValueRow(label: 'Hết hạn', value: VnTime.date(m.endDate)),
                    KeyValueRow(
                      label: 'Còn lại',
                      value: '${m.daysLeft} ngày',
                      emphasize: true,
                      valueColor: m.daysLeft <= 3 ? c.errorText : c.successText,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                'Đưa mã này cho HLV hoặc Quản lý quét khi vào phòng tập.',
                textAlign: TextAlign.center,
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton.outline(
                label: 'Gia hạn / mua thêm gói',
                icon: AppIcons.add,
                expand: true,
                onPressed: () => context.push(AppRoutes.membershipPlans),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// HLV / Quản lý quét QR thẻ thành viên ⇒ gói còn hay hết hạn. Kết quả tự ẩn sau 5 giây để quét tiếp.
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
    final userId = raw.trim();
    if (_processing || _result != null || userId.isEmpty) return;
    setState(() => _processing = true);
    await _controller.stop();
    try {
      final result = await ref.read(membershipRepositoryProvider).verify(userId);
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
                          'Quét mã QR trong màn "Thẻ thành viên" của hội viên.',
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
        ? 'Còn ${r.daysLeft} ngày'
        : r.status == null
        ? 'Chưa có membership'
        : 'Membership đã hết hạn';
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
          if (r.endDate != null)
            Text('${r.isActive ? 'Hết hạn' : 'Đã hết hạn'} ${VnTime.date(r.endDate!)}', style: context.text.small),
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
    final m = ref.watch(myMembershipProvider).value;
    final active = m != null && m.isActive;
    final c = context.colors;
    return Align(
      alignment: Alignment.centerLeft,
      child: ActionChip(
        avatar: Icon(AppIcons.membership, size: AppSizes.icon, color: active ? c.successText : c.primary),
        label: Text(active ? 'Gói tập còn ${m.daysLeft} ngày' : 'Mua gói tập'),
        onPressed: () => context.push(active ? AppRoutes.membershipCard : AppRoutes.membershipPlans),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../classes/presentation/providers/course_providers.dart';
import '../../data/refund_repository_provider.dart';
import '../../domain/entities/refund.dart';
import '../providers/refund_providers.dart';
import '../refund_labels.dart';

/// M07 — Yêu cầu hủy khóa & hoàn tiền (≥ 24h trước khai giảng).
class CancelCourseScreen extends ConsumerStatefulWidget {
  const CancelCourseScreen({super.key, required this.classId});

  final String classId;

  @override
  ConsumerState<CancelCourseScreen> createState() => _CancelCourseScreenState();
}

class _CancelCourseScreenState extends ConsumerState<CancelCourseScreen> with SubmittingState {
  final _note = TextEditingController();
  final _bankName = TextEditingController();
  final _accountNumber = TextEditingController();
  final _accountName = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    _bankName.dispose();
    _accountNumber.dispose();
    _accountName.dispose();
    super.dispose();
  }

  Future<void> _submit(String className) async {
    // Tài khoản nhận tiền: điền đủ cả 3 trường hoặc bỏ trống hết.
    final bank = [_bankName, _accountNumber, _accountName].map((c) => c.text.trim());
    if (bank.any((v) => v.isNotEmpty) && bank.any((v) => v.isEmpty)) {
      setState(() => formError = 'Vui lòng điền đủ Ngân hàng, Số tài khoản và Chủ tài khoản, hoặc bỏ trống cả ba.');
      return;
    }
    final ok = await showConfirmSheet(
      context: context,
      title: 'Gửi yêu cầu hủy khóa?',
      message:
          'Sau khi gửi, Quản lý sẽ chuyển khoản hoàn tiền rồi duyệt yêu cầu. Khi được duyệt, mọi chỗ của bạn trong khóa "$className" sẽ bị hủy.',
      confirmLabel: 'Gửi yêu cầu',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final refund = await submit(
      () => ref
          .read(refundRepositoryProvider)
          .requestCancellation(
            widget.classId,
            note: _note.text,
            bankName: _bankName.text,
            bankAccountNumber: _accountNumber.text,
            bankAccountName: _accountName.text.toUpperCase(),
          ),
    );
    if (refund == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã gửi yêu cầu hoàn tiền ${Money.format(refund.amount)}.');
    context.pushReplacement(AppRoutes.refunds);
  }

  @override
  Widget build(BuildContext context) {
    final eligibility = ref.watch(cancellationEligibilityProvider(widget.classId));
    final course = ref.watch(courseDetailProvider(widget.classId)).value?.course;
    final c = context.colors;
    return AppScaffold(
      title: 'Hủy khóa học',
      body: AsyncValueView(
        value: eligibility,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(cancellationEligibilityProvider(widget.classId)),
        data: (e) => ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            if (course != null) ...[
              Text(course.name, style: context.text.title),
              Text('HLV ${course.coach.fullName}', style: context.text.small.copyWith(color: c.textMuted)),
              const SizedBox(height: AppSpacing.md),
            ],
            AppCard(
              child: Column(
                children: [
                  KeyValueRow(label: 'Số tiền đã thanh toán', value: Money.format(e.paidAmount)),
                  KeyValueRow(
                    label: 'Dự kiến được hoàn',
                    value: Money.format(e.estimatedRefund),
                    emphasize: true,
                    valueColor: c.successText,
                  ),
                  if (e.deadline != null) KeyValueRow(label: 'Hạn hủy khóa', value: VnTime.dateTime(e.deadline!)),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Số tiền chính thức do hệ thống tính khi tạo yêu cầu.',
              style: context.text.caption.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: AppSpacing.md),
            if (!e.allowed)
              AlertBanner.error(title: 'Không thể hủy khóa', message: e.blockReason!)
            else ...[
              if (e.deadline != null)
                AlertBanner.info(
                  title: 'Bạn còn ${VnTime.durationLabel(e.deadline!.difference(DateTime.now()))} để hủy',
                  message: 'Yêu cầu chỉ được chấp nhận khi còn ít nhất 24 giờ trước buổi khai giảng.',
                ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Lý do hủy (không bắt buộc)',
                controller: _note,
                maxLines: 3,
                maxLength: 500,
                hint: 'VD: Trùng lịch công tác',
              ),
              const SizedBox(height: AppSpacing.md),
              Text('Thông tin nhận hoàn tiền (tuỳ chọn)', style: context.text.label),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                'Điền để Quản lý chuyển khoản đúng tài khoản. Bỏ trống nếu bạn sẽ liên hệ trực tiếp.',
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(label: 'Ngân hàng', controller: _bankName, hint: 'VD: MBBank'),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                label: 'Số tài khoản',
                controller: _accountNumber,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                label: 'Chủ tài khoản',
                controller: _accountName,
                textCapitalization: TextCapitalization.characters,
              ),
              if (formError != null) ...[const SizedBox(height: AppSpacing.sm), AlertBanner.error(message: formError!)],
              const SizedBox(height: AppSpacing.md),
              AppButton.danger(
                label: 'Gửi yêu cầu hủy khóa',
                expand: true,
                loading: submitting,
                onPressed: () => _submit(course?.name ?? ''),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// M08 — Theo dõi yêu cầu hoàn tiền.
class RefundsScreen extends ConsumerWidget {
  const RefundsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(myRefundsProvider);
    return AppScaffold(
      title: 'Hoàn tiền',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(myRefundsProvider),
        isEmpty: (l) => l.isEmpty,
        empty: const EmptyState(
          icon: AppIcons.refund,
          title: 'Chưa có yêu cầu hoàn tiền',
          message: 'Yêu cầu hủy khóa và hoàn tiền buổi bị hủy sẽ hiển thị ở đây.',
        ),
        data: (list) => RefreshableList(
          onRefresh: () => ref.refresh(myRefundsProvider.future),
          itemCount: list.length,
          itemBuilder: (context, i) => RefundCard(refund: list[i]),
        ),
      ),
    );
  }
}

/// Thẻ yêu cầu hoàn tiền + dòng thời gian trạng thái.
class RefundCard extends StatelessWidget {
  const RefundCard({super.key, required this.refund, this.onTap, this.showMember = false});

  final Refund refund;
  final VoidCallback? onTap;
  final bool showMember;

  @override
  Widget build(BuildContext context) {
    final r = refund;
    final c = context.colors;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(r.className, style: context.text.bodyStrong)),
              r.status.status.tag(),
            ],
          ),
          Text(
            [
              r.reason.label,
              if (r.sessionStart != null) 'buổi ${VnTime.dayLabel(r.sessionStart!)}',
              if (showMember) r.memberName,
            ].join(' · '),
            style: context.text.caption.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: AppSpacing.xs),
          MoneyText(r.amount, style: context.text.titleSmall.copyWith(color: c.primary)),
          if (onTap == null) ...[
            const SizedBox(height: AppSpacing.sm),
            TimelineList(
              entries: [
                TimelineEntry(title: 'Gửi yêu cầu', subtitle: VnTime.dateTime(r.createdAt), tone: StatusTone.success),
                TimelineEntry(
                  title: switch (r.status) {
                    RefundStatus.pending => 'Chờ Quản lý chuyển khoản & duyệt',
                    RefundStatus.completed => 'Đã hoàn tiền',
                    RefundStatus.rejected => 'Bị từ chối',
                    RefundStatus.cancelled => 'Đã hủy yêu cầu',
                  },
                  subtitle: r.processedAt == null ? null : VnTime.dateTime(r.processedAt!),
                  tone: r.status.status.tone,
                  done: r.status != RefundStatus.pending,
                  body: switch (r.status) {
                    RefundStatus.rejected when r.rejectReason != null => Text(
                      'Lý do: ${r.rejectReason}',
                      style: context.text.small,
                    ),
                    RefundStatus.completed when r.processedNote != null => Text(
                      r.processedNote!,
                      style: context.text.small,
                    ),
                    _ => null,
                  },
                ),
              ],
            ),

          ],
          if (onTap == null && r.bankInfo != null) ...[
            const SizedBox(height: AppSpacing.sm),
            const Divider(),
            KeyValueRow(label: 'Ngân hàng', value: r.bankInfo!.bankName),
            KeyValueRow(label: 'Số tài khoản', value: r.bankInfo!.accountNumber),
            KeyValueRow(label: 'Chủ tài khoản', value: r.bankInfo!.accountName),
            if (r.bankInfo!.vietQrUrl != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Center(
                child: SizedBox.square(
                  dimension: 180,
                  child: AppNetworkImage(
                    url: r.bankInfo!.vietQrUrl,
                    placeholderIcon: AppIcons.qr,
                    seed: r.id,
                    semanticLabel: 'Mã VietQR nhận hoàn tiền',
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                'Mã QR để Quản lý quét chuyển tiền',
                textAlign: TextAlign.center,
                style: context.text.caption.copyWith(color: c.textMuted),
              ),
            ],
          ],
          if (onTap == null && r.status == RefundStatus.pending) ...[
            const SizedBox(height: AppSpacing.md),
            _CancelRefundButton(refundId: r.id),
          ],
        ],
      ),
    );
  }
}

/// Nút hủy yêu cầu hoàn tiền — chỉ hiển thị khi PENDING và ở màn chi tiết Member.
class _CancelRefundButton extends ConsumerStatefulWidget {
  const _CancelRefundButton({required this.refundId});

  final String refundId;

  @override
  ConsumerState<_CancelRefundButton> createState() => _CancelRefundButtonState();
}

class _CancelRefundButtonState extends ConsumerState<_CancelRefundButton> with SubmittingState {
  Future<void> _cancel() async {
    final ok = await showConfirmSheet(
      context: context,
      title: 'Hủy yêu cầu hoàn tiền?',
      message: 'Yêu cầu sẽ bị hủy và không thể khôi phục.',
      confirmLabel: 'Hủy yêu cầu',
      destructive: true,
    );
    if (!ok || !mounted) return;
    await submit(() => ref.read(refundRepositoryProvider).cancelRequest(widget.refundId));
    if (!mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã hủy yêu cầu hoàn tiền.');
  }

  @override
  Widget build(BuildContext context) {
    return AppButton.danger(
      label: 'Hủy yêu cầu hoàn tiền',
      expand: true,
      loading: submitting,
      onPressed: _cancel,
    );
  }
}

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

/// M07 — Hủy khóa học (Doc/GYM_SCOPE_CHANGES.md §11):
/// - Còn ≥ 3 ngày trước khai giảng ⇒ yêu cầu hoàn 100% (Quản lý chuyển khoản rồi duyệt).
/// - Muộn hơn ⇒ chọn "Hủy không hoàn tiền" hoặc "Hủy và xin hoàn ngoại lệ" (giá trị buổi chưa học − phí chiết khấu,
///   Quản lý xem xét). Hai lựa chọn hủy muộn đều hủy NGAY các buổi sắp tới.
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

  /// Hủy muộn: true = xin hoàn ngoại lệ, false = hủy không hoàn.
  bool _lateRefund = true;

  @override
  void dispose() {
    _note.dispose();
    _bankName.dispose();
    _accountNumber.dispose();
    _accountName.dispose();
    super.dispose();
  }

  Future<void> _submit(String className, CancellationEligibility e) async {
    final wantsRefund = e.fullRefund || _lateRefund;
    // Tài khoản nhận tiền: điền đủ cả 3 trường hoặc bỏ trống hết.
    final bank = [_bankName, _accountNumber, _accountName].map((c) => c.text.trim());
    if (wantsRefund && bank.any((v) => v.isNotEmpty) && bank.any((v) => v.isEmpty)) {
      setState(() => formError = 'Vui lòng điền đủ Ngân hàng, Số tài khoản và Chủ tài khoản, hoặc bỏ trống cả ba.');
      return;
    }
    final ok = await showConfirmSheet(
      context: context,
      title: e.fullRefund ? 'Gửi yêu cầu hủy khóa?' : 'Hủy khóa học?',
      message: e.fullRefund
          ? 'Quản lý sẽ chuyển khoản hoàn tiền rồi duyệt yêu cầu. Khi được duyệt, mọi chỗ của bạn trong khóa "$className" sẽ bị hủy.'
          : 'Mọi buổi sắp tới của bạn trong khóa "$className" sẽ bị hủy NGAY và không thể khôi phục.',
      warning: e.fullRefund
          ? null
          : (_lateRefund
                ? 'Yêu cầu hoàn ngoại lệ chưa chắc được chấp nhận. Nếu được chấp nhận, bạn nhận ~${Money.format(e.lateRefund?.estimatedAmount ?? 0)} (đã trừ phí ${e.lateRefund?.feePercent ?? 0}%, Quản lý có thể điều chỉnh).'
                : 'Bạn sẽ KHÔNG được hoàn tiền.'),
      confirmLabel: e.fullRefund ? 'Gửi yêu cầu' : 'Hủy khóa',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final result = await submit(
      () => ref
          .read(refundRepositoryProvider)
          .requestCancellation(
            widget.classId,
            note: _note.text,
            bankName: wantsRefund ? _bankName.text : null,
            bankAccountNumber: wantsRefund ? _accountNumber.text : null,
            bankAccountName: wantsRefund ? _accountName.text.toUpperCase() : null,
            lateRefund: !e.fullRefund && _lateRefund,
          ),
    );
    if (result == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, switch (result.mode) {
      CancellationMode.refundRequested => 'Đã gửi yêu cầu hoàn tiền ${Money.format(result.refund?.amount ?? 0)}.',
      CancellationMode.lateRefundRequested =>
        'Đã hủy khóa và gửi yêu cầu hoàn ngoại lệ (dự kiến ${Money.format(result.refund?.amount ?? 0)}).',
      CancellationMode.cancelledNoRefund =>
        'Đã hủy ${result.cancelledSessions} buổi sắp tới. Khóa học không được hoàn tiền.',
    });
    if (result.refund != null) {
      context.pushReplacement(AppRoutes.refunds);
    } else {
      context.pop();
    }
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
        data: (e) {
          final late = e.lateRefund;
          final wantsRefund = e.fullRefund || _lateRefund;
          return ListView(
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
                    if (e.fullRefund)
                      KeyValueRow(
                        label: 'Dự kiến được hoàn (100%)',
                        value: Money.format(e.estimatedRefund),
                        emphasize: true,
                        valueColor: c.successText,
                      )
                    else if (late != null) ...[
                      KeyValueRow(
                        label: 'Giá trị buổi chưa học (${late.futureSessions}/${late.totalSessions} buổi)',
                        value: Money.format(late.grossAmount),
                      ),
                      KeyValueRow(label: 'Phí chiết khấu dự kiến', value: '${late.feePercent}%'),
                      KeyValueRow(
                        label: 'Hoàn ngoại lệ dự kiến',
                        value: Money.format(late.estimatedAmount),
                        emphasize: true,
                        valueColor: c.successText,
                      ),
                    ],
                    if (e.deadline != null)
                      KeyValueRow(label: 'Hạn hủy được hoàn 100%', value: VnTime.dateTime(e.deadline!)),
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
                if (e.fullRefund && e.deadline != null)
                  AlertBanner.info(
                    title:
                        'Bạn còn ${VnTime.durationLabel(e.deadline!.difference(DateTime.now()))} để hủy được hoàn 100%',
                    message: 'Hủy trước buổi khai giảng ít nhất 3 ngày được hoàn toàn bộ học phí.',
                  )
                else ...[
                  const AlertBanner.warning(
                    title: 'Đã qua hạn hủy được hoàn tiền',
                    message: 'Khóa học khai giảng trong vòng 3 ngày (hoặc đã khai giảng). Bạn vẫn có thể hủy:',
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  ChoiceCard(
                    icon: AppIcons.refund,
                    title: 'Hủy và xin hoàn ngoại lệ',
                    description:
                        'Quản lý xem xét. Nếu chấp nhận: hoàn giá trị các buổi chưa học sau khi trừ phí chiết khấu '
                        '(dự kiến ${late?.feePercent ?? 0}%).',
                    selected: _lateRefund,
                    onTap: () {
                      if (late?.available ?? false) {
                        setState(() => _lateRefund = true);
                      } else {
                        AppSnackbar.info(context, 'Khóa không còn buổi nào chưa học để xin hoàn tiền.');
                      }
                    },
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  ChoiceCard(
                    icon: AppIcons.ban,
                    title: 'Hủy không hoàn tiền',
                    description: 'Hủy ngay mọi buổi sắp tới, không phát sinh yêu cầu hoàn tiền.',
                    selected: !_lateRefund || !(late?.available ?? false),
                    onTap: () => setState(() => _lateRefund = false),
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                AppTextField(
                  label: 'Lý do hủy (không bắt buộc)',
                  controller: _note,
                  maxLines: 3,
                  maxLength: 500,
                  hint: 'VD: Chuyển công tác, chấn thương…',
                ),
                if (wantsRefund) ...[
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
                ],
                if (formError != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AlertBanner.error(message: formError!),
                ],
                const SizedBox(height: AppSpacing.md),
                AppButton.danger(
                  label: e.fullRefund
                      ? 'Gửi yêu cầu hủy khóa'
                      : (_lateRefund && (late?.available ?? false)
                            ? 'Hủy & gửi yêu cầu hoàn'
                            : 'Hủy khóa (không hoàn)'),
                  expand: true,
                  loading: submitting,
                  onPressed: () {
                    if (!(late?.available ?? false)) _lateRefund = false;
                    _submit(course?.name ?? '', e);
                  },
                ),
              ],
            ],
          );
        },
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
    return AppButton.danger(label: 'Hủy yêu cầu hoàn tiền', expand: true, loading: submitting, onPressed: _cancel);
  }
}

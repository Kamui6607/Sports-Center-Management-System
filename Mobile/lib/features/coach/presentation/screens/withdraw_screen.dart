import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/coach_repository_provider.dart';
import '../../domain/entities/wallet.dart';
import '../providers/coach_providers.dart';

/// H13 — Tạo lệnh rút tiền (≤ số dư khả dụng). Quản lý chuyển khoản rồi duyệt.
class WithdrawScreen extends ConsumerWidget {
  const WithdrawScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(coachWalletProvider);
    return AppScaffold(
      title: 'Rút tiền',
      body: AsyncValueView(
        value: wallet,
        loading: const SkeletonDetail(),
        onRetry: () => ref.invalidate(coachWalletProvider),
        data: (w) => _Form(wallet: w),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.wallet});

  final CoachWallet wallet;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _bank = TextEditingController();
  final _account = TextEditingController();
  late final _holder = TextEditingController(text: ref.read(currentUserProvider)?.fullName.toUpperCase());
  final _note = TextEditingController();

  @override
  void dispose() {
    for (final c in [_amount, _bank, _account, _holder, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final amount = Money.parseInput(_amount.text)!;
    final ok = await showConfirmSheet(
      context: context,
      title: 'Xác nhận rút tiền',
      message:
          'Rút ${Money.format(amount)} về ${_bank.text.trim()} — ${_account.text.trim()} (${_holder.text.trim()}).',
      confirmLabel: 'Gửi lệnh rút',
    );
    if (!ok || !mounted) return;
    final tx = await submit(
      () => ref
          .read(coachRepositoryProvider)
          .withdraw(
            amount: amount,
            bank: BankInfo(
              bankName: _bank.text.trim(),
              accountNumber: _account.text.trim(),
              accountName: _holder.text.trim(),
            ),
            note: _note.text,
          ),
    );
    if (tx == null || !mounted) return;
    ref.read(dataRevisionProvider.notifier).bump();
    AppSnackbar.success(context, 'Đã gửi lệnh rút ${Money.format(tx.amount)}. Vui lòng chờ Quản lý duyệt.');
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget.wallet;
    final c = context.colors;
    return Form(
      key: _form,
      child: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          AppCard(
            child: Column(
              children: [
                KeyValueRow(label: 'Số dư ví', value: Money.format(w.balance)),
                KeyValueRow(label: 'Đang tạm giữ cho hoàn tiền', value: Money.format(w.pendingRefundHold)),
                const Divider(),
                KeyValueRow(
                  label: 'Có thể rút',
                  value: Money.format(w.available),
                  emphasize: true,
                  valueColor: c.successText,
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (!w.canWithdraw)
            AlertBanner.warning(
              title: 'Chưa đủ điều kiện rút tiền',
              message: w.checks.where((x) => !x.passed).map((x) => '• ${x.detail ?? x.label}').join('\n'),
            )
          else ...[
            MoneyInput(
              label: 'Số tiền muốn rút',
              requiredField: true,
              controller: _amount,
              errorText: fieldErrors['amount'],
              validator: (v) {
                final a = Money.parseInput(v ?? '');
                if (a == null || a <= 0) return 'Nhập số tiền lớn hơn 0';
                if (a > w.available) return 'Tối đa ${Money.format(w.available)}';
                return null;
              },
            ),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => _amount.text = Money.plain(w.available),
                child: const Text('Rút tối đa'),
              ),
            ),
            AppTextField(
              label: 'Ngân hàng',
              requiredField: true,
              controller: _bank,
              hint: 'VD: Vietcombank',
              prefixIcon: AppIcons.bank,
              validator: (v) => Validators.required(v, 'Ngân hàng'),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Số tài khoản',
              requiredField: true,
              controller: _account,
              keyboardType: TextInputType.number,
              validator: (v) => Validators.required(v, 'Số tài khoản'),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Chủ tài khoản',
              requiredField: true,
              controller: _holder,
              textCapitalization: TextCapitalization.characters,
              helper: 'Phải trùng tên HLV để Quản lý chuyển khoản',
              validator: (v) => Validators.required(v, 'Chủ tài khoản'),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(label: 'Ghi chú', controller: _note, maxLines: 2),
            if (formError != null && fieldErrors.isEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              AlertBanner.error(message: formError!),
            ],
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Gửi lệnh rút tiền', expand: true, loading: submitting, onPressed: _submit),
          ],
        ],
      ),
    );
  }
}

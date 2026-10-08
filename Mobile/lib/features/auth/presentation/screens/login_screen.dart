import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../mock/demo_accounts.dart';
import '../providers/session_provider.dart';

/// A03 — Đăng nhập.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.initialEmail, this.from});

  final String? initialEmail;

  /// Màn định vào trước khi bị yêu cầu đăng nhập.
  final String? from;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with SubmittingState {
  final _form = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.initialEmail);
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    await submit(() => ref.read(sessionProvider.notifier).login(_email.text, _password.text));
    // Thành công: router tự chuyển về đúng màn theo vai trò.
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return AppScaffold(
      title: 'Đăng nhập',
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(context.screenPadding),
          child: AutofillGroup(
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: AppSpacing.sm),
                  const Align(alignment: Alignment.centerLeft, child: BrandLogo()),
                  const SizedBox(height: AppSpacing.lg),
                  Text('Chào mừng trở lại!', style: context.text.headline),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    widget.from != null
                        ? 'Đăng nhập để tiếp tục thao tác của bạn.'
                        : 'Đăng nhập để tiếp tục tập luyện.',
                    style: context.text.small.copyWith(color: c.textMuted),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (formError != null) ...[
                    AlertBanner.error(message: formError!),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  AppTextField(
                    label: 'Email',
                    controller: _email,
                    hint: 'ban@email.com',
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.email],
                    prefixIcon: AppIcons.mail,
                    validator: Validators.email,
                    enabled: !submitting,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    label: 'Mật khẩu',
                    controller: _password,
                    obscure: true,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.password],
                    prefixIcon: AppIcons.lock,
                    validator: Validators.password,
                    onSubmitted: (_) => _submit(),
                    enabled: !submitting,
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => context.push(AppRoutes.forgotPassword),
                      child: Text('Quên mật khẩu?', style: context.text.label.copyWith(color: c.primary)),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  AppButton(label: 'Đăng nhập', expand: true, loading: submitting, onPressed: _submit),
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Chưa có tài khoản?', style: context.text.small),
                      TextButton(
                        onPressed: () => context.pushReplacement(AppRoutes.register),
                        child: Text('Đăng ký', style: context.text.label.copyWith(color: c.primary)),
                      ),
                    ],
                  ),
                  if (Env.useMock) ...[
                    const SizedBox(height: AppSpacing.lg),
                    _DemoAccounts(
                      onPick: (a) {
                        _email.text = a.email;
                        _password.text = a.password;
                        _submit();
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DemoAccounts extends StatelessWidget {
  const _DemoAccounts({required this.onPick});

  final ValueChanged<DemoAccount> onPick;

  @override
  Widget build(BuildContext context) => AppCard(
    color: context.colors.surfaceMuted,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(AppIcons.sparkles, size: AppSizes.iconSm, color: context.colors.accentStrong),
            const SizedBox(width: AppSpacing.xs),
            Expanded(child: Text('Tài khoản demo (chế độ mock)', style: context.text.label)),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [for (final a in demoAccounts) AppChip(label: a.label, onTap: () => onPick(a))],
        ),
      ],
    ),
  );
}

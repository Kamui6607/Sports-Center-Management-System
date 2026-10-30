import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../mock/demo_accounts.dart';
import '../../data/auth_repository_provider.dart';

/// A05 — Quên mật khẩu: nhập email để nhận mã OTP 6 số (BE gửi kèm liên kết cho Web).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    var ok = false;
    await submit(() async {
      await ref.read(authRepositoryProvider).requestPasswordReset(_email.text.trim());
      ok = true;
    });
    if (ok && mounted) {
      context.pushReplacement('${AppRoutes.resetPassword}?email=${Uri.encodeComponent(_email.text.trim())}');
    }
  }

  @override
  Widget build(BuildContext context) => AppScaffold(
    title: 'Quên mật khẩu',
    body: SingleChildScrollView(
      padding: EdgeInsets.all(context.screenPadding),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(AppIcons.lock, size: AppSizes.iconXl, color: context.colors.primary),
            const SizedBox(height: AppSpacing.md),
            Text('Lấy lại mật khẩu', style: context.text.headline),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Nhập email đã đăng ký. Chúng tôi sẽ gửi mã xác nhận gồm 6 chữ số (hiệu lực 15 phút).',
              style: context.text.small.copyWith(color: context.colors.textMuted),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (formError != null) ...[AlertBanner.error(message: formError!), const SizedBox(height: AppSpacing.md)],
            AppTextField(
              label: 'Email',
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              prefixIcon: AppIcons.mail,
              validator: Validators.email,
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Gửi mã xác nhận', expand: true, loading: submitting, onPressed: _submit),
          ],
        ),
      ),
    ),
  );
}

/// A06 — Đặt lại mật khẩu bằng OTP 6 số (Q8).
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.email});

  final String email;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> with SubmittingState {
  /// BE chỉ cho gửi lại mã sau 60 giây (`resendAfterSeconds`).
  static const resendCooldown = 60;

  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String _otp = '';
  String? _otpError;
  int _resendIn = resendCooldown;
  bool _resending = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startCountdown();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  void _startCountdown() {
    _timer?.cancel();
    setState(() => _resendIn = resendCooldown);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn--);
      if (_resendIn <= 0) t.cancel();
    });
  }

  Future<void> _resend() async {
    setState(() => _resending = true);
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(widget.email);
      if (!mounted) return;
      AppSnackbar.success(context, 'Đã gửi lại mã xác nhận.');
      _startCountdown();
    } on Object catch (e) {
      if (mounted) AppSnackbar.error(context, AppFailure.from(e));
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _submit() async {
    final otpError = Validators.otp(_otp);
    setState(() => _otpError = otpError);
    if (!_form.currentState!.validate() || otpError != null) return;
    var ok = false;
    await submit(() async {
      await ref.read(authRepositoryProvider).resetPassword(email: widget.email, otp: _otp, newPassword: _password.text);
      ok = true;
    });
    if (!mounted) return;
    if (fieldErrors['otp'] != null) setState(() => _otpError = fieldErrors['otp']);
    if (ok) {
      AppSnackbar.success(context, 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập.');
      context.go('${AppRoutes.login}?email=${Uri.encodeComponent(widget.email)}');
    }
  }

  @override
  Widget build(BuildContext context) => AppScaffold(
    title: 'Đặt lại mật khẩu',
    body: SingleChildScrollView(
      padding: EdgeInsets.all(context.screenPadding),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Nhập mã xác nhận', style: context.text.headline),
            const SizedBox(height: AppSpacing.xs),
            Text.rich(
              TextSpan(
                text: 'Mã 6 số đã được gửi tới ',
                children: [TextSpan(text: widget.email, style: context.text.label)],
              ),
              style: context.text.small.copyWith(color: context.colors.textMuted),
            ),
            if (Env.useMock) ...[
              const SizedBox(height: AppSpacing.sm),
              const AlertBanner.info(message: 'Chế độ demo: mã xác nhận là $kDemoOtp.'),
            ],
            const SizedBox(height: AppSpacing.lg),
            CodeInput(onCompleted: (v) => _otp = v, onChanged: (v) => _otp = v, errorText: _otpError),
            const SizedBox(height: AppSpacing.lg),
            if (formError != null && fieldErrors.isEmpty) ...[
              AlertBanner.error(message: formError!),
              const SizedBox(height: AppSpacing.md),
            ],
            AppTextField(
              label: 'Mật khẩu mới',
              controller: _password,
              obscure: true,
              helper: 'Tối thiểu 6 ký tự',
              validator: Validators.password,
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Xác nhận mật khẩu mới',
              controller: _confirm,
              obscure: true,
              validator: Validators.confirm(() => _password.text),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(label: 'Đặt lại mật khẩu', expand: true, loading: submitting, onPressed: _submit),
            TextButton(
              onPressed: submitting || _resending || _resendIn > 0 ? null : _resend,
              child: Text(_resendIn > 0 ? 'Gửi lại mã sau ${_resendIn}s' : 'Gửi lại mã'),
            ),
          ],
        ),
      ),
    ),
  );
}

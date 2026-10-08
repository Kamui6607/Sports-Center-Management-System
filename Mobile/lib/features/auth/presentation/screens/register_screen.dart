import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../domain/entities/app_user.dart';
import '../../domain/entities/auth_models.dart';
import '../auth_labels.dart';
import '../providers/session_provider.dart';
import '../widgets/gender_birthday_fields.dart';

/// A04 — Đăng ký 2 bước: chọn vai trò ⇒ thông tin tài khoản.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  int _step = 0;
  UserRole _role = UserRole.member;
  Gender? _gender;
  DateTime? _dob;

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    final input = RegisterInput(
      fullName: _name.text,
      email: _email.text,
      password: _password.text,
      role: _role,
      phone: _phone.text,
      gender: _gender,
      dateOfBirth: _dob,
    );
    var done = false;
    final session = await submit(() async {
      final s = await ref.read(sessionProvider.notifier).register(input);
      done = true;
      return s;
    });
    if (!mounted || !done) return;
    if (session == null) {
      // Member: BE không trả token ⇒ mời đăng nhập.
      AppSnackbar.success(context, 'Đăng ký thành công! Vui lòng đăng nhập.');
      context.pushReplacement('${AppRoutes.login}?email=${Uri.encodeComponent(_email.text.trim())}');
    }
    // Coach: router tự chuyển sang màn nộp CV.
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step = 0);
      },
      child: AppScaffold(
        title: 'Tạo tài khoản',
        body: SafeArea(
          child: SingleChildScrollView(
            padding: EdgeInsets.all(context.screenPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                StepIndicator(steps: const ['Vai trò', 'Thông tin'], current: _step),
                const SizedBox(height: AppSpacing.lg),
                if (_step == 0) _roleStep(context) else _infoStep(context),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _roleStep(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text('Bạn muốn tham gia với vai trò nào?', style: context.text.title),
      const SizedBox(height: AppSpacing.md),
      ChoiceCard(
        icon: AppIcons.users,
        title: 'Học viên',
        description: 'Mua khóa học, xem lịch tập, điểm danh QR, mua sản phẩm và nhận lộ trình từ HLV.',
        selected: _role == UserRole.member,
        onTap: () => setState(() => _role = UserRole.member),
      ),
      const SizedBox(height: AppSpacing.sm),
      ChoiceCard(
        icon: AppIcons.graduation,
        title: 'Huấn luyện viên',
        description: 'Tự mở khóa học và định giá, nhận 85% doanh thu vào ví. Cần nộp CV (PDF) và chờ Quản lý duyệt.',
        selected: _role == UserRole.coach,
        onTap: () => setState(() => _role = UserRole.coach),
      ),
      const SizedBox(height: AppSpacing.lg),
      AppButton(label: 'Tiếp tục', expand: true, onPressed: () => setState(() => _step = 1)),
      const SizedBox(height: AppSpacing.sm),
      Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text('Đã có tài khoản?', style: context.text.small),
          TextButton(
            onPressed: () => context.pushReplacement(AppRoutes.login),
            child: Text('Đăng nhập', style: context.text.label.copyWith(color: context.colors.primary)),
          ),
        ],
      ),
    ],
  );

  Widget _infoStep(BuildContext context) => Form(
    key: _form,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text('Đăng ký ${_role.label.toLowerCase()}', style: context.text.title)),
            TextButton(
              onPressed: submitting ? null : () => setState(() => _step = 0),
              child: const Text('Đổi vai trò'),
            ),
          ],
        ),
        if (_role == UserRole.coach) ...[
          const SizedBox(height: AppSpacing.xs),
          const AlertBanner.info(
            message: 'Sau khi đăng ký, bạn sẽ nộp CV (PDF ≤ 10MB). Tài khoản được kích hoạt khi Quản lý duyệt hồ sơ.',
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        if (formError != null && fieldErrors.isEmpty) ...[
          AlertBanner.error(message: formError!),
          const SizedBox(height: AppSpacing.md),
        ],
        AppTextField(
          label: 'Họ và tên',
          requiredField: true,
          controller: _name,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.name],
          validator: Validators.fullName,
          errorText: fieldErrors['fullName'],
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Email',
          requiredField: true,
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          validator: Validators.email,
          errorText: fieldErrors['email'],
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Số điện thoại',
          controller: _phone,
          hint: 'VD: 0912345678',
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          validator: Validators.phoneOptional,
          errorText: fieldErrors['phone'],
        ),
        const SizedBox(height: AppSpacing.md),
        GenderBirthdayFields(
          gender: _gender,
          dateOfBirth: _dob,
          onGenderChanged: (v) => setState(() => _gender = v),
          onDateOfBirthChanged: (v) => setState(() => _dob = v),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Mật khẩu',
          requiredField: true,
          controller: _password,
          obscure: true,
          helper: 'Tối thiểu 6 ký tự',
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.newPassword],
          validator: Validators.password,
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          label: 'Xác nhận mật khẩu',
          requiredField: true,
          controller: _confirm,
          obscure: true,
          textInputAction: TextInputAction.done,
          validator: Validators.confirm(() => _password.text),
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _role == UserRole.coach ? 'Đăng ký & nộp CV' : 'Tạo tài khoản',
          expand: true,
          loading: submitting,
          onPressed: _submit,
        ),
      ],
    ),
  );
}

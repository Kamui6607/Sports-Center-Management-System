import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/icons/app_icons.dart';
import '../../../core/platform/file_service.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/data/auth_repository_provider.dart';
import '../../auth/domain/entities/app_user.dart';
import '../../auth/domain/entities/auth_models.dart';
import '../../auth/presentation/auth_labels.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../../auth/presentation/widgets/gender_birthday_fields.dart';

/// U01 — Sửa hồ sơ (chung + riêng Member / Coach). Email chỉ đọc.
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> with SubmittingState {
  final _form = GlobalKey<FormState>();
  late final AppUser _user = ref.read(currentUserProvider)!;
  late final _email = TextEditingController(text: _user.email);
  late final _name = TextEditingController(text: _user.fullName);
  late final _phone = TextEditingController(text: _user.phone);
  late final _goal = TextEditingController(text: _user.memberProfile?.fitnessGoal);
  late final _pref = TextEditingController(text: _user.memberProfile?.trainingPreference);
  late final _spec = TextEditingController(text: _user.coachProfile?.specialization);
  late final _years = TextEditingController(text: _user.coachProfile?.experienceYears?.toString());
  late final _bio = TextEditingController(text: _user.coachProfile?.bio);
  late Gender? _gender = _user.gender;
  late DateTime? _dob = _user.dateOfBirth;
  late TrainingLevel? _level = _user.memberProfile?.trainingLevel;
  bool _uploading = false;

  @override
  void dispose() {
    for (final c in [_email, _name, _phone, _goal, _pref, _spec, _years, _bio]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _changeAvatar() async {
    final fromCamera = await showAppBottomSheet<bool>(
      context: context,
      title: 'Đổi ảnh đại diện',
      builder: (ctx) => Column(
        children: [
          ListTile(
            leading: const Icon(AppIcons.camera),
            title: const Text('Chụp ảnh'),
            onTap: () => Navigator.of(ctx).pop(true),
          ),
          ListTile(
            leading: const Icon(AppIcons.image),
            title: const Text('Chọn từ thư viện'),
            onTap: () => Navigator.of(ctx).pop(false),
          ),
        ],
      ),
    );
    if (fromCamera == null || !mounted) return;
    setState(() => _uploading = true);
    final user = await runAction(context, () async {
      final file = await ref.read(fileServiceProvider).pickImage(fromCamera: fromCamera);
      if (file == null) return null;
      return ref.read(authRepositoryProvider).updateAvatar(file);
    }, success: null);
    if (!mounted) return;
    setState(() => _uploading = false);
    if (user != null) {
      ref.read(sessionProvider.notifier).updateUser(user);
      AppSnackbar.success(context, 'Đã cập nhật ảnh đại diện.');
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    final user = await submit(
      () => ref
          .read(authRepositoryProvider)
          .updateProfile(
            ProfileUpdate(
              fullName: _name.text,
              phone: _phone.text,
              gender: _gender,
              dateOfBirth: _dob,
              fitnessGoal: _goal.text.trim().isEmpty ? null : _goal.text.trim(),
              trainingLevel: _level,
              trainingPreference: _pref.text.trim().isEmpty ? null : _pref.text.trim(),
              specialization: _spec.text.trim().isEmpty ? null : _spec.text.trim(),
              experienceYears: int.tryParse(_years.text.trim()),
              bio: _bio.text.trim().isEmpty ? null : _bio.text.trim(),
            ),
          ),
    );
    if (user == null || !mounted) return;
    ref.read(sessionProvider.notifier).updateUser(user);
    AppSnackbar.success(context, 'Đã lưu hồ sơ.');
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider) ?? _user;
    return AppScaffold(
      title: 'Hồ sơ cá nhân',
      bottomBar: StickyBottomBar(
        child: AppButton(label: 'Lưu thay đổi', expand: true, loading: submitting, onPressed: _save),
      ),
      body: Form(
        key: _form,
        child: ListView(
          padding: EdgeInsets.all(context.screenPadding),
          children: [
            Center(
              child: Stack(
                children: [
                  AppAvatar(name: user.fullName, imageUrl: user.avatarUrl, size: AppSizes.avatarLg + AppSpacing.lg),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: IconButton.filled(
                      tooltip: 'Đổi ảnh đại diện',
                      onPressed: _uploading ? null : _changeAvatar,
                      style: IconButton.styleFrom(
                        backgroundColor: context.colors.accent,
                        foregroundColor: context.colors.onAccent,
                      ),
                      icon: _uploading
                          ? const SizedBox.square(
                              dimension: AppSizes.iconSm,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(AppIcons.camera, size: AppSizes.icon),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            if (formError != null && fieldErrors.isEmpty) ...[
              AlertBanner.error(message: formError!),
              const SizedBox(height: AppSpacing.md),
            ],
            AppTextField(label: 'Email', controller: _email, enabled: false, helper: 'Email không thể thay đổi'),
            const SizedBox(height: AppSpacing.md),
            AppTextField(label: 'Họ và tên', requiredField: true, controller: _name, validator: Validators.fullName),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: 'Số điện thoại',
              controller: _phone,
              keyboardType: TextInputType.phone,
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
            if (user.role == UserRole.member) ...[
              const SizedBox(height: AppSpacing.lg),
              Text('Hồ sơ tập luyện', style: context.text.titleSmall),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                label: 'Mục tiêu tập luyện',
                controller: _goal,
                hint: 'VD: Tăng cơ giảm mỡ, cải thiện sức bền…',
              ),
              const SizedBox(height: AppSpacing.md),
              SelectField<TrainingLevel>(
                label: 'Trình độ',
                options: [for (final l in TrainingLevel.values) SelectOption(l, l.label)],
                values: [?_level],
                onChanged: (v) => setState(() => _level = v.firstOrNull),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                label: 'Sở thích / lưu ý sức khỏe',
                controller: _pref,
                maxLines: 3,
                hint: 'Ghi chú cho HLV: chấn thương, khung giờ ưa thích…',
              ),
            ],
            if (user.role == UserRole.coach) ...[
              const SizedBox(height: AppSpacing.lg),
              Text('Hồ sơ chuyên môn', style: context.text.titleSmall),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(label: 'Chuyên môn', controller: _spec),
              const SizedBox(height: AppSpacing.md),
              AppTextField(label: 'Số năm kinh nghiệm', controller: _years, keyboardType: TextInputType.number),
              const SizedBox(height: AppSpacing.md),
              AppTextField(label: 'Giới thiệu', controller: _bio, maxLines: 4, maxLength: 500),
            ],
            const SizedBox(height: AppSpacing.xl),
          ],
        ),
      ),
    );
  }
}

/// U02 — Đổi mật khẩu.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> with SubmittingState {
  final _form = GlobalKey<FormState>();
  final _old = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    for (final c in [_old, _new, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    var ok = false;
    await submit(() async {
      await ref.read(authRepositoryProvider).changePassword(oldPassword: _old.text, newPassword: _new.text);
      ok = true;
    });
    if (!ok || !mounted) return;
    AppSnackbar.success(context, 'Đã đổi mật khẩu.');
    context.pop();
  }

  @override
  Widget build(BuildContext context) => AppScaffold(
    title: 'Đổi mật khẩu',
    body: Form(
      key: _form,
      child: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          AppTextField(
            label: 'Mật khẩu hiện tại',
            controller: _old,
            obscure: true,
            validator: Validators.password,
            errorText: fieldErrors['oldPassword'],
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Mật khẩu mới',
            controller: _new,
            obscure: true,
            helper: 'Tối thiểu 6 ký tự, khác mật khẩu hiện tại',
            validator: (v) =>
                Validators.password(v) ?? (v == _old.text ? 'Mật khẩu mới phải khác mật khẩu hiện tại' : null),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Xác nhận mật khẩu mới',
            controller: _confirm,
            obscure: true,
            validator: Validators.confirm(() => _new.text),
          ),
          if (formError != null && fieldErrors.isEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            AlertBanner.error(message: formError!),
          ],
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Đổi mật khẩu', expand: true, loading: submitting, onPressed: _save),
        ],
      ),
    ),
  );
}

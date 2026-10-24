import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/platform/file_service.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/auth_repository_provider.dart';
import '../../domain/entities/auth_models.dart';
import '../auth_labels.dart';
import '../providers/session_provider.dart';

/// Giới hạn CV theo BE (`POST /coaches/me/cv`).
const _maxCvBytes = 10 * 1024 * 1024;

/// O01 — Nộp hồ sơ CV (PDF ≤ 10MB).
class CvUploadScreen extends ConsumerStatefulWidget {
  const CvUploadScreen({super.key});

  @override
  ConsumerState<CvUploadScreen> createState() => _CvUploadScreenState();
}

class _CvUploadScreenState extends ConsumerState<CvUploadScreen> with SubmittingState {
  PickedFile? _file;
  String? _fileError;

  Future<void> _pick() async {
    try {
      final f = await ref.read(fileServiceProvider).pickPdf();
      if (f == null) return;
      setState(() {
        _file = f;
        _fileError = f.extension != 'pdf'
            ? 'CV phải là tệp PDF.'
            : (f.sizeBytes > _maxCvBytes ? 'Tệp ${f.sizeLabel} vượt quá giới hạn 10MB.' : null);
      });
    } on Object catch (e) {
      if (mounted) AppSnackbar.error(context, 'Không mở được trình chọn tệp: $e');
    }
  }

  Future<void> _submit() async {
    final f = _file;
    if (f == null) {
      setState(() => _fileError = 'Vui lòng chọn tệp CV (PDF).');
      return;
    }
    if (_fileError != null) return;
    final cert = await submit(() => ref.read(authRepositoryProvider).submitCv(f));
    if (cert == null || !mounted) return;
    ref.read(sessionProvider.notifier).updateCertification(cert);
    AppSnackbar.success(context, 'Đã nộp hồ sơ. Vui lòng chờ Quản lý xét duyệt.');
    context.go(AppRoutes.onboardingStatus);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final rejected = session?.certification?.status == CoachApprovalStatus.rejected;
    final c = context.colors;
    return AppScaffold(
      title: rejected ? 'Nộp lại hồ sơ' : 'Nộp hồ sơ HLV',
      actions: [_LogoutButton()],
      bottomBar: StickyBottomBar(
        child: AppButton(
          label: 'Gửi hồ sơ',
          icon: AppIcons.upload,
          expand: true,
          loading: submitting,
          onPressed: _submit,
        ),
      ),
      body: ListView(
        padding: EdgeInsets.all(context.screenPadding),
        children: [
          Text('Xin chào ${session?.user.fullName ?? ''}!', style: context.text.title),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Để mở khóa học trên Pulse, hãy nộp CV (PDF) gồm kinh nghiệm và chứng chỉ huấn luyện. Quản lý trung tâm sẽ xét duyệt trong 1–3 ngày làm việc.',
            style: context.text.small.copyWith(color: c.textMuted),
          ),
          if (rejected && session?.certification?.rejectReason != null) ...[
            const SizedBox(height: AppSpacing.md),
            AlertBanner.error(title: 'Lý do hồ sơ trước bị từ chối', message: session!.certification!.rejectReason!),
          ],
          const SizedBox(height: AppSpacing.lg),
          const TimelineList(
            entries: [
              TimelineEntry(title: 'Đăng ký tài khoản', subtitle: 'Hoàn tất', tone: StatusTone.success),
              TimelineEntry(title: 'Nộp CV (PDF)', subtitle: 'Bước hiện tại', tone: StatusTone.brand),
              TimelineEntry(title: 'Quản lý xét duyệt', done: false),
              TimelineEntry(title: 'Bắt đầu mở khóa học', done: false),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Tệp CV', style: context.text.label),
          const SizedBox(height: AppSpacing.xs),
          FilePickerTile(
            file: _file,
            hint: 'Chỉ nhận PDF, tối đa 10MB',
            errorText: _fileError,
            enabled: !submitting,
            onPick: _pick,
            onClear: () => setState(() {
              _file = null;
              _fileError = null;
            }),
          ),
          if (formError != null) ...[const SizedBox(height: AppSpacing.md), AlertBanner.error(message: formError!)],
        ],
      ),
    );
  }
}

/// O02 — Trạng thái hồ sơ HLV.
class CvStatusScreen extends ConsumerStatefulWidget {
  const CvStatusScreen({super.key});

  @override
  ConsumerState<CvStatusScreen> createState() => _CvStatusScreenState();
}

class _CvStatusScreenState extends ConsumerState<CvStatusScreen> {
  bool _refreshing = false;

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await runAction(context, () => ref.read(sessionProvider.notifier).refresh());
    if (mounted) setState(() => _refreshing = false);
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final cert = session?.certification;
    final c = context.colors;
    if (cert == null) return const CvUploadScreen();
    final rejected = cert.status == CoachApprovalStatus.rejected;
    final status = cert.status.status;
    return AppScaffold(
      title: 'Hồ sơ HLV',
      actions: [_LogoutButton()],
      body: RefreshableScroll(
        onRefresh: _refresh,
        children: [
          AppCard(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(color: context.tones.of(status.tone).background, shape: BoxShape.circle),
                  child: Icon(
                    rejected ? AppIcons.error : AppIcons.pending,
                    size: AppSizes.iconXl,
                    color: context.tones.of(status.tone).foreground,
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  rejected ? 'Hồ sơ chưa được duyệt' : 'Hồ sơ đang được xét duyệt',
                  style: context.text.title,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.xs),
                status.tag(),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  rejected ? 'Vui lòng xem lý do bên dưới, chỉnh sửa CV và nộp lại.' : 'Quản lý trung tâm sẽ xem CV của bạn. Bạn sẽ nhận thông báo khi có kết quả và có thể đăng nhập để mở khóa học.',
                  textAlign: TextAlign.center,
                  style: context.text.small.copyWith(color: c.textMuted),
                ),
              ],
            ),
          ),
          if (rejected && cert.rejectReason != null) ...[
            const SizedBox(height: AppSpacing.md),
            AlertBanner.error(title: 'Lý do từ chối', message: cert.rejectReason!),
          ],
          const SizedBox(height: AppSpacing.md),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Tệp đã nộp', style: context.text.label),
                const SizedBox(height: AppSpacing.xs),
                InfoRow(icon: AppIcons.cv, text: cert.fileName ?? 'CV đã nộp'),
                InfoRow(icon: AppIcons.time, text: 'Nộp lúc ${VnTime.dateTime(cert.submittedAt)}'),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          TimelineList(
            entries: [
              const TimelineEntry(title: 'Đăng ký tài khoản', tone: StatusTone.success),
              TimelineEntry(title: 'Nộp CV', subtitle: VnTime.dateTime(cert.submittedAt), tone: StatusTone.success),
              TimelineEntry(
                title: rejected ? 'Bị từ chối' : 'Quản lý xét duyệt',
                subtitle: rejected ? null : 'Đang xử lý',
                tone: rejected ? StatusTone.danger : StatusTone.warning,
              ),
              const TimelineEntry(title: 'Bắt đầu mở khóa học', done: false),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          if (rejected)
            AppButton(
              label: 'Nộp lại CV',
              icon: AppIcons.upload,
              expand: true,
              onPressed: () => context.go(AppRoutes.onboardingCv),
            )
          else
            AppButton.outline(
              label: 'Kiểm tra kết quả',
              icon: AppIcons.refresh,
              expand: true,
              loading: _refreshing,
              onPressed: _refresh,
            ),
        ],
      ),
    );
  }
}

class _LogoutButton extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    tooltip: 'Đăng xuất',
    icon: const Icon(AppIcons.logout),
    onPressed: () => ref.read(sessionProvider.notifier).logout(),
  );
}

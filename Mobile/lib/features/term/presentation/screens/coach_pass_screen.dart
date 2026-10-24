import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/error/app_failure.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/app_palette.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../data/coach_term_repository_provider.dart';
import '../../domain/entities/coach_term.dart';
import '../term_labels.dart';

/// Thẻ ra vào của HLV: QR đổi mỗi ~45 giây (JWT sống 60 giây) để Quản lý quét kiểm tra khi vào phòng tập.
/// Không dùng userId thô làm QR vì userId lộ trong dữ liệu khóa học công khai.
class CoachPassScreen extends ConsumerStatefulWidget {
  const CoachPassScreen({super.key});

  @override
  ConsumerState<CoachPassScreen> createState() => _CoachPassScreenState();
}

class _CoachPassScreenState extends ConsumerState<CoachPassScreen> {
  CoachPass? _pass;
  Object? _error;
  DateTime? _nextRefresh;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await ref.read(coachTermRepositoryProvider).pass();
      if (!mounted) return;
      setState(() {
        _pass = p;
        _error = null;
        _nextRefresh = DateTime.now().add(CoachPass.refreshEvery);
      });
      _timer?.cancel();
      _timer = Timer(CoachPass.refreshEvery, _load);
    } on Object catch (e) {
      if (!mounted) return;
      // Giữ mã cũ nếu còn dùng được; lỗi mạng tạm thời ⇒ thử lại sau 10 giây.
      setState(() => _error = e);
      _timer?.cancel();
      _timer = Timer(const Duration(seconds: 10), _load);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final user = ref.watch(currentUserProvider);
    final pass = _pass;
    return AppScaffold(
      title: 'Thẻ ra vào HLV',
      body: pass == null && _error != null
          ? ErrorState(error: AppFailure.from(_error!), onRetry: _load)
          : ListView(
              padding: EdgeInsets.all(context.screenPadding),
              children: [
                if (pass != null) _VerdictBanner(verdict: pass.verdict),
                const SizedBox(height: AppSpacing.md),
                AppCard(
                  child: Column(
                    children: [
                      Container(
                        decoration: const BoxDecoration(color: AppPalette.white, borderRadius: AppRadius.sheetAll),
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        child: pass == null
                            ? const SizedBox.square(
                                dimension: 200,
                                child: Center(child: CircularProgressIndicator.adaptive()),
                              )
                            : QrImageView(
                                data: pass.token,
                                size: 200,
                                semanticsLabel: 'Mã QR thẻ ra vào HLV',
                                eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: c.primary),
                                dataModuleStyle: QrDataModuleStyle(
                                  dataModuleShape: QrDataModuleShape.square,
                                  color: c.primary,
                                ),
                              ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(user?.fullName ?? 'Huấn luyện viên', style: context.text.title, textAlign: TextAlign.center),
                      if (pass?.state != null) ...[
                        const SizedBox(height: AppSpacing.xxs),
                        termStateLabel(pass!.state!).tag(),
                      ],
                      const SizedBox(height: AppSpacing.sm),
                      if (_nextRefresh != null)
                        CountdownText(
                          deadline: _nextRefresh!,
                          prefix: 'Mã tự đổi sau ',
                          style: context.text.label.copyWith(color: c.primary),
                        ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: AppSpacing.xs),
                          child: Text(
                            'Chưa làm mới được mã — đang thử lại.',
                            style: context.text.caption.copyWith(color: c.errorText),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  'Đưa mã này cho Quản lý quét khi vào phòng tập. Đừng chụp màn hình hay gửi cho người khác — mã hết hạn sau vài chục giây.',
                  textAlign: TextAlign.center,
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppButton.outline(label: 'Đổi mã ngay', icon: AppIcons.refresh, expand: true, onPressed: _load),
              ],
            ),
    );
  }
}

class _VerdictBanner extends StatelessWidget {
  const _VerdictBanner({required this.verdict});

  final PassVerdict verdict;

  @override
  Widget build(BuildContext context) {
    return switch (verdict.level) {
      PassLevel.ok => AlertBanner.success(title: passTitle(verdict.level), message: verdict.reason),
      PassLevel.warn => AlertBanner.warning(title: passTitle(verdict.level), message: verdict.reason),
      PassLevel.deny => AlertBanner.error(title: passTitle(verdict.level), message: verdict.reason),
    };
  }
}

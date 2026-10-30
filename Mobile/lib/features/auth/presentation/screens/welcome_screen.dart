import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/env.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/widgets/widgets.dart';

/// A02 — Chào mừng (thay landing page dài của web).
///
/// Nửa trên: hero nền thương hiệu với đường nhịp tim "pulse" + khẩu hiệu.
/// Nửa dưới: panel sáng giới thiệu 2 vai trò dùng app (Hội viên, HLV) và CTA.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Nền tối ⇒ icon thanh trạng thái màu sáng.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: c.primary,
        body: SafeArea(
          bottom: false,
          child: ContentWidth(
            child: CustomScrollView(
              slivers: [
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _TopBar(),
                      const Spacer(),
                      const _Hero(),
                      const _ActionPanel(),
                      // Tablet cao ⇒ cả khối hero + panel nằm giữa, không dồn xuống đáy.
                      if (context.isWide) const Spacer(),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    final pad = context.screenPadding + AppSpacing.xs;
    return Padding(
      padding: EdgeInsets.fromLTRB(pad, AppSpacing.xs, pad, 0),
      child: Row(
        children: [
          const Flexible(child: BrandLogo(onDark: true)),
          const Spacer(),
          if (Env.useMock)
            IconButton(
              tooltip: 'Công cụ phát triển',
              onPressed: () => context.push(AppRoutes.devTools),
              icon: Icon(AppIcons.settings, color: context.colors.accent),
            ),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pad = context.screenPadding + AppSpacing.xs;
    // Màn rất hẹp ⇒ hạ một bậc chữ để khẩu hiệu không vỡ dòng xấu.
    final narrow = MediaQuery.sizeOf(context).width < 360;
    final headline = (narrow ? context.text.headline : context.text.display).copyWith(color: c.onPrimary);
    return Padding(
      padding: EdgeInsets.fromLTRB(pad, AppSpacing.xl, pad, AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _PulseLine(),
          const SizedBox(height: AppSpacing.lg),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xxs),
            decoration: BoxDecoration(
              color: c.accent.withValues(alpha: 0.14),
              borderRadius: AppRadius.pillAll,
              border: Border.all(color: c.accent.withValues(alpha: 0.4)),
            ),
            child: Text(
              'GYM · HỘI VIÊN & HLV',
              style: context.text.caption.copyWith(color: c.accent, letterSpacing: 1),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text.rich(
            TextSpan(
              text: 'Mỗi buổi tập\nđều có ',
              children: [
                TextSpan(
                  text: 'nhịp',
                  style: TextStyle(color: c.accent),
                ),
                const TextSpan(text: '.'),
              ],
            ),
            style: headline,
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Thẻ hội viên, khóa học cùng HLV, check-in QR và lộ trình tập luyện — gọn trong một ứng dụng.',
            style: context.text.body.copyWith(color: c.onPrimary.withValues(alpha: 0.8)),
          ),
        ],
      ),
    );
  }
}

/// Đường nhịp tim chạy ngang — hình ảnh gốc của thương hiệu "pulse".
/// Vẽ dần một lần khi mở màn (bỏ qua nếu người dùng tắt hiệu ứng).
class _PulseLine extends StatefulWidget {
  const _PulseLine();

  @override
  State<_PulseLine> createState() => _PulseLineState();
}

class _PulseLineState extends State<_PulseLine> with SingleTickerProviderStateMixin {
  late final _controller = AnimationController(vsync: this, duration: AppDurations.slow);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _controller.value = 1;
    } else if (!_controller.isAnimating && _controller.value == 0) {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ExcludeSemantics(
      child: SizedBox(
        height: AppSpacing.xxl + AppSpacing.md,
        width: double.infinity,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) => CustomPaint(
            painter: _PulsePainter(
              progress: AppDurations.curve.transform(_controller.value),
              color: c.accent,
              baseline: c.onPrimary.withValues(alpha: 0.12),
            ),
          ),
        ),
      ),
    );
  }
}

class _PulsePainter extends CustomPainter {
  _PulsePainter({required this.progress, required this.color, required this.baseline});

  final double progress;
  final Color color;
  final Color baseline;

  /// Các điểm (x, y) theo tỉ lệ 0–1 của khung: phẳng → nhịp nhỏ → nhịp lớn → phẳng.
  static const _points = <(double, double)>[
    (0, .6),
    (.22, .6),
    (.27, .45),
    (.31, .6),
    (.38, .6),
    (.42, .72),
    (.47, .05),
    (.53, .95),
    (.57, .6),
    (.64, .6),
    (.68, .38),
    (.73, .6),
    (1, .6),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final y0 = size.height * _points.first.$2;
    canvas.drawLine(
      Offset(0, y0),
      Offset(size.width, y0),
      Paint()
        ..color = baseline
        ..strokeWidth = AppSizes.borderWidth,
    );

    final full = Path()..moveTo(0, y0);
    for (final (x, y) in _points.skip(1)) {
      full.lineTo(size.width * x, size.height * y);
    }
    final metric = full.computeMetrics().first;
    final drawn = metric.extractPath(0, metric.length * progress);

    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    // Quầng sáng mờ phía dưới + nét chính.
    canvas.drawPath(
      drawn,
      stroke
        ..color = color.withValues(alpha: 0.25)
        ..strokeWidth = AppSizes.focusWidth * 4,
    );
    canvas.drawPath(
      drawn,
      stroke
        ..color = color
        ..strokeWidth = AppSizes.focusWidth + 1,
    );

    final tip = metric.getTangentForOffset(metric.length * progress)?.position;
    if (tip != null && progress > 0) {
      canvas.drawCircle(tip, AppSizes.dot / 2, Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_PulsePainter old) => old.progress != progress || old.color != color || old.baseline != baseline;
}

class _ActionPanel extends StatelessWidget {
  const _ActionPanel();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final pad = context.screenPadding + AppSpacing.xs;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    // Tablet: panel thành thẻ nổi bo đủ 4 góc, cách đáy một khoảng.
    final wide = context.isWide;
    const radius = Radius.circular(AppRadius.sheet * 1.5);
    return Container(
      margin: wide ? EdgeInsets.only(bottom: context.screenPadding + bottomInset) : null,
      padding: EdgeInsets.fromLTRB(pad, AppSpacing.lg, pad, AppSpacing.sm + (wide ? 0 : bottomInset)),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: wide ? const BorderRadius.all(radius) : const BorderRadius.vertical(top: radius),
        boxShadow: AppShadows.modal,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Dành cho', style: context.text.caption.copyWith(color: c.textMuted)),
          const SizedBox(height: AppSpacing.xs),
          const _RoleRow(
            icon: AppIcons.membership,
            title: 'Hội viên',
            subtitle: 'Mua gói tập, đăng ký khóa học, check-in bằng QR',
          ),
          const SizedBox(height: AppSpacing.xs),
          const _RoleRow(
            icon: AppIcons.training,
            title: 'Huấn luyện viên',
            subtitle: 'Mở lớp, điểm danh, theo dõi tiến độ học viên',
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Đăng nhập', expand: true, onPressed: () => context.push(AppRoutes.login)),
          const SizedBox(height: AppSpacing.sm),
          AppButton.outline(label: 'Tạo tài khoản', expand: true, onPressed: () => context.push(AppRoutes.register)),
          const SizedBox(height: AppSpacing.xxs),
          Center(
            child: TextButton.icon(
              onPressed: () => context.push(AppRoutes.explore),
              iconAlignment: IconAlignment.end,
              icon: Icon(AppIcons.chevronRight, size: AppSizes.iconSm, color: c.accentStrong),
              label: Text('Xem khóa học & cửa hàng', style: context.text.label.copyWith(color: c.primary)),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleRow extends StatelessWidget {
  const _RoleRow({required this.icon, required this.title, required this.subtitle});

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: c.surfaceMuted,
        borderRadius: AppRadius.cardAll,
        border: Border.all(color: c.border),
      ),
      child: Row(
        children: [
          IconTile(icon, background: c.accent, foreground: c.onAccent),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.label.copyWith(color: c.text)),
                Text(subtitle, style: context.text.caption.copyWith(color: c.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

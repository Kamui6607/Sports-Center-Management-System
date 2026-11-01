import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Logo "pulse. SPORTS CENTER" + hình vòng năng lượng ([PulseMark]), đồng bộ `FE/src/shared/Brand.tsx`.
class BrandLogo extends StatelessWidget {
  const BrandLogo({super.key, this.size = BrandLogoSize.normal, this.onDark = false});

  final BrandLogoSize size;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final large = size == BrandLogoSize.large;
    final markSize = large ? AppSpacing.xxl + AppSpacing.md : AppSpacing.xl + AppSpacing.xxs;
    final wordStyle = (large ? context.text.headline : context.text.titleSmall).copyWith(
      color: onDark ? c.onPrimary : c.primary,
      fontWeight: FontWeight.w800,
    );
    return Semantics(
      label: 'pulse. Sports Center',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: markSize,
            height: markSize,
            decoration: BoxDecoration(
              color: onDark ? c.accent : c.primary,
              borderRadius: BorderRadius.circular(large ? AppRadius.sheet : AppRadius.control + 2),
            ),
            child: PulseMark(color: onDark ? c.onAccent : c.highlight),
          ),
          SizedBox(width: large ? AppSpacing.sm : AppSpacing.xs),
          Flexible(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      text: 'pulse',
                      children: [
                        TextSpan(
                          text: '.',
                          style: TextStyle(color: onDark ? c.accent : c.accentStrong),
                        ),
                      ],
                    ),
                    style: wordStyle,
                  ),
                  Text(
                    'SPORTS CENTER',
                    style: context.text.micro.copyWith(color: onDark ? c.highlight : c.textMuted, letterSpacing: 1.2),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

enum BrandLogoSize { normal, large }

/// "Vòng năng lượng": vòng tiến độ hở một khe có chấm, bên trong là nhịp tim — vẽ theo
/// `Doc/brand/pulse-mark.svg` (khung 64×64), đồng bộ `FE/src/shared/PulseMark.tsx`.
class PulseMark extends StatelessWidget {
  const PulseMark({super.key, required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _PulseMarkPainter(color), size: Size.infinite);
}

class _PulseMarkPainter extends CustomPainter {
  const _PulseMarkPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.shortestSide / 64;
    canvas
      ..translate((size.width - 64 * k) / 2, (size.height - 64 * k) / 2)
      ..scale(k);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final ring = Path()
      ..addArc(Rect.fromCircle(center: const Offset(32, 32), radius: 18), -math.pi / 2, math.pi * 5 / 3);
    final pulse = Path()
      ..moveTo(24, 32)
      ..lineTo(28, 32)
      ..lineTo(30.5, 27)
      ..lineTo(33.5, 37)
      ..lineTo(36, 32)
      ..lineTo(40, 32);
    canvas
      ..drawPath(ring, Paint.from(stroke)..strokeWidth = 7)
      ..drawCircle(const Offset(23, 16.41), 3.6, Paint()..color = color)
      ..drawPath(pulse, Paint.from(stroke)..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(_PulseMarkPainter old) => old.color != color;
}

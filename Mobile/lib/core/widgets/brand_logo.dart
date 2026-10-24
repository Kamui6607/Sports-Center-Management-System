import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/theme.dart';

/// Logo "pulse. SPORTS CENTER" + icon Activity (Q13), đồng bộ `FE/src/shared/Brand.tsx`.
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
            child: Icon(
              AppIcons.brand,
              color: onDark ? c.onAccent : c.accent,
              size: large ? AppSizes.iconXl : AppSizes.icon,
            ),
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
                    style: context.text.micro.copyWith(color: onDark ? c.accent : c.textMuted, letterSpacing: 1.2),
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

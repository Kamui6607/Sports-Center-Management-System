import 'dart:io';

import 'package:flutter/material.dart';

import '../theme/theme.dart';

/// Ảnh đại diện: ảnh mạng nếu có, lỗi/thiếu ⇒ chữ cái đầu; chấm online tùy chọn.
class AppAvatar extends StatelessWidget {
  const AppAvatar({super.key, required this.name, this.imageUrl, this.size = AppSizes.avatar, this.online});

  final String name;
  final String? imageUrl;
  final double size;
  final bool? online;

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return (parts[parts.length - 2].characters.first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final fallback = Container(
      color: c.primary,
      alignment: Alignment.center,
      padding: EdgeInsets.all(size * 0.2),
      child: FittedBox(
        child: Text(
          initials(name),
          style: (size >= AppSizes.avatarLg ? context.text.headline : context.text.label).copyWith(color: c.accent),
        ),
      ),
    );
    final url = imageUrl;
    return Semantics(
      label: 'Ảnh đại diện $name',
      image: true,
      child: SizedBox.square(
        dimension: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            ClipOval(
              child: SizedBox.square(
                dimension: size,
                child: url == null || url.isEmpty
                    ? fallback
                    : (url.startsWith('http')
                          ? Image.network(url, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback)
                          // Ảnh vừa chọn trên máy (mock chưa tải lên server).
                          : Image.file(File(url), fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback)),
              ),
            ),
            if (online != null)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: AppSizes.dot + 2,
                  height: AppSizes.dot + 2,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: online! ? context.tones.of(StatusTone.success).foreground : c.borderStrong,
                    border: Border.all(color: c.surface, width: 2),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

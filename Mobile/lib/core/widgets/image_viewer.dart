import 'package:flutter/material.dart';

import '../icons/app_icons.dart';
import '../theme/app_palette.dart';
import '../theme/theme.dart';
import 'app_icon_button.dart';

/// Mở ảnh toàn màn hình: chụm 2 ngón / chạm đúp để phóng to, chạm nền hoặc nút X để đóng.
Future<void> showImageViewer(BuildContext context, {required String url, String? semanticLabel}) {
  return Navigator.of(context, rootNavigator: true).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierDismissible: true,
      barrierColor: AppPalette.viewerBackground,
      pageBuilder: (_, _, _) => _ImageViewer(url: url, semanticLabel: semanticLabel),
      transitionsBuilder: (_, animation, _, child) => FadeTransition(opacity: animation, child: child),
    ),
  );
}

class _ImageViewer extends StatefulWidget {
  const _ImageViewer({required this.url, this.semanticLabel});

  final String url;
  final String? semanticLabel;

  @override
  State<_ImageViewer> createState() => _ImageViewerState();
}

class _ImageViewerState extends State<_ImageViewer> {
  static const _zoomScale = 2.5;

  final _controller = TransformationController();
  TapDownDetails? _doubleTap;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _toggleZoom() {
    if (_controller.value != Matrix4.identity()) {
      _controller.value = Matrix4.identity();
      return;
    }
    final p = _doubleTap?.localPosition ?? Offset.zero;
    _controller.value = Matrix4.identity()
      ..translateByDouble(-p.dx * (_zoomScale - 1), -p.dy * (_zoomScale - 1), 0, 1)
      ..scaleByDouble(_zoomScale, _zoomScale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              onDoubleTapDown: (d) => _doubleTap = d,
              onDoubleTap: _toggleZoom,
              child: InteractiveViewer(
                transformationController: _controller,
                maxScale: 5,
                child: Center(
                  child: Semantics(
                    image: true,
                    label: widget.semanticLabel,
                    child: Image.network(
                      widget.url,
                      fit: BoxFit.contain,
                      loadingBuilder: (context, child, progress) =>
                          progress == null ? child : const CircularProgressIndicator(color: AppPalette.white),
                      errorBuilder: (_, _, _) =>
                          const Icon(AppIcons.bag, color: AppPalette.white, size: AppSizes.iconXl),
                    ),
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.xs),
                child: AppIconButton(
                  icon: AppIcons.close,
                  tooltip: 'Đóng',
                  color: AppPalette.white,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

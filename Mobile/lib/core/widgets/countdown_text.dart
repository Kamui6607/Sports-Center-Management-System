import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/theme.dart';
import '../utils/vn_time.dart';

/// Đếm ngược tới [deadline], cập nhật mỗi giây; gọi [onExpired] một lần.
class CountdownText extends StatefulWidget {
  const CountdownText({super.key, required this.deadline, this.style, this.onExpired, this.prefix = ''});

  final DateTime deadline;
  final TextStyle? style;
  final VoidCallback? onExpired;
  final String prefix;

  @override
  State<CountdownText> createState() => _CountdownTextState();
}

class _CountdownTextState extends State<CountdownText> {
  Timer? _timer;
  bool _fired = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    if (!mounted) return;
    setState(() {});
    if (!_fired && !widget.deadline.isAfter(DateTime.now())) {
      _fired = true;
      widget.onExpired?.call();
    }
  }

  @override
  void didUpdateWidget(covariant CountdownText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.deadline != widget.deadline) _fired = false;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final remaining = widget.deadline.difference(DateTime.now());
    return Text(
      '${widget.prefix}${VnTime.countdown(remaining)}',
      style: (widget.style ?? context.text.label).copyWith(fontFeatures: kTabularFigures),
    );
  }
}

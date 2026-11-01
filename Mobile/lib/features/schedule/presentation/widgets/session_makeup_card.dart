import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../makeup/data/makeup_repository_provider.dart';
import '../../../makeup/domain/entities/makeup.dart';
import '../../../makeup/presentation/makeup_widgets.dart';
import '../../domain/entities/session.dart';
import '../providers/schedule_providers.dart';

/// Trạng thái học bù của một buổi đã báo vắng + thao tác: xin học bù, chọn buổi bù mở, rút yêu cầu, xem buổi học bù.
class SessionMakeupCard extends ConsumerWidget {
  const SessionMakeupCard({super.key, required this.item});

  final MySession item;

  void _refresh(WidgetRef ref) {
    ref.invalidate(mySessionProvider(item.session.id));
    ref.read(dataRevisionProvider.notifier).bump();
  }

  Future<void> _request(BuildContext context, WidgetRef ref) async {
    final done = await runAction(
      context,
      () => ref.read(makeupRepositoryProvider).requestForAbsence(item.enrollmentId).then((_) => true),
      success: 'Đã gửi yêu cầu học bù. HLV sẽ xếp buổi cho bạn.',
    );
    if (done == true && context.mounted) _refresh(ref);
  }

  Future<void> _choose(BuildContext context, WidgetRef ref, MakeupRequest r) async {
    final sessionId = await showAppBottomSheet<String>(
      context: context,
      title: 'Chọn buổi học bù',
      subtitle: 'Buổi bù HLV đã mở cho khóa này',
      builder: (_) => MakeupOptionsSheet(
        requestId: r.id,
        emptyMessage: 'HLV chưa mở buổi bù. Bạn sẽ nhận thông báo khi có buổi hoặc khi HLV xếp buổi cho bạn.',
      ),
    );
    if (sessionId == null || !context.mounted) return;
    final done = await runAction(
      context,
      () => ref.read(makeupRepositoryProvider).assign(r.id, sessionId).then((_) => true),
      success: 'Đã chọn buổi học bù.',
    );
    if (done == true && context.mounted) _refresh(ref);
  }

  Future<void> _withdraw(BuildContext context, WidgetRef ref, MakeupRequest r) async {
    final done = await runAction(
      context,
      () => ref.read(makeupRepositoryProvider).cancel(r.id).then((_) => true),
      success: 'Đã rút yêu cầu học bù.',
    );
    if (done == true && context.mounted) _refresh(ref);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = item.makeupRequest;
    if (r == null) {
      return AlertBanner.info(
        title: 'Muốn học bù buổi này?',
        message: 'Gửi yêu cầu để HLV xếp buổi khác hoặc chọn buổi bù HLV mở cho khóa.',
        action: TextButton(onPressed: () => _request(context, ref), child: const Text('Xin học bù')),
      );
    }
    final actions = <Widget>[
      if (r.status == MakeupStatus.pending) ...[
        TextButton(onPressed: () => _choose(context, ref, r), child: const Text('Chọn buổi bù')),
        TextButton(onPressed: () => _withdraw(context, ref, r), child: const Text('Rút yêu cầu')),
      ],
      if (r.status == MakeupStatus.scheduled && r.target != null)
        TextButton(
          onPressed: () => context.push(AppRoutes.mySession(r.target!.id)),
          child: const Text('Xem buổi học bù'),
        ),
      if ((r.status == MakeupStatus.rejected || r.status == MakeupStatus.expired) && r.refundEligible)
        TextButton(onPressed: () => context.push(AppRoutes.refunds), child: const Text('Theo dõi hoàn tiền')),
    ];
    final message = switch (r.status) {
      MakeupStatus.pending =>
        'Đang chờ HLV xếp buổi học bù (hạn ${VnTime.date(r.expiresAt)}). Bạn cũng có thể tự chọn buổi bù HLV đã mở.',
      MakeupStatus.scheduled =>
        'Học bù: ${r.target == null ? '' : '${r.target!.className} · ${makeupSessionLabel(r.target!)}'}.',
      MakeupStatus.rejected =>
        'HLV chưa xếp được buổi học bù${r.rejectReason == null ? '' : ': ${r.rejectReason}'}.'
            '${r.refundEligible ? ' Bạn được hoàn 80% tiền buổi (chờ Quản lý duyệt).' : ''}',
      MakeupStatus.expired =>
        'Yêu cầu học bù đã hết hạn mà chưa được xếp buổi.${r.refundEligible ? ' Bạn được hoàn 80% tiền buổi (chờ Quản lý duyệt).' : ''}',
      MakeupStatus.cancelled => 'Yêu cầu học bù đã được rút.',
    };
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text('Học bù', style: context.text.bodyStrong)),
              r.status.status.tag(dense: true),
            ],
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(message, style: context.text.small),
          if (actions.isNotEmpty) Wrap(spacing: AppSpacing.xs, children: actions),
        ],
      ),
    );
  }
}

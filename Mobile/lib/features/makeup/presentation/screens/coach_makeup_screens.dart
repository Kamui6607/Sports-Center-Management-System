import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/data/data_revision.dart';
import '../../../../core/icons/app_icons.dart';
import '../../../../core/theme/theme.dart';
import '../../../../core/utils/vn_time.dart';
import '../../../../core/widgets/widgets.dart';
import '../../data/makeup_repository_provider.dart';
import '../../domain/entities/makeup.dart';
import '../makeup_widgets.dart';
import '../providers/makeup_providers.dart';

/// HLV — Yêu cầu học bù của các khóa mình dạy (nhóm theo khóa).
class CoachMakeupRequestsScreen extends ConsumerStatefulWidget {
  const CoachMakeupRequestsScreen({super.key});

  @override
  ConsumerState<CoachMakeupRequestsScreen> createState() => _CoachMakeupRequestsScreenState();
}

class _CoachMakeupRequestsScreenState extends ConsumerState<CoachMakeupRequestsScreen> {
  MakeupStatus? _status = MakeupStatus.pending;

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(coachMakeupRequestsProvider(_status));
    return AppScaffold(
      title: 'Yêu cầu học bù',
      body: Column(
        children: [
          SegmentedTabs<MakeupStatus?>(
            padding: EdgeInsets.all(context.screenPadding),
            options: const [
              SegmentOption(MakeupStatus.pending, 'Chờ xử lý'),
              SegmentOption(MakeupStatus.scheduled, 'Đã xếp'),
              SegmentOption(null, 'Tất cả'),
            ],
            selected: _status,
            onChanged: (v) => setState(() => _status = v),
          ),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(coachMakeupRequestsProvider(_status)),
              data: (rows) {
                if (rows.isEmpty) {
                  return const EmptyState(
                    icon: AppIcons.absence,
                    title: 'Không có yêu cầu',
                    message: 'Học viên báo vắng và xin học bù sẽ xuất hiện ở đây.',
                  );
                }
                final byClass = <String, List<MakeupRequest>>{};
                for (final r in rows) {
                  byClass.putIfAbsent(r.missed.className, () => []).add(r);
                }
                return RefreshableScroll(
                  onRefresh: () => ref.refresh(coachMakeupRequestsProvider(_status).future),
                  children: [
                    for (final entry in byClass.entries) ...[
                      SectionHeader(title: '${entry.key} (${entry.value.length})'),
                      AppCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (var i = 0; i < entry.value.length; i++) ...[
                              if (i > 0) const Divider(height: 1),
                              _RequestTile(request: entry.value[i]),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request});

  final MakeupRequest request;

  @override
  Widget build(BuildContext context) {
    final r = request;
    return ListTile(
      leading: AppAvatar(name: r.memberName, imageUrl: r.memberAvatarUrl),
      title: Text(r.memberName),
      subtitle: Text(
        'Vắng ${VnTime.sessionLabel(r.missed.startTime, r.missed.endTime)}\nLý do: ${r.reason}',
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      isThreeLine: true,
      trailing: r.status.status.tag(dense: true),
      onTap: () => context.push(AppRoutes.coachMakeupRequest(r.id)),
    );
  }
}

/// HLV — Chi tiết yêu cầu: xếp vào buổi có sẵn / mở buổi bù / từ chối.
class CoachMakeupRequestScreen extends ConsumerStatefulWidget {
  const CoachMakeupRequestScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<CoachMakeupRequestScreen> createState() => _CoachMakeupRequestScreenState();
}

class _CoachMakeupRequestScreenState extends ConsumerState<CoachMakeupRequestScreen> {
  String? _selected;

  Future<void> _assign() async {
    final id = _selected;
    if (id == null) return;
    final done = await runAction(
      context,
      () => ref.read(makeupRepositoryProvider).assign(widget.requestId, id).then((_) => true),
      success: 'Đã xếp buổi học bù. Học viên đã nhận thông báo.',
    );
    if (done == true && mounted) {
      ref.read(dataRevisionProvider.notifier).bump();
      context.pop();
    }
  }

  Future<void> _reject() async {
    final reason = await showAppBottomSheet<String>(
      context: context,
      title: 'Từ chối yêu cầu học bù',
      builder: (_) => const _RejectForm(),
    );
    if (reason == null || !mounted) return;
    final done = await runAction(
      context,
      () => ref.read(makeupRepositoryProvider).reject(widget.requestId, reason).then((_) => true),
      success: 'Đã từ chối yêu cầu.',
    );
    if (done == true && mounted) {
      ref.read(dataRevisionProvider.notifier).bump();
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(makeupOptionsProvider(widget.requestId));
    return AppScaffold(
      title: 'Yêu cầu học bù',
      body: AsyncValueView(
        value: value,
        onRetry: () => ref.invalidate(makeupOptionsProvider(widget.requestId)),
        data: (d) {
          final r = d.request;
          final muted = context.text.small.copyWith(color: context.colors.textMuted);
          return ListView(
            padding: EdgeInsets.all(context.screenPadding),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        AppAvatar(name: r.memberName, imageUrl: r.memberAvatarUrl),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(child: Text(r.memberName, style: context.text.bodyStrong)),
                        r.status.status.tag(dense: true),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    InfoRow(
                      icon: AppIcons.absence,
                      text: 'Vắng: ${r.missed.className} · ${makeupSessionLabel(r.missed)}',
                    ),
                    InfoRow(icon: AppIcons.chat, text: 'Lý do: ${r.reason}'),
                    InfoRow(icon: AppIcons.time, text: 'Hạn xếp buổi: ${VnTime.date(r.expiresAt)}'),
                    if (r.target != null)
                      InfoRow(
                        icon: AppIcons.calendar,
                        text: 'Đã xếp: ${r.target!.className} · ${makeupSessionLabel(r.target!)}',
                      ),
                    if (r.rejectReason != null) InfoRow(icon: AppIcons.error, text: 'Lý do từ chối: ${r.rejectReason}'),
                  ],
                ),
              ),
              if (r.isPending) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  r.refundEligible
                      ? 'Học viên báo trước ≥ 24h: nếu từ chối hoặc để quá hạn, học viên được hoàn 80% tiền buổi.'
                      : 'Học viên báo dưới 24h: từ chối không phát sinh hoàn tiền.',
                  style: muted,
                ),
                const SectionHeader(title: 'Xếp vào buổi có sẵn'),
                if (d.options.isEmpty)
                  const EmptyState(
                    compact: true,
                    title: 'Chưa có buổi phù hợp',
                    message: 'Mở một buổi bù cho khóa để xếp học viên vào.',
                  )
                else
                  RadioGroup<String>(
                    groupValue: _selected,
                    onChanged: (id) => setState(() => _selected = id),
                    child: Column(children: [for (final o in d.options) MakeupOptionTile(option: o)]),
                  ),
                const SizedBox(height: AppSpacing.md),
                AppButton(label: 'Xếp vào buổi đã chọn', expand: true, onPressed: _selected == null ? null : _assign),
                const SizedBox(height: AppSpacing.xs),
                AppButton.secondary(
                  label: 'Mở buổi bù mới',
                  icon: AppIcons.calendar,
                  expand: true,
                  onPressed: () => context.push(AppRoutes.coachOpenMakeupSlot(r.paidClassId, requestId: r.id)),
                ),
                const SizedBox(height: AppSpacing.xs),
                AppButton.danger(label: 'Từ chối', expand: true, onPressed: _reject),
              ],
              const SizedBox(height: AppSpacing.xl),
            ],
          );
        },
      ),
    );
  }
}

class _RejectForm extends StatefulWidget {
  const _RejectForm();

  @override
  State<_RejectForm> createState() => _RejectFormState();
}

class _RejectFormState extends State<_RejectForm> {
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      AppTextField(label: 'Lý do', controller: _reason, errorText: _error, maxLines: 3, maxLength: 300),
      const SizedBox(height: AppSpacing.md),
      AppButton.danger(
        label: 'Từ chối',
        expand: true,
        onPressed: () {
          final text = _reason.text.trim();
          if (text.length < 5) {
            setState(() => _error = 'Nhập lý do (tối thiểu 5 ký tự).');
            return;
          }
          Navigator.of(context).pop(text);
        },
      ),
    ],
  );
}

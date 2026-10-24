import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../domain/entities/chat.dart';
import 'chat_providers.dart';

/// C01 — Danh sách hội thoại (chỉ 1-1 — Q7).
class ConversationsScreen extends ConsumerStatefulWidget {
  const ConversationsScreen({super.key});

  @override
  ConsumerState<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends ConsumerState<ConversationsScreen> {
  String _query = '';

  Future<void> _newChat() async {
    final peer = await showAppBottomSheet<ChatParticipant>(
      context: context,
      title: 'Tin nhắn mới',
      subtitle: 'Liên hệ HLV / học viên trong khóa của bạn',
      expand: true,
      builder: (_) => const _ContactPicker(),
    );
    if (peer != null && mounted) await context.push(AppRoutes.chatRoom(peer.userId));
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(conversationsProvider);
    return AppScaffold(
      title: 'Tin nhắn',
      floatingActionButton: FloatingActionButton(
        tooltip: 'Tin nhắn mới',
        backgroundColor: context.colors.primary,
        foregroundColor: context.colors.accent,
        onPressed: _newChat,
        child: const Icon(AppIcons.add),
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(context.screenPadding, AppSpacing.sm, context.screenPadding, AppSpacing.xs),
            child: SearchField(hint: 'Tìm người…', onChanged: (v) => setState(() => _query = v.toLowerCase())),
          ),
          Expanded(
            child: AsyncValueView(
              value: value,
              onRetry: () => ref.invalidate(conversationsProvider),
              isEmpty: (l) => l.isEmpty,
              empty: EmptyState(
                icon: AppIcons.chatMany,
                title: 'Chưa có cuộc trò chuyện',
                message: 'Nhắn tin trực tiếp với HLV hoặc học viên trong khóa của bạn.',
                actionLabel: 'Bắt đầu trò chuyện',
                onAction: _newChat,
              ),
              data: (list) {
                final filtered = list.where((c) => _query.isEmpty || c.title.toLowerCase().contains(_query)).toList();
                return RefreshIndicator.adaptive(
                  onRefresh: () => ref.refresh(conversationsProvider.future),
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: filtered.length,
                    separatorBuilder: (_, _) => const Divider(indent: AppSpacing.xxl + AppSpacing.lg),
                    itemBuilder: (_, i) => _ConversationTile(item: filtered[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.item});

  final Conversation item;

  @override
  Widget build(BuildContext context) {
    final last = item.lastMessage;
    final c = context.colors;
    final preview = last == null
        ? item.primary.subtitle ?? ''
        : (last.content ?? '📎 ${last.attachment?.name ?? 'Tệp đính kèm'}');
    return InkWell(
      onTap: () => context.push(AppRoutes.chatRoom(item.id)),
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.screenPadding, vertical: AppSpacing.sm),
        child: Row(
          children: [
            AppAvatar(name: item.primary.fullName, imageUrl: item.primary.avatarUrl, online: item.isOnline),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodyStrong,
                        ),
                      ),
                      if (last != null) ...[
                        const SizedBox(width: AppSpacing.xs),
                        Text(
                          VnTime.relative(last.createdAt, DateTime.now()),
                          style: context.text.caption.copyWith(color: c.textMuted),
                        ),
                      ],
                    ],
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          preview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.small.copyWith(
                            color: item.unreadCount > 0 ? c.text : c.textMuted,
                            fontWeight: item.unreadCount > 0 ? FontWeight.w600 : null,
                          ),
                        ),
                      ),
                      CountBadge(count: item.unreadCount),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactPicker extends ConsumerWidget {
  const _ContactPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(chatContactsProvider);
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.xl),
        child: Center(child: CircularProgressIndicator.adaptive()),
      ),
      error: (e, _) => ErrorState(error: e, compact: true, onRetry: () => ref.invalidate(chatContactsProvider)),
      data: (list) => list.isEmpty
          ? const EmptyState(
              compact: true,
              title: 'Chưa có liên hệ',
              message: 'Mua khóa học (hoặc mở khóa học) để nhắn tin với HLV / học viên.',
            )
          : Column(
              children: [
                for (final p in list)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: AppAvatar(name: p.fullName, imageUrl: p.avatarUrl),
                    title: Text(p.fullName),
                    subtitle: p.subtitle == null ? null : Text(p.subtitle!),
                    onTap: () => Navigator.of(context).pop(p),
                  ),
              ],
            ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/data_revision.dart';
import '../../../core/error/app_failure.dart';
import '../../../core/icons/app_icons.dart';
import '../../../core/platform/file_service.dart';
import '../../../core/theme/theme.dart';
import '../../../core/utils/vn_time.dart';
import '../../../core/widgets/widgets.dart';
import '../../auth/presentation/providers/session_provider.dart';
import '../data/chat_repository_provider.dart';
import '../domain/entities/chat.dart';
import 'chat_bubble.dart';
import 'chat_providers.dart';
import 'message_composer.dart';

/// C02 — Phòng chat 1-1: realtime (đang soạn, tin mới), đính kèm ≤ 10MB, gửi lại khi lỗi.
class ChatRoomScreen extends ConsumerStatefulWidget {
  const ChatRoomScreen({super.key, required this.peerId});

  final String peerId;

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen> {
  static const _maxFileBytes = 10 * 1024 * 1024;

  final _input = TextEditingController();
  List<ChatMessage>? _messages;
  Object? _error;
  bool _peerTyping = false;
  PickedFile? _file;
  StreamSubscription<ChatEvent>? _sub;
  var _localSeq = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = ref.read(chatRepositoryProvider).events().where((e) => e.conversationId == widget.peerId).listen(_onEvent);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final repo = ref.read(chatRepositoryProvider);
      final list = await repo.messages(widget.peerId);
      await repo.markRead(widget.peerId);
      if (!mounted) return;
      setState(() => _messages = list);
      ref.read(dataRevisionProvider.notifier).bump();
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _onEvent(ChatEvent e) {
    if (!mounted) return;
    switch (e) {
      case ChatTypingEvent(:final isTyping):
        setState(() => _peerTyping = isTyping);
      case ChatMessageEvent(:final message):
        setState(() => _messages = [...?_messages, message]);
        ref.read(chatRepositoryProvider).markRead(widget.peerId);
      case ChatReadEvent():
        setState(() => _messages = [for (final m in _messages ?? const <ChatMessage>[]) m.copyWith(isRead: true)]);
    }
  }

  Future<void> _pickFile() async {
    try {
      final f = await ref.read(fileServiceProvider).pickAny();
      if (f == null || !mounted) return;
      if (f.sizeBytes > _maxFileBytes) {
        AppSnackbar.error(context, 'Tệp ${f.sizeLabel} vượt quá giới hạn 10 MB.');
        return;
      }
      setState(() => _file = f);
    } on Object catch (e) {
      if (mounted) AppSnackbar.error(context, 'Không mở được trình chọn tệp: $e');
    }
  }

  Future<void> _send({ChatMessage? retry}) async {
    final me = ref.read(currentUserProvider);
    if (me == null) return;
    final text = retry?.content ?? _input.text.trim();
    final file = retry == null ? _file : null;
    if (text.isEmpty && file == null && retry == null) return;
    final temp =
        retry ??
        ChatMessage(
          id: 'local-${_localSeq++}',
          conversationId: widget.peerId,
          senderId: me.id,
          content: text.isEmpty ? null : text,
          attachment: file == null
              ? null
              : ChatAttachment(name: file.name, sizeBytes: file.sizeBytes, isImage: file.isImage, localPath: file.path),
          createdAt: DateTime.now(),
          delivery: MessageDelivery.sending,
        );
    setState(() {
      _messages = [
        for (final m in _messages ?? const <ChatMessage>[])
          if (m.id != temp.id) m,
        temp.copyWith(delivery: MessageDelivery.sending),
      ];
      if (retry == null) {
        _input.clear();
        _file = null;
      }
    });
    try {
      final sent = await ref.read(chatRepositoryProvider).send(widget.peerId, text: text, file: file);
      if (!mounted) return;
      setState(() => _messages = [for (final m in _messages!) m.id == temp.id ? sent : m]);
    } on Object catch (e) {
      if (!mounted) return;
      setState(
        () => _messages = [
          for (final m in _messages!) m.id == temp.id ? m.copyWith(delivery: MessageDelivery.failed) : m,
        ],
      );
      AppSnackbar.error(context, AppFailure.from(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final conv = ref.watch(conversationProvider(widget.peerId)).value;
    final me = ref.watch(currentUserProvider)?.id;
    final c = context.colors;
    return AppScaffold(
      titleWidget: conv == null
          ? null
          : Row(
              children: [
                AppAvatar(
                  name: conv.primary.fullName,
                  imageUrl: conv.primary.avatarUrl,
                  size: AppSizes.avatarSm + 4,
                  online: conv.isOnline,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(conv.title, style: context.text.label, overflow: TextOverflow.ellipsis),
                      Text(
                        _peerTyping
                            ? 'Đang soạn tin…'
                            : (conv.isOnline ? 'Đang hoạt động' : (conv.primary.subtitle ?? '')),
                        style: context.text.caption.copyWith(
                          color: _peerTyping || conv.isOnline ? c.accentStrong : c.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
      body: Column(
        children: [
          Expanded(child: _buildList(context, me)),
          if (_peerTyping)
            Padding(
              padding: EdgeInsets.symmetric(horizontal: context.screenPadding, vertical: AppSpacing.xxs),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${conv?.primary.fullName ?? ''} đang soạn tin…',
                  style: context.text.caption.copyWith(color: c.textMuted),
                ),
              ),
            ),
          MessageComposer(
            controller: _input,
            file: _file,
            onPickFile: _pickFile,
            onClearFile: () => setState(() => _file = null),
            onSend: _send,
            onChanged: (v) => ref.read(chatRepositoryProvider).setTyping(widget.peerId, v.isNotEmpty),
          ),
        ],
      ),
    );
  }

  Widget _buildList(BuildContext context, String? me) {
    if (_error != null) return ErrorState(error: _error!, onRetry: _load);
    final list = _messages;
    if (list == null) return const SkeletonList(withLeading: false, count: 4);
    if (list.isEmpty) {
      return const EmptyState(
        icon: AppIcons.chat,
        title: 'Bắt đầu cuộc trò chuyện',
        message: 'Gửi lời chào hoặc câu hỏi về buổi tập.',
      );
    }
    return ListView.builder(
      reverse: true,
      padding: EdgeInsets.symmetric(horizontal: context.screenPadding, vertical: AppSpacing.sm),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final i = list.length - 1 - index;
        final m = list[i];
        final showDay = i == 0 || !VnTime.sameDay(list[i - 1].createdAt, m.createdAt);
        return Column(
          children: [
            if (showDay)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Text(
                  VnTime.friendlyDay(m.createdAt, DateTime.now()),
                  style: context.text.caption.copyWith(color: context.colors.textMuted),
                ),
              ),
            ChatBubble(
              message: m,
              mine: m.senderId == me,
              onRetry: () => _send(retry: m),
            ),
          ],
        );
      },
    );
  }
}

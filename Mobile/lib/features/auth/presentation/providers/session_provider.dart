import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../data/auth_repository_provider.dart';
import '../../domain/entities/app_user.dart';
import '../../domain/entities/auth_models.dart';

/// Phiên đăng nhập hiện tại (null = Guest). Router lắng nghe provider này để
/// điều hướng theo vai trò / trạng thái duyệt CV.
final sessionProvider = AsyncNotifierProvider<SessionNotifier, AuthSession?>(SessionNotifier.new);

class SessionNotifier extends AsyncNotifier<AuthSession?> {
  @override
  Future<AuthSession?> build() => ref.read(authRepositoryProvider).restoreSession();

  Future<AuthSession> login(String email, String password) async {
    final session = await ref.read(authRepositoryProvider).login(email, password);
    state = AsyncData(session);
    ref.read(dataRevisionProvider.notifier).bump();
    return session;
  }

  /// Member ⇒ trả null (đăng nhập lại); Coach ⇒ phiên tạm để nộp CV.
  Future<AuthSession?> register(RegisterInput input) async {
    final session = await ref.read(authRepositoryProvider).register(input);
    if (session != null) state = AsyncData(session);
    return session;
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } finally {
      state = const AsyncData(null);
      ref.read(dataRevisionProvider.notifier).bump();
    }
  }

  /// Tải lại hồ sơ (sau khi nộp CV, được duyệt...).
  Future<void> refresh() async {
    final session = await ref.read(authRepositoryProvider).refreshMe();
    state = AsyncData(session);
  }

  void updateUser(AppUser user) {
    final current = state.value;
    if (current != null) state = AsyncData(current.copyWith(user: user));
  }

  void updateCertification(Certification certification) {
    final current = state.value;
    if (current != null) state = AsyncData(current.copyWith(certification: certification));
  }
}

/// Người dùng hiện tại (null = Guest / đang tải).
final currentUserProvider = Provider<AppUser?>((ref) => ref.watch(sessionProvider).value?.user);

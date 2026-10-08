import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/data/data_revision.dart';
import '../../../catalog/data/catalog_repository_provider.dart';
import '../../../catalog/domain/entities/catalog.dart';
import '../../data/course_repository_provider.dart';
import '../../domain/entities/coach_class.dart';
import '../../domain/entities/course.dart';

/// Bộ lọc màn Khám phá khóa học.
final classQueryProvider = NotifierProvider<ClassQueryNotifier, ClassQuery>(ClassQueryNotifier.new);

class ClassQueryNotifier extends Notifier<ClassQuery> {
  @override
  ClassQuery build() => const ClassQuery();

  void search(String text) => state = state.copyWith(search: text, page: 1);

  void filters({String? sportId, ClassType? classType, AreaType? areaType}) =>
      state = state.withFilters(sportId: sportId, classType: classType, areaType: areaType);
}

class BrowseState {
  const BrowseState({required this.items, required this.page, required this.hasMore, this.loadingMore = false});

  final List<CourseClass> items;
  final int page;
  final bool hasMore;
  final bool loadingMore;
}

/// Danh sách khóa học có "tải thêm" khi cuộn.
final browseClassesProvider = AsyncNotifierProvider.autoDispose<BrowseNotifier, BrowseState>(BrowseNotifier.new);

class BrowseNotifier extends AsyncNotifier<BrowseState> {
  @override
  Future<BrowseState> build() async {
    ref.watch(dataRevisionProvider);
    final q = ref.watch(classQueryProvider);
    final page = await ref.read(courseRepositoryProvider).browse(q.copyWith(page: 1));
    return BrowseState(items: page.items, page: 1, hasMore: page.hasMore);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore) return;
    state = AsyncData(BrowseState(items: current.items, page: current.page, hasMore: true, loadingMore: true));
    try {
      final q = ref.read(classQueryProvider).copyWith(page: current.page + 1);
      final next = await ref.read(courseRepositoryProvider).browse(q);
      state = AsyncData(BrowseState(items: [...current.items, ...next.items], page: next.page, hasMore: next.hasMore));
    } on Object {
      // Giữ danh sách hiện có; lần cuộn sau sẽ thử tải lại.
      state = AsyncData(BrowseState(items: current.items, page: current.page, hasMore: current.hasMore));
    }
  }
}

final courseDetailProvider = FutureProvider.autoDispose.family<CourseDetail, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(courseRepositoryProvider).detail(id);
});

final myCoursesProvider = FutureProvider.autoDispose<List<MyCourse>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(courseRepositoryProvider).myCourses();
});

final coachClassesProvider = FutureProvider.autoDispose<List<CourseClass>>((ref) {
  ref.watch(dataRevisionProvider);
  return ref.watch(courseRepositoryProvider).coachClasses();
});

final coachClassDetailProvider = FutureProvider.autoDispose.family<CoachClassDetail, String>((ref, id) {
  ref.watch(dataRevisionProvider);
  return ref.watch(courseRepositoryProvider).coachClassDetail(id);
});

final sportsProvider = FutureProvider<List<Sport>>((ref) => ref.watch(catalogRepositoryProvider).sports());

final roomsProvider = FutureProvider.family<List<Room>, AreaType?>(
  (ref, area) => ref.watch(catalogRepositoryProvider).rooms(areaType: area),
);

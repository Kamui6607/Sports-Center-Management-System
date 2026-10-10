import '../core/network/json.dart';
import '../features/training/domain/entities/training.dart';

/// Ánh xạ lộ trình tập luyện của BE (`TrainingPlan` + `results`) ⇒ entity.
abstract final class TrainingJson {
  static TrainingPlan plan(Json p, {String? memberName}) => TrainingPlan(
    id: p.str('id'),
    name: p.str('name'),
    description: p.strOrNull('description'),
    startDate: p.date('startDate'),
    endDate: p.date('endDate'),
    coachProfileId: p.str('coachId'),
    coachName: p.obj('coach').obj('user').str('fullName'),
    memberProfileId: p.str('memberId'),
    // BE-17: danh sách & chi tiết đều kèm `member.user`.
    memberName: p.obj('member').obj('user').str('fullName', memberName ?? ''),
    results: [for (final r in p.objList('results')) result(r)]..sort((a, b) => b.date.compareTo(a.date)),
  );

  /// `metrics` của BE: `[{ name, value:number, unit?, note?, lowerIsBetter? }]` (L9).
  static TrainingResult result(Json r) {
    final raw = r['metrics'];
    final metrics = <TrainingMetric>[];
    if (raw is List) {
      for (final m in asJsonList(raw)) {
        metrics.add(
          TrainingMetric(
            name: m.str('name'),
            value: m['value'] is num ? m.dbl('value') : null,
            unit: m.strOrNull('unit'),
            note: m.strOrNull('note'),
            lowerIsBetter: m.boolean('lowerIsBetter'),
          ),
        );
      }
    } else if (raw is Map) {
      // Dữ liệu cũ dạng object `{ "Cân nặng": 58 }`.
      asJson(raw).forEach(
        (k, v) =>
            metrics.add(TrainingMetric(name: k, value: v is num ? v.toDouble() : null, note: v is num ? null : '$v')),
      );
    }
    return TrainingResult(id: r.str('id'), date: r.date('date'), metrics: metrics, coachNote: r.strOrNull('coachNote'));
  }

  /// [TrainingMetric] ⇒ body `ProgressMetric` của BE.
  static Map<String, Object?> metric(TrainingMetric m) => {
    'name': m.name.trim(),
    'value': m.value,
    if (m.unit?.trim().isNotEmpty ?? false) 'unit': m.unit!.trim(),
    if (m.note?.trim().isNotEmpty ?? false) 'note': m.note!.trim(),
    if (m.lowerIsBetter) 'lowerIsBetter': true,
  };
}

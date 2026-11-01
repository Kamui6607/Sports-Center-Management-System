import '../../../api/makeup_json.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/json.dart';
import '../domain/entities/makeup.dart';
import '../domain/repositories/makeup_repository.dart';

/// [MakeupRepository] gọi BE thật — module `makeup-requests`.
class MakeupApiRepository implements MakeupRepository {
  MakeupApiRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<MakeupRequest>> myRequests() async => [
    for (final r in (await _api.get('/makeup-requests/my')).list) MakeupJson.request(r),
  ];

  @override
  Future<MakeupRequest> requestForAbsence(String enrollmentId) async =>
      MakeupJson.request((await _api.post('/enrollments/$enrollmentId/makeup-request')).json);

  @override
  Future<void> cancel(String requestId) => _api.delete('/makeup-requests/$requestId');

  @override
  Future<List<MakeupRequest>> coachRequests({MakeupStatus? status}) async => [
    for (final r in await _api.getAll(
      '/makeup-requests',
      query: {if (status != null) 'status': status.name.toUpperCase()},
    ))
      MakeupJson.request(r),
  ];

  @override
  Future<({MakeupRequest request, List<MakeupOption> options})> options(String requestId) async {
    final d = (await _api.get('/makeup-requests/$requestId/options')).json;
    return (
      request: MakeupJson.request(d.obj('request')),
      options: [for (final o in d.objList('options')) MakeupJson.option(o)],
    );
  }

  @override
  Future<void> assign(String requestId, String sessionId) =>
      _api.post('/makeup-requests/$requestId/assign', body: {'scheduleId': sessionId});

  @override
  Future<void> reject(String requestId, String reason) =>
      _api.post('/makeup-requests/$requestId/reject', body: {'reason': reason.trim()});

  @override
  Future<OpenMakeupSlotResult> openSlot(OpenMakeupSlotInput input) async {
    final d = (await _api.post(
      '/makeup-requests/slots',
      body: {
        'classId': input.classId,
        'startTime': input.start.toUtc().toIso8601String(),
        'endTime': input.end.toUtc().toIso8601String(),
        'roomId': ?input.roomId,
        'capacity': ?input.capacity,
        if (input.assignRequestIds.isNotEmpty) 'assignRequestIds': input.assignRequestIds,
      },
    )).json;
    return OpenMakeupSlotResult(
      slot: MakeupJson.session(d.obj('slot')),
      assignedCount: d.strList('assigned').length,
      failedCount: d.objList('failed').length,
    );
  }
}

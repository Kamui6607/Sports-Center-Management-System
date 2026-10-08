/// Khu vực tập (`AreaType`).
enum AreaType { pool, indoor, outdoor }

/// Bộ môn (`Sport`, bảng `Fitness` dưới DB).
class Sport {
  const Sport({required this.id, required this.name, this.description, this.areaTypes = const []});

  final String id;
  final String name;
  final String? description;
  final List<AreaType> areaTypes;
}

/// Phòng tập (`Room`).
class Room {
  const Room({required this.id, required this.name, required this.capacity, required this.areaType, this.location});

  final String id;
  final String name;
  final int capacity;
  final AreaType areaType;
  final String? location;
}

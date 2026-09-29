class AdminSummary {
  const AdminSummary({
    required this.students,
    required this.pending,
    required this.credits,
  });

  final int students;
  final int pending;
  final double credits;

  AdminSummary copyWith({int? students, int? pending, double? credits}) =>
      AdminSummary(
        students: students ?? this.students,
        pending: pending ?? this.pending,
        credits: credits ?? this.credits,
      );

  factory AdminSummary.fromJson(Map<String, dynamic> json) => AdminSummary(
    students: _integer(json['students']),
    pending: _integer(json['pending']),
    credits: _number(json['credits']),
  );
}

class Student {
  const Student({
    required this.id,
    required this.name,
    required this.email,
    required this.verified,
    required this.credits,
    required this.branch,
    required this.semester,
    required this.usn,
    required this.contact,
    required this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final bool verified;
  final double credits;
  final String branch;
  final String semester;
  final String usn;
  final String contact;
  final DateTime? createdAt;

  Student copyWith({bool? verified, double? credits}) => Student(
    id: id,
    name: name,
    email: email,
    verified: verified ?? this.verified,
    credits: credits ?? this.credits,
    branch: branch,
    semester: semester,
    usn: usn,
    contact: contact,
    createdAt: createdAt,
  );

  String get initials {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'S';
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }

  String get searchable =>
      '$name $email $branch $semester $usn $contact'.toLowerCase();

  factory Student.fromJson(Map<String, dynamic> json) => Student(
    id: '${json['id'] ?? ''}',
    name: '${json['name'] ?? 'Unnamed student'}',
    email: '${json['email'] ?? ''}',
    verified: json['verified'] == true,
    credits: _number(json['credits']),
    branch: _text(json['branch'], 'Not provided'),
    semester: _text(json['semester'], 'Not provided'),
    usn: _text(json['usn'], 'Not provided'),
    contact: _text(json['contactNumber'] ?? json['contact'], 'Not provided'),
    createdAt: DateTime.tryParse('${json['createdAt'] ?? ''}'),
  );
}

class AdminDashboardData {
  const AdminDashboardData({
    required this.users,
    required this.summary,
    this.page = 1,
    this.hasMore = false,
  });

  final List<Student> users;
  final AdminSummary summary;
  final int page;
  final bool hasMore;

  AdminDashboardData copyWith({
    List<Student>? users,
    AdminSummary? summary,
    int? page,
    bool? hasMore,
  }) => AdminDashboardData(
    users: users ?? this.users,
    summary: summary ?? this.summary,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
  );

  factory AdminDashboardData.fromJson(Map<String, dynamic> json) {
    final users = (json['users'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .where((user) => user['role'] == 'student')
        .map(Student.fromJson)
        .where((student) => student.id.isNotEmpty)
        .toList();
    return AdminDashboardData(
      users: users,
      summary: AdminSummary.fromJson(
        (json['summary'] as Map<String, dynamic>?) ?? const {},
      ),
      page: _integer(
        (json['pagination'] as Map<String, dynamic>?)?['page'],
      ).clamp(1, 1000000),
      hasMore:
          (json['pagination'] as Map<String, dynamic>?)?['hasMore'] == true,
    );
  }
}

class Purchase {
  const Purchase({
    required this.id,
    required this.itemId,
    required this.name,
    required this.category,
    required this.purchasedAt,
  });

  final String id;
  final String itemId;
  final String name;
  final String category;
  final DateTime? purchasedAt;

  factory Purchase.fromJson(Map<String, dynamic> json) => Purchase(
    id: '${json['id'] ?? ''}',
    itemId: '${json['itemId'] ?? ''}',
    name: '${json['name'] ?? json['itemId'] ?? 'Model'}',
    category: '${json['category'] ?? 'AI model'}',
    purchasedAt: DateTime.tryParse('${json['purchasedAt'] ?? ''}'),
  );
}

class ModelUsage {
  const ModelUsage({required this.requests, required this.credits});
  final int requests;
  final double credits;

  factory ModelUsage.fromJson(Map<String, dynamic> json) => ModelUsage(
    requests: _integer(json['requests']),
    credits: _number(json['credits']),
  );
}

class StudentUsage {
  const StudentUsage({
    required this.purchases,
    required this.usageByModel,
    required this.total,
  });
  final List<Purchase> purchases;
  final Map<String, ModelUsage> usageByModel;
  final ModelUsage total;

  factory StudentUsage.fromJson(Map<String, dynamic> json) {
    final rawUsage =
        (json['usageByModel'] as Map<String, dynamic>?) ?? const {};
    return StudentUsage(
      purchases: (json['purchases'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(Purchase.fromJson)
          .toList(),
      usageByModel: rawUsage.map(
        (key, value) =>
            MapEntry(key, ModelUsage.fromJson(value as Map<String, dynamic>)),
      ),
      total: ModelUsage.fromJson(
        (json['total'] as Map<String, dynamic>?) ?? const {},
      ),
    );
  }
}

double _number(dynamic value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
int _integer(dynamic value) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? 0;
String _text(dynamic value, String fallback) =>
    value == null || '$value'.trim().isEmpty ? fallback : '$value';

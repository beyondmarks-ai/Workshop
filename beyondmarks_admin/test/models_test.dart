import 'package:beyondmarks_admin/src/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('dashboard payload maps students and summary safely', () {
    final data = AdminDashboardData.fromJson({
      'summary': {'students': 2, 'pending': 1, 'credits': 1804.9},
      'users': [
        {
          'id': 'abc',
          'role': 'student',
          'name': 'Rakesh Kumar',
          'email': 'rakesh@example.com',
          'verified': true,
          'credits': 42.5,
          'branch': 'CSE',
          'semester': '6',
        },
      ],
    });

    expect(data.summary.students, 2);
    expect(data.summary.credits, 1804.9);
    expect(data.users.single.initials, 'RK');
    expect(data.users.single.credits, 42.5);
    expect(data.users.single.usn, 'Not provided');
  });

  test('usage payload maps purchases and exact decimal credits', () {
    final usage = StudentUsage.fromJson({
      'purchases': [
        {'id': 'purchase-1', 'itemId': 'gpt-5.6-luna', 'name': 'Luna'},
      ],
      'usageByModel': {
        'gpt-5.6-luna': {'requests': 3, 'credits': 4.5},
      },
      'total': {'requests': 3, 'credits': 4.5},
    });

    expect(usage.purchases.single.itemId, 'gpt-5.6-luna');
    expect(usage.usageByModel['gpt-5.6-luna']?.credits, 4.5);
    expect(usage.total.requests, 3);
  });
}

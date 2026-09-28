import 'package:beyondmarks_admin/src/admin_api.dart';
import 'package:beyondmarks_admin/src/admin_controller.dart';
import 'package:beyondmarks_admin/src/admin_dashboard.dart';
import 'package:beyondmarks_admin/src/models.dart';
import 'package:beyondmarks_admin/src/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final sampleData = AdminDashboardData.fromJson({
    'summary': {'students': 24, 'pending': 3, 'credits': 1804.9},
    'users': List.generate(
      8,
      (index) => {
        'id': 'student-$index',
        'role': 'student',
        'name': index == 0 ? 'Rakesh Kumar' : 'Student ${index + 1}',
        'email': 'student${index + 1}@example.com',
        'verified': index % 3 != 0,
        'credits': 100 - (index * 4.5),
        'branch': index.isEven ? 'Computer Science' : 'Electronics',
        'semester': '${(index % 8) + 1}',
        'usn': 'BM2026${index + 1}',
      },
    ),
  });

  Future<void> render(WidgetTester tester, Size size, String golden) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = AdminController(AdminApi())
      ..data = sampleData
      ..sessionState = AdminSessionState.signedIn;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildAdminTheme(),
        home: AdminDashboard(controller: controller),
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(find.byType(AdminDashboard), matchesGoldenFile(golden));
  }

  testWidgets(
    'phone dashboard layout',
    (tester) =>
        render(tester, const Size(390, 844), 'goldens/dashboard_phone.png'),
  );
  testWidgets(
    'desktop dashboard layout',
    (tester) =>
        render(tester, const Size(1440, 900), 'goldens/dashboard_desktop.png'),
  );
}

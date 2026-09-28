import 'package:flutter/material.dart';

import 'src/admin_api.dart';
import 'src/admin_controller.dart';
import 'src/admin_dashboard.dart';
import 'src/login_screen.dart';
import 'src/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const BeyondMarksAdminApp());
}

class BeyondMarksAdminApp extends StatefulWidget {
  const BeyondMarksAdminApp({super.key});

  @override
  State<BeyondMarksAdminApp> createState() => _BeyondMarksAdminAppState();
}

class _BeyondMarksAdminAppState extends State<BeyondMarksAdminApp> {
  late final AdminController controller;

  @override
  void initState() {
    super.initState();
    controller = AdminController(AdminApi())..initialize();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BeyondMarks Admin',
      debugShowCheckedModeBanner: false,
      theme: buildAdminTheme(),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) => switch (controller.sessionState) {
          AdminSessionState.checking => const _LaunchScreen(),
          AdminSessionState.signedOut => LoginScreen(controller: controller),
          AdminSessionState.signedIn => AdminDashboard(controller: controller),
        },
      ),
    );
  }
}

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

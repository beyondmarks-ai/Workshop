import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import 'models.dart';

class AdminApiException implements Exception {
  const AdminApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  bool get unauthorized => statusCode == 401;
  @override
  String toString() => message;
}

class AdminApi {
  AdminApi({http.Client? client, FlutterSecureStorage? storage})
    : _client = client ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage();

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://dashboard.beyondmarks.ai',
  );
  static const _tokenKey = 'beyondmarks_admin_session';
  static const _emailKey = 'beyondmarks_admin_email';
  static const _pinKey = 'beyondmarks_admin_pin';
  final http.Client _client;
  final FlutterSecureStorage _storage;
  String? _token;

  Future<bool> restoreSession() async {
    _token = await _storage.read(key: _tokenKey);
    if (_token?.isNotEmpty == true) return true;
    return _renewSession();
  }

  Future<void> login({required String email, required String pin}) async {
    final cleanEmail = email.trim();
    final cleanPin = pin.trim();
    final result = await _loginRequest(cleanEmail, cleanPin);
    final token = '${result['token'] ?? ''}';
    if (token.isEmpty) {
      throw const AdminApiException(
        'The server did not return an admin session.',
      );
    }
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _emailKey, value: cleanEmail);
    await _storage.write(key: _pinKey, value: cleanPin);
  }

  Future<Map<String, dynamic>> _loginRequest(String email, String pin) => _post(
    {'action': 'verify-admin-app', 'email': email, 'pin': pin},
    authenticated: false,
  );

  Future<bool> _renewSession() async {
    final email = await _storage.read(key: _emailKey);
    final pin = await _storage.read(key: _pinKey);
    if (email?.isNotEmpty != true || pin?.isNotEmpty != true) return false;
    try {
      final result = await _loginRequest(email!, pin!);
      final token = '${result['token'] ?? ''}';
      if (token.isEmpty) return false;
      _token = token;
      await _storage.write(key: _tokenKey, value: token);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    try {
      if (_token != null) await _post({'action': 'logout-admin'});
    } catch (_) {
      // Local sign-out must still succeed if the network is unavailable.
    } finally {
      _token = null;
      await _storage.delete(key: _tokenKey);
      await _storage.delete(key: _emailKey);
      await _storage.delete(key: _pinKey);
    }
  }

  Future<AdminDashboardData> dashboard({int page = 1}) async {
    var response = await _client
        .get(_uri('/api/admin?page=$page&pageSize=40'), headers: _headers())
        .timeout(const Duration(seconds: 25));
    if (response.statusCode == 401 && await _renewSession()) {
      response = await _client
          .get(_uri('/api/admin?page=$page&pageSize=40'), headers: _headers())
          .timeout(const Duration(seconds: 25));
    }
    return AdminDashboardData.fromJson(_decode(response));
  }

  Future<void> verifyStudent(String studentId) =>
      _post({'action': 'verify-student', 'studentId': studentId}).then((_) {});
  Future<void> revokeStudent(String studentId) =>
      _post({'action': 'revoke-student', 'studentId': studentId}).then((_) {});
  Future<void> deleteStudent(String studentId) =>
      _post({'action': 'delete-student', 'studentId': studentId}).then((_) {});

  Future<void> adjustCredits({
    required List<String> studentIds,
    required double delta,
    required String note,
  }) => _post({
    'action': 'adjust-credits-bulk',
    'studentIds': studentIds,
    'delta': delta,
    'note': note.trim(),
  }).then((_) {});

  Future<int> sendNotification({
    required List<String> studentIds,
    required bool allStudents,
    required String title,
    required String message,
  }) async {
    final result = await _post({
      'action': 'send-notification',
      'studentIds': studentIds,
      'allStudents': allStudents,
      'title': title.trim(),
      'message': message.trim(),
    });
    return (result['sent'] as num?)?.toInt() ?? 0;
  }

  Future<String> polish(String comment) async {
    final result = await _post({
      'action': 'polish-comment',
      'comment': comment.trim(),
    });
    return '${result['comment'] ?? comment}';
  }

  Future<StudentUsage> studentUsage(String studentId) async {
    final result = await _post({
      'action': 'student-usage',
      'studentId': studentId,
    });
    return StudentUsage.fromJson(result);
  }

  Future<StudentUsage> removePurchase(String studentId, String itemId) async {
    await _post({
      'action': 'remove-marketplace-purchase',
      'studentId': studentId,
      'itemId': itemId,
    });
    return studentUsage(studentId);
  }

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Map<String, String> _headers() => {
    'content-type': 'application/json',
    if (_token?.isNotEmpty == true) 'authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> _post(
    Map<String, dynamic> body, {
    bool authenticated = true,
  }) async {
    final headers = authenticated
        ? _headers()
        : {'content-type': 'application/json'};
    var response = await _client
        .post(_uri('/api/admin'), headers: headers, body: jsonEncode(body))
        .timeout(const Duration(seconds: 30));
    if (authenticated && response.statusCode == 401 && await _renewSession()) {
      response = await _client
          .post(_uri('/api/admin'), headers: _headers(), body: jsonEncode(body))
          .timeout(const Duration(seconds: 30));
    }
    return _decode(response);
  }

  Map<String, dynamic> _decode(http.Response response) {
    Map<String, dynamic> payload = {};
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) payload = decoded;
    } catch (_) {}
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AdminApiException(
        '${payload['error'] ?? 'Request failed. Please try again.'}',
        statusCode: response.statusCode,
      );
    }
    return payload;
  }
}

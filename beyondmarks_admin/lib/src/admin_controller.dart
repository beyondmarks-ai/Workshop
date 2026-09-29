import 'package:flutter/foundation.dart';

import 'admin_api.dart';
import 'models.dart';

enum AdminSessionState { checking, signedOut, signedIn }

class AdminController extends ChangeNotifier {
  AdminController(this.api);
  final AdminApi api;

  AdminSessionState sessionState = AdminSessionState.checking;
  AdminDashboardData? data;
  String? error;
  bool refreshing = false;
  bool loadingMore = false;
  final Set<String> busyActions = {};
  final Map<String, StudentUsage> usage = {};

  Future<void> initialize() async {
    if (!await api.restoreSession()) {
      sessionState = AdminSessionState.signedOut;
      notifyListeners();
      return;
    }
    try {
      await refresh();
      sessionState = AdminSessionState.signedIn;
    } on AdminApiException catch (exception) {
      if (exception.unauthorized) await api.logout();
      error = exception.unauthorized ? null : exception.message;
      sessionState = AdminSessionState.signedOut;
    } catch (_) {
      error =
          'Could not connect to BeyondMarks. Check your internet connection.';
      sessionState = AdminSessionState.signedOut;
    }
    notifyListeners();
  }

  Future<bool> login(String email, String pin) async {
    error = null;
    _busy('login', true);
    try {
      await api.login(email: email, pin: pin);
      data = await api.dashboard(page: 1);
      sessionState = AdminSessionState.signedIn;
      return true;
    } on AdminApiException catch (exception) {
      error = exception.message;
      return false;
    } catch (_) {
      error =
          'Could not connect to BeyondMarks. Check your internet connection.';
      return false;
    } finally {
      _busy('login', false);
    }
  }

  Future<void> loadMore() async {
    final current = data;
    if (current == null || !current.hasMore || loadingMore) return;
    loadingMore = true;
    notifyListeners();
    try {
      final next = await api.dashboard(page: current.page + 1);
      final known = current.users.map((student) => student.id).toSet();
      data = next.copyWith(
        users: [
          ...current.users,
          ...next.users.where((student) => !known.contains(student.id)),
        ],
      );
    } on AdminApiException catch (exception) {
      error = exception.message;
    } catch (_) {
      error = 'Could not load more students. Check your connection.';
    } finally {
      loadingMore = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await api.logout();
    data = null;
    usage.clear();
    sessionState = AdminSessionState.signedOut;
    notifyListeners();
  }

  Future<void> refresh() async {
    refreshing = true;
    error = null;
    notifyListeners();
    try {
      data = await api.dashboard();
    } on AdminApiException catch (exception) {
      if (exception.unauthorized) {
        await api.logout();
        sessionState = AdminSessionState.signedOut;
      }
      error = exception.message;
      rethrow;
    } catch (_) {
      error = 'Could not refresh the dashboard. Check your connection.';
      rethrow;
    } finally {
      refreshing = false;
      notifyListeners();
    }
  }

  Future<bool> run(
    String key,
    Future<void> Function() action, {
    bool reload = true,
  }) async {
    error = null;
    _busy(key, true);
    try {
      await action();
      if (reload) data = await api.dashboard();
      return true;
    } on AdminApiException catch (exception) {
      error = exception.message;
      if (exception.unauthorized) {
        await api.logout();
        sessionState = AdminSessionState.signedOut;
      }
      return false;
    } catch (_) {
      error = 'The action could not be completed. Please try again.';
      return false;
    } finally {
      _busy(key, false);
    }
  }

  Future<bool> verifyStudent(String studentId) =>
      run('verify:$studentId', () async {
        await api.verifyStudent(studentId);
        _setVerified(studentId, true);
      }, reload: false);

  Future<bool> revokeStudent(String studentId) =>
      run('revoke:$studentId', () async {
        await api.revokeStudent(studentId);
        _setVerified(studentId, false);
      }, reload: false);

  Future<bool> deleteStudent(String studentId) =>
      run('delete:$studentId', () async {
        await api.deleteStudent(studentId);
        final current = data;
        if (current == null) return;
        Student? removed;
        for (final student in current.users) {
          if (student.id == studentId) removed = student;
        }
        data = current.copyWith(
          users: current.users
              .where((student) => student.id != studentId)
              .toList(),
          summary: current.summary.copyWith(
            students: current.summary.students - 1,
            pending: removed != null && !removed.verified
                ? current.summary.pending - 1
                : current.summary.pending,
            credits: removed == null
                ? current.summary.credits
                : current.summary.credits - removed.credits,
          ),
        );
        usage.remove(studentId);
      }, reload: false);

  void _setVerified(String studentId, bool verified) {
    final current = data;
    if (current == null) return;
    Student? existing;
    for (final student in current.users) {
      if (student.id == studentId) existing = student;
    }
    if (existing == null || existing.verified == verified) return;
    data = current.copyWith(
      users: current.users
          .map(
            (student) => student.id == studentId
                ? student.copyWith(verified: verified)
                : student,
          )
          .toList(),
      summary: current.summary.copyWith(
        pending: current.summary.pending + (verified ? -1 : 1),
      ),
    );
  }

  Future<StudentUsage?> loadUsage(
    String studentId, {
    bool force = false,
  }) async {
    if (!force && usage.containsKey(studentId)) return usage[studentId];
    final key = 'usage:$studentId';
    _busy(key, true);
    try {
      final result = await api.studentUsage(studentId);
      usage[studentId] = result;
      return result;
    } on AdminApiException catch (exception) {
      error = exception.message;
      return null;
    } catch (_) {
      error = 'Could not load this student’s usage.';
      return null;
    } finally {
      _busy(key, false);
    }
  }

  void clearError() {
    error = null;
    notifyListeners();
  }

  bool isBusy(String key) => busyActions.contains(key);

  void _busy(String key, bool value) {
    value ? busyActions.add(key) : busyActions.remove(key);
    notifyListeners();
  }
}

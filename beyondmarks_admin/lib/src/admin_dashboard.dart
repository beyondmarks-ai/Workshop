import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import 'admin_controller.dart';
import 'models.dart';
import 'theme.dart';

enum StudentFilter { all, pending, verified }

class AdminDashboard extends StatefulWidget {
  const AdminDashboard({super.key, required this.controller});
  final AdminController controller;

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  final searchController = TextEditingController();
  final selected = <String>{};
  StudentFilter filter = StudentFilter.all;
  String? expandedId;

  List<Student> get students {
    final query = searchController.text.trim().toLowerCase();
    return (widget.controller.data?.users ?? const <Student>[]).where((
      student,
    ) {
      final matchesQuery = query.isEmpty || student.searchable.contains(query);
      final matchesFilter =
          filter == StudentFilter.all ||
          (filter == StudentFilter.verified && student.verified) ||
          (filter == StudentFilter.pending && !student.verified);
      return matchesQuery && matchesFilter;
    }).toList();
  }

  @override
  void dispose() {
    searchController.dispose();
    super.dispose();
  }

  void notice(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: error
              ? const Color(0xFFB4233C)
              : const Color(0xFF087D66),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  Future<void> run(
    String key,
    Future<void> Function() action,
    String success,
  ) async {
    final ok = await widget.controller.run(key, action);
    if (!mounted) return;
    notice(
      ok ? success : (widget.controller.error ?? 'Action failed.'),
      error: !ok,
    );
  }

  Future<bool> confirm(
    String title,
    String message, {
    String confirmText = 'Continue',
    bool destructive = false,
  }) async {
    return await showAdaptiveDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                style: destructive
                    ? FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFB4233C),
                      )
                    : null,
                onPressed: () => Navigator.pop(context, true),
                child: Text(confirmText),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> toggleDetails(Student student) async {
    setState(() => expandedId = expandedId == student.id ? null : student.id);
    if (expandedId == student.id) await widget.controller.loadUsage(student.id);
  }

  Future<void> adjustCredits() async {
    if (selected.isEmpty) return;
    final amount = TextEditingController();
    final note = TextEditingController();
    var add = true;
    var polishing = false;
    final submitted = await showAdaptiveDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Adjust student credits'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '${selected.length} student${selected.length == 1 ? '' : 's'} selected',
                    style: const TextStyle(color: Color(0xFF667085)),
                  ),
                  const SizedBox(height: 16),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(
                        value: true,
                        icon: Icon(Icons.add_rounded),
                        label: Text('Add'),
                      ),
                      ButtonSegment(
                        value: false,
                        icon: Icon(Icons.remove_rounded),
                        label: Text('Remove'),
                      ),
                    ],
                    selected: {add},
                    onSelectionChanged: (value) =>
                        setDialogState(() => add = value.first),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                        RegExp(r'^\d*\.?\d{0,2}'),
                      ),
                    ],
                    decoration: const InputDecoration(
                      labelText: 'Credit amount',
                      prefixIcon: Icon(Icons.toll_rounded),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: note,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 500,
                    decoration: const InputDecoration(
                      labelText: 'Reason',
                      alignLabelWithHint: true,
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: polishing || note.text.trim().isEmpty
                          ? null
                          : () async {
                              setDialogState(() => polishing = true);
                              try {
                                note.text = await widget.controller.api.polish(
                                  note.text,
                                );
                              } catch (error) {
                                if (mounted) notice('$error', error: true);
                              } finally {
                                setDialogState(() => polishing = false);
                              }
                            },
                      icon: polishing
                          ? const SizedBox.square(
                              dimension: 15,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.auto_fix_high_rounded),
                      label: const Text('Polish reason'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                final value = double.tryParse(amount.text);
                if (value == null || value <= 0 || note.text.trim().isEmpty) {
                  notice('Enter a valid amount and reason.', error: true);
                  return;
                }
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Apply adjustment'),
            ),
          ],
        ),
      ),
    );
    final value = double.tryParse(amount.text);
    if (submitted == true && value != null) {
      final ids = selected.toList();
      await run(
        'bulk',
        () => widget.controller.api.adjustCredits(
          studentIds: ids,
          delta: add ? value : -value,
          note: note.text,
        ),
        'Credits updated for ${ids.length} student${ids.length == 1 ? '' : 's'}.',
      );
      if (mounted) setState(selected.clear);
    }
    amount.dispose();
    note.dispose();
  }

  Future<void> sendNotification() async {
    final title = TextEditingController();
    final message = TextEditingController();
    var allStudents = selected.isEmpty;
    var polishing = false;
    final submitted = await showAdaptiveDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Send notification'),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 500),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SwitchListTile.adaptive(
                    value: allStudents,
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Send to all students'),
                    subtitle: Text(
                      allStudents
                          ? 'Every student will receive this message.'
                          : '${selected.length} selected recipient${selected.length == 1 ? '' : 's'}.',
                    ),
                    onChanged: (value) =>
                        setDialogState(() => allStudents = value),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: title,
                    maxLength: 100,
                    decoration: const InputDecoration(labelText: 'Title'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: message,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 1000,
                    decoration: const InputDecoration(
                      labelText: 'Message',
                      alignLabelWithHint: true,
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: polishing || message.text.trim().isEmpty
                          ? null
                          : () async {
                              setDialogState(() => polishing = true);
                              try {
                                message.text = await widget.controller.api
                                    .polish(message.text);
                              } catch (error) {
                                if (mounted) notice('$error', error: true);
                              } finally {
                                setDialogState(() => polishing = false);
                              }
                            },
                      icon: polishing
                          ? const SizedBox.square(
                              dimension: 15,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.auto_fix_high_rounded),
                      label: const Text('Polish message'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                if (title.text.trim().isEmpty ||
                    message.text.trim().isEmpty ||
                    (!allStudents && selected.isEmpty)) {
                  notice('Add a title, message, and recipient.', error: true);
                  return;
                }
                Navigator.pop(dialogContext, true);
              },
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );
    if (submitted == true) {
      var count = 0;
      final ok = await widget.controller.run('notification', () async {
        count = await widget.controller.api.sendNotification(
          studentIds: selected.toList(),
          allStudents: allStudents,
          title: title.text,
          message: message.text,
        );
      }, reload: false);
      if (mounted) {
        notice(
          ok
              ? 'Notification sent to $count student${count == 1 ? '' : 's'}.'
              : (widget.controller.error ?? 'Notification failed.'),
          error: !ok,
        );
      }
    }
    title.dispose();
    message.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.controller.data;
    if (data == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final visible = students;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        toolbarHeight: 68,
        titleSpacing: 20,
        title: const Row(
          children: [
            CircleAvatar(
              backgroundColor: teal,
              foregroundColor: Colors.white,
              child: Icon(Icons.auto_awesome_rounded, size: 20),
            ),
            SizedBox(width: 11),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'BeyondMarks',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
                Text(
                  'ADMIN CONSOLE',
                  style: TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.7,
                    color: mint,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: widget.controller.refreshing
                ? null
                : () => widget.controller.refresh().catchError((_) {}),
            icon: widget.controller.refreshing
                ? const SizedBox.square(
                    dimension: 19,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: widget.controller.logout,
            icon: const Icon(Icons.logout_rounded),
          ),
          const SizedBox(width: 10),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: sendNotification,
        backgroundColor: teal,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.notifications_active_outlined),
        label: const Text('Notify'),
      ),
      body: RefreshIndicator(
        onRefresh: () => widget.controller.refresh().catchError((_) {}),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(
            parent: BouncingScrollPhysics(),
          ),
          slivers: [
            SliverToBoxAdapter(child: _Header(summary: data.summary)),
            SliverToBoxAdapter(
              child: _Toolbar(
                controller: searchController,
                filter: filter,
                selectedCount: selected.length,
                onSearch: (_) => setState(() {}),
                onFilter: (value) => setState(() => filter = value),
                onAdjust: adjustCredits,
                onClear: () => setState(selected.clear),
              ),
            ),
            if (widget.controller.error != null)
              SliverToBoxAdapter(
                child: _PageError(
                  message: widget.controller.error!,
                  onDismiss: widget.controller.clearError,
                ),
              ),
            if (visible.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyStudents(),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    final student = visible[index];
                    return Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1180),
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: StudentCard(
                            student: student,
                            selected: selected.contains(student.id),
                            expanded: expandedId == student.id,
                            usage: widget.controller.usage[student.id],
                            usageBusy: widget.controller.isBusy(
                              'usage:${student.id}',
                            ),
                            actionBusy: widget.controller.busyActions.any(
                              (key) => key.endsWith(student.id),
                            ),
                            onSelected: (value) => setState(
                              () => value
                                  ? selected.add(student.id)
                                  : selected.remove(student.id),
                            ),
                            onExpand: () => toggleDetails(student),
                            onVerify: () async {
                              final ok = await widget.controller.verifyStudent(
                                student.id,
                              );
                              if (mounted) {
                                notice(
                                  ok
                                      ? '${student.name} now has access.'
                                      : (widget.controller.error ??
                                            'Verification failed.'),
                                  error: !ok,
                                );
                              }
                            },
                            onRevoke: () async {
                              if (await confirm(
                                'Revoke access?',
                                '${student.name} will be locked out until verified again.',
                                confirmText: 'Revoke',
                                destructive: true,
                              )) {
                                final ok = await widget.controller
                                    .revokeStudent(student.id);
                                if (mounted) {
                                  notice(
                                    ok
                                        ? '${student.name} access revoked.'
                                        : (widget.controller.error ??
                                              'Could not revoke access.'),
                                    error: !ok,
                                  );
                                }
                              }
                            },
                            onDelete: () async {
                              if (await confirm(
                                'Delete student?',
                                'This permanently deletes ${student.name} and cannot be undone.',
                                confirmText: 'Delete',
                                destructive: true,
                              )) {
                                final ok = await widget.controller
                                    .deleteStudent(student.id);
                                if (mounted) {
                                  notice(
                                    ok
                                        ? '${student.name} deleted.'
                                        : (widget.controller.error ??
                                              'Could not delete student.'),
                                    error: !ok,
                                  );
                                }
                                if (mounted) {
                                  setState(() => selected.remove(student.id));
                                }
                              }
                            },
                            onRemovePurchase: (purchase) async {
                              if (!await confirm(
                                'Remove model access?',
                                'Remove ${purchase.name} from ${student.name}?',
                                confirmText: 'Remove',
                                destructive: true,
                              )) {
                                return;
                              }
                              final key = 'model:${student.id}';
                              final ok = await widget.controller.run(
                                key,
                                () async {
                                  widget.controller.usage[student.id] =
                                      await widget.controller.api
                                          .removePurchase(
                                            student.id,
                                            purchase.itemId,
                                          );
                                },
                                reload: false,
                              );
                              if (mounted) {
                                notice(
                                  ok
                                      ? '${purchase.name} access removed.'
                                      : (widget.controller.error ??
                                            'Could not remove model.'),
                                  error: !ok,
                                );
                              }
                            },
                          ),
                        ),
                      ),
                    );
                  }, childCount: visible.length),
                ),
              ),
            if (data.hasMore)
              SliverToBoxAdapter(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 110),
                    child: FilledButton.tonalIcon(
                      onPressed: widget.controller.loadingMore
                          ? null
                          : widget.controller.loadMore,
                      icon: widget.controller.loadingMore
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.expand_more_rounded),
                      label: Text(
                        widget.controller.loadingMore
                            ? 'Loading students…'
                            : 'Load more students',
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.summary});
  final AdminSummary summary;

  @override
  Widget build(BuildContext context) => Container(
    color: navy,
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 30),
    child: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1180),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'ACADEMY OVERVIEW',
              style: TextStyle(
                color: mint,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 7),
            const Text(
              'Student access, at a glance.',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                height: 1.1,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _Metric(
                  icon: Icons.groups_2_outlined,
                  label: 'Students',
                  value: '${summary.students}',
                ),
                _Metric(
                  icon: Icons.hourglass_top_rounded,
                  label: 'Pending',
                  value: '${summary.pending}',
                  warning: summary.pending > 0,
                ),
                _Metric(
                  icon: Icons.toll_rounded,
                  label: 'Credits available',
                  value: NumberFormat('#,##0.##').format(summary.credits),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.icon,
    required this.label,
    required this.value,
    this.warning = false,
  });
  final IconData icon;
  final String label;
  final String value;
  final bool warning;

  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(minWidth: 170),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .08),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.white.withValues(alpha: .1)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: warning ? const Color(0xFFFFC66D) : mint),
        const SizedBox(width: 11),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
            ),
            Text(
              label,
              style: const TextStyle(color: Color(0xFF9DAABD), fontSize: 11),
            ),
          ],
        ),
      ],
    ),
  );
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.controller,
    required this.filter,
    required this.selectedCount,
    required this.onSearch,
    required this.onFilter,
    required this.onAdjust,
    required this.onClear,
  });
  final TextEditingController controller;
  final StudentFilter filter;
  final int selectedCount;
  final ValueChanged<String> onSearch;
  final ValueChanged<StudentFilter> onFilter;
  final VoidCallback onAdjust;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1212),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxWidth < 720;
            final search = TextField(
              controller: controller,
              onChanged: onSearch,
              decoration: InputDecoration(
                hintText: 'Search students',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: controller.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          controller.clear();
                          onSearch('');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            );
            final filters = SegmentedButton<StudentFilter>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: StudentFilter.all, label: Text('All')),
                ButtonSegment(
                  value: StudentFilter.pending,
                  label: Text('Pending'),
                ),
                ButtonSegment(
                  value: StudentFilter.verified,
                  label: Text('Verified'),
                ),
              ],
              selected: {filter},
              onSelectionChanged: (value) => onFilter(value.first),
            );
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (compact) ...[
                  search,
                  const SizedBox(height: 10),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: filters,
                  ),
                ] else
                  Row(
                    children: [
                      Expanded(child: search),
                      const SizedBox(width: 12),
                      filters,
                    ],
                  ),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: selectedCount == 0
                      ? const SizedBox.shrink()
                      : Padding(
                          key: const ValueKey('selection'),
                          padding: const EdgeInsets.only(top: 12),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFE8F7F3),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Wrap(
                              crossAxisAlignment: WrapCrossAlignment.center,
                              spacing: 10,
                              runSpacing: 8,
                              children: [
                                Text(
                                  '$selectedCount selected',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    color: ink,
                                  ),
                                ),
                                FilledButton.tonalIcon(
                                  onPressed: onAdjust,
                                  icon: const Icon(Icons.toll_rounded),
                                  label: const Text('Adjust credits'),
                                ),
                                TextButton(
                                  onPressed: onClear,
                                  child: const Text('Clear'),
                                ),
                              ],
                            ),
                          ),
                        ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

class StudentCard extends StatelessWidget {
  const StudentCard({
    super.key,
    required this.student,
    required this.selected,
    required this.expanded,
    required this.usage,
    required this.usageBusy,
    required this.actionBusy,
    required this.onSelected,
    required this.onExpand,
    required this.onVerify,
    required this.onRevoke,
    required this.onDelete,
    required this.onRemovePurchase,
  });
  final Student student;
  final bool selected;
  final bool expanded;
  final StudentUsage? usage;
  final bool usageBusy;
  final bool actionBusy;
  final ValueChanged<bool> onSelected;
  final VoidCallback onExpand;
  final VoidCallback onVerify;
  final VoidCallback onRevoke;
  final VoidCallback onDelete;
  final ValueChanged<Purchase> onRemovePurchase;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        InkWell(
          onTap: onExpand,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 680;
                final identity = Row(
                  children: [
                    Checkbox(
                      value: selected,
                      onChanged: (value) => onSelected(value ?? false),
                    ),
                    CircleAvatar(
                      backgroundColor: const Color(0xFFE5F5F1),
                      foregroundColor: const Color(0xFF087D66),
                      child: Text(
                        student.initials,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            student.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: ink,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            student.email,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xFF667085),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(
                      expanded
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                    ),
                  ],
                );
                final meta = Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _StatusChip(verified: student.verified),
                    Chip(
                      avatar: const Icon(Icons.toll_rounded, size: 16),
                      label: Text(
                        '${NumberFormat('#,##0.##').format(student.credits)} credits',
                      ),
                    ),
                  ],
                );
                return compact
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [identity, const SizedBox(height: 12), meta],
                      )
                    : Row(
                        children: [
                          Expanded(child: identity),
                          const SizedBox(width: 16),
                          meta,
                        ],
                      );
              },
            ),
          ),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 220),
          crossFadeState: expanded
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          firstChild: const SizedBox(width: double.infinity),
          secondChild: _StudentDetails(
            student: student,
            usage: usage,
            loading: usageBusy,
            disabled: actionBusy,
            onVerify: onVerify,
            onRevoke: onRevoke,
            onDelete: onDelete,
            onRemovePurchase: onRemovePurchase,
          ),
        ),
      ],
    ),
  );
}

class _StudentDetails extends StatelessWidget {
  const _StudentDetails({
    required this.student,
    required this.usage,
    required this.loading,
    required this.disabled,
    required this.onVerify,
    required this.onRevoke,
    required this.onDelete,
    required this.onRemovePurchase,
  });
  final Student student;
  final StudentUsage? usage;
  final bool loading;
  final bool disabled;
  final VoidCallback onVerify;
  final VoidCallback onRevoke;
  final VoidCallback onDelete;
  final ValueChanged<Purchase> onRemovePurchase;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    color: const Color(0xFFFAFCFC),
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 28,
          runSpacing: 14,
          children: [
            _Detail(label: 'Branch', value: student.branch),
            _Detail(label: 'Semester', value: student.semester),
            _Detail(label: 'USN', value: student.usn),
            _Detail(label: 'Contact', value: student.contact),
            _Detail(
              label: 'Joined',
              value: student.createdAt == null
                  ? 'Not available'
                  : DateFormat.yMMMd().format(student.createdAt!.toLocal()),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            if (student.verified)
              OutlinedButton.icon(
                onPressed: disabled ? null : onRevoke,
                icon: const Icon(Icons.lock_outline_rounded),
                label: const Text('Revoke access'),
              )
            else
              FilledButton.icon(
                onPressed: disabled ? null : onVerify,
                icon: const Icon(Icons.verified_rounded),
                label: const Text('Verify access'),
              ),
            TextButton.icon(
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFB4233C),
              ),
              onPressed: disabled ? null : onDelete,
              icon: const Icon(Icons.delete_outline_rounded),
              label: const Text('Delete student'),
            ),
          ],
        ),
        const Divider(height: 34),
        const Text(
          'Purchased models',
          style: TextStyle(fontWeight: FontWeight.w800, color: ink),
        ),
        const SizedBox(height: 10),
        if (loading && usage == null)
          const LinearProgressIndicator()
        else if (usage == null || usage!.purchases.isEmpty)
          const Text(
            'No marketplace models purchased.',
            style: TextStyle(color: Color(0xFF667085)),
          )
        else ...[
          ...usage!.purchases.map((purchase) {
            final modelUsage =
                usage!.usageByModel[purchase.itemId] ??
                const ModelUsage(requests: 0, credits: 0);
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2ECE9)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          purchase.name,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${purchase.category} · ${modelUsage.requests} requests · ${NumberFormat('#,##0.##').format(modelUsage.credits)} credits',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Color(0xFF667085),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Remove access',
                    onPressed: disabled
                        ? null
                        : () => onRemovePurchase(purchase),
                    color: const Color(0xFFB4233C),
                    icon: const Icon(Icons.remove_circle_outline_rounded),
                  ),
                ],
              ),
            );
          }),
          Text(
            'Total usage: ${usage!.total.requests} requests · ${NumberFormat('#,##0.##').format(usage!.total.credits)} credits',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: Color(0xFF087D66),
            ),
          ),
        ],
      ],
    ),
  );
}

class _Detail extends StatelessWidget {
  const _Detail({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 150,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 9,
            letterSpacing: 1.2,
            color: Color(0xFF8A96A8),
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w600, color: ink),
        ),
      ],
    ),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.verified});
  final bool verified;
  @override
  Widget build(BuildContext context) => Chip(
    avatar: Icon(
      verified ? Icons.check_circle_outline_rounded : Icons.lock_clock_outlined,
      size: 16,
    ),
    label: Text(verified ? 'Verified' : 'Pending'),
    side: BorderSide.none,
    backgroundColor: verified
        ? const Color(0xFFE5F5F1)
        : const Color(0xFFFFF3D6),
    labelStyle: TextStyle(
      color: verified ? const Color(0xFF087D66) : const Color(0xFF9A6700),
      fontWeight: FontWeight.w700,
    ),
  );
}

class _PageError extends StatelessWidget {
  const _PageError({required this.message, required this.onDismiss});
  final String message;
  final VoidCallback onDismiss;
  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1180),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: MaterialBanner(
          content: Text(message),
          leading: const Icon(
            Icons.error_outline_rounded,
            color: Color(0xFFB4233C),
          ),
          actions: [
            TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
          ],
        ),
      ),
    ),
  );
}

class _EmptyStudents extends StatelessWidget {
  const _EmptyStudents();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.person_search_rounded, size: 48, color: Color(0xFF9AA8A4)),
          SizedBox(height: 12),
          Text(
            'No students match this view.',
            style: TextStyle(fontWeight: FontWeight.w700, color: ink),
          ),
        ],
      ),
    ),
  );
}

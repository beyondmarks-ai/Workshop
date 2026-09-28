import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'admin_controller.dart';
import 'theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});
  final AdminController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final formKey = GlobalKey<FormState>();
  final emailController = TextEditingController(text: 'admin@beyondmarks.ai');
  final pinController = TextEditingController();
  final codeController = TextEditingController();
  bool hidePin = true;

  @override
  void dispose() {
    emailController.dispose();
    pinController.dispose();
    codeController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (!(formKey.currentState?.validate() ?? false)) return;
    await widget.controller.login(
      emailController.text,
      pinController.text,
      codeController.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final busy = widget.controller.isBusy('login');
    return Scaffold(
      backgroundColor: navy,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(
              top: -100,
              right: -80,
              child: _Glow(size: 320, color: teal),
            ),
            const Positioned(
              bottom: -130,
              left: -100,
              child: _Glow(size: 360, color: Color(0xFF295DA8)),
            ),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Card(
                    elevation: 18,
                    shadowColor: Colors.black45,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(28, 30, 28, 28),
                      child: AutofillGroup(
                        child: Form(
                          key: formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const _BrandMark(),
                              const SizedBox(height: 28),
                              Text(
                                'Admin verification',
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: ink,
                                    ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'Sign in with your PIN and current Google Authenticator code.',
                                style: Theme.of(context).textTheme.bodyMedium
                                    ?.copyWith(
                                      color: const Color(0xFF667085),
                                      height: 1.45,
                                    ),
                              ),
                              const SizedBox(height: 24),
                              TextFormField(
                                controller: emailController,
                                autofillHints: const [AutofillHints.username],
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: 'Admin email',
                                  prefixIcon: Icon(
                                    Icons.alternate_email_rounded,
                                  ),
                                ),
                                validator: (value) =>
                                    value?.trim().contains('@') == true
                                    ? null
                                    : 'Enter a valid email address',
                              ),
                              const SizedBox(height: 14),
                              TextFormField(
                                controller: pinController,
                                obscureText: hidePin,
                                autofillHints: const [AutofillHints.password],
                                keyboardType: TextInputType.number,
                                textInputAction: TextInputAction.next,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                  LengthLimitingTextInputFormatter(6),
                                ],
                                decoration: InputDecoration(
                                  labelText: '6-digit PIN',
                                  prefixIcon: const Icon(
                                    Icons.lock_outline_rounded,
                                  ),
                                  suffixIcon: IconButton(
                                    onPressed: () =>
                                        setState(() => hidePin = !hidePin),
                                    icon: Icon(
                                      hidePin
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                    ),
                                  ),
                                ),
                                validator: (value) => value?.length == 6
                                    ? null
                                    : 'PIN must contain 6 digits',
                              ),
                              const SizedBox(height: 14),
                              TextFormField(
                                controller: codeController,
                                autofillHints: const [
                                  AutofillHints.oneTimeCode,
                                ],
                                keyboardType: TextInputType.number,
                                textInputAction: TextInputAction.done,
                                inputFormatters: [
                                  FilteringTextInputFormatter.digitsOnly,
                                  LengthLimitingTextInputFormatter(6),
                                ],
                                onFieldSubmitted: (_) => busy ? null : submit(),
                                decoration: const InputDecoration(
                                  labelText: 'Authenticator code',
                                  prefixIcon: Icon(
                                    Icons.verified_user_outlined,
                                  ),
                                ),
                                validator: (value) => value?.length == 6
                                    ? null
                                    : 'Enter the current 6-digit code',
                              ),
                              if (widget.controller.error != null) ...[
                                const SizedBox(height: 14),
                                _ErrorMessage(
                                  message: widget.controller.error!,
                                ),
                              ],
                              const SizedBox(height: 22),
                              FilledButton.icon(
                                onPressed: busy ? null : submit,
                                icon: busy
                                    ? const SizedBox.square(
                                        dimension: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Icon(Icons.arrow_forward_rounded),
                                label: Text(
                                  busy ? 'Verifying…' : 'Open admin dashboard',
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.shield_outlined,
                                    size: 15,
                                    color: Color(0xFF7A8799),
                                  ),
                                  SizedBox(width: 6),
                                  Text(
                                    'Encrypted session · expires after 1 hour',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Color(0xFF7A8799),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
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

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) => const Row(
    children: [
      DecoratedBox(
        decoration: BoxDecoration(
          color: Color(0xFF087D66),
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
        child: SizedBox.square(
          dimension: 44,
          child: Icon(Icons.auto_awesome_rounded, color: Colors.white),
        ),
      ),
      SizedBox(width: 12),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'BEYONDMARKS',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              letterSpacing: 1.4,
              color: ink,
            ),
          ),
          Text(
            'ADMIN CONSOLE',
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.8,
              color: teal,
            ),
          ),
        ],
      ),
    ],
  );
}

class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF1F2),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFECACA)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.error_outline_rounded,
          size: 19,
          color: Color(0xFFBE123C),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(
              color: Color(0xFF9F1239),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [color.withValues(alpha: .28), color.withValues(alpha: 0)],
        ),
      ),
    ),
  );
}

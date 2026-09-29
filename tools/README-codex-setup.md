# BeyondMarks Codex setup for Windows

## Student installation

1. Install or update Codex.
2. Download `install-beyondmarks-codex.cmd` and `configure-codex-apim.ps1` into the same folder.
3. Double-click `install-beyondmarks-codex.cmd`.
4. Paste the complete `bma_...` key when prompted. The key is hidden while typing.
5. Close every open Codex window and start Codex again.

The setup stores the key with Windows DPAPI. It can only be decrypted by the same Windows user on the same PC. It does not use `CODEX_APIM_KEY` and survives restarts.

Run the installer again to repair the configuration or replace the student's key. It creates a timestamped backup before changing an existing Codex configuration.

## Command-line installation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-codex-apim.ps1
```

To choose a different default purchased model:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-codex-apim.ps1 -Model "gpt-5.6-sol"
```

## Remove BeyondMarks authentication

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\configure-codex-apim.ps1 -Uninstall
```

Uninstall removes the BeyondMarks provider, encrypted credential, helper, and legacy user environment variable. It does not delete unrelated Codex settings.

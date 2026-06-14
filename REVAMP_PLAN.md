# hostpanel-ftp Revamp Plan

This plan aligns `hostpanel-package-ftp` with the HostPanel Package Development Guide and the newer package structure used by nginx, WireGuard, and File Manager.

## Current State

The FTP package works as an older-style package:

- Python package source is at repo root: `setup.py` and `hostpanel_ftp/`.
- `build.sh` creates a temporary `plugin/` directory, copies Python files into it, zips it, then deletes it.
- Runtime service assets live in `service/` and `sudoers/`.
- The package registers a `ftp` nav route, but there is no committed `frontend/main.js`.
- `build.sh` expects `bin/` assets, but the current tree does not contain committed `bin/pure-pw` or `bin/pure-ftpd`.
- A bundled `hostpanel_ftp/hostpanel-ftp.service` duplicates `service/hostpanel-ftp.service`.
- Manifest lacks `requires_core` and `repository`.
- Uninstall behavior mostly follows the guide, but messages and idempotency should be tightened.

## Target Structure

Move to the standard package layout:

```text
hostpanel-package-ftp/
  build.sh
  README.md
  REVAMP_PLAN.md
  test.scenario
  plugin/
    setup.py
    hostpanel_ftp/
      __init__.py
      plugin.py
      lifecycle.py
      accounts.py
  frontend/
    main.js
  bin/
    pure-ftpd
    pure-pw
  conf/
    .gitkeep
  service/
    hostpanel-ftp.service
  sudoers/
    hostpanel-ftp
```

`accounts.py` is optional, but recommended to keep route handlers separate from manifest/router registration.

## Phase 1: Package Layout Migration

1. Create `plugin/hostpanel_ftp/`.
2. Move `setup.py` to `plugin/setup.py`.
3. Move `hostpanel_ftp/__init__.py`, `plugin.py`, and `lifecycle.py` to `plugin/hostpanel_ftp/`.
4. Remove the temporary `plugin/` creation logic from `build.sh`.
5. Remove `hostpanel_ftp/hostpanel-ftp.service` after confirming the Package Manager installs `service/hostpanel-ftp.service`.
6. Add empty `conf/.gitkeep` if no FTP config defaults are needed.
7. Ensure generated files are ignored: `*.zip`, `__pycache__/`, `*.pyc`, `.DS_Store`, build output, and local binary build folders.

Acceptance criteria:

- `cd plugin && pip install -e .` works.
- `./build.sh` does not mutate source directories.
- The zip contains `plugin/`, `frontend/`, `bin/`, `conf/`, `service/`, and `sudoers/` when present.
- The zip does not contain `.DS_Store`, `__pycache__`, `.pyc`, or source tarballs.

## Phase 2: Manifest and Entry Points

Update `plugin/setup.py`:

- Keep distribution name `hostpanel-ftp`.
- Bump version for the revamp, for example `1.1.0`.
- Keep dependencies minimal: `fastapi`, `pydantic`.
- Add `hostpanel.setup`, `hostpanel.lifecycle`, and `hostpanel.hooks.on_startup`.
- Consider adding `hostpanel.hooks.user_delete` to remove FTP virtual accounts when a hosting user is deleted.

Update `PLUGIN_MANIFEST`:

```python
PLUGIN_MANIFEST = {
    "requires_core": [1, 0, 0],
    "repository": "https://github.com/Developer-Geekay/hostpanel-package-ftp",
    "nav_items": [{
        "nav_route": "ftp",
        "nav_label": "FTP",
        "nav_icon": "swap_vert",
        "nav_section": "my_space",
        "nav_section_label": "My Space",
        "nav_section_order": 20,
        "admin_only": False,
    }],
    "dashboard_blocks": [{
        "type": "stat",
        "label": "FTP Accounts",
        "icon": "swap_vert",
        "endpoint": "ftp/count",
        "size": "sm",
    }],
    "service": {
        "name": "ftp",
        "unit": "hostpanel-ftp",
        "label": "FTP Server",
        "icon": "swap_vert",
        "can_reload": False,
    },
}
```

Acceptance criteria:

- `/cpanelapi/packages/installed` reports `requires_core`, `compatible`, `service`, nav items, and dashboard blocks.
- Core loads the router from `hostpanel.modules`.
- Startup hook is discoverable through `hostpanel.hooks.on_startup`.

## Phase 3: Backend API Hardening

Refactor route code around a small service layer:

- `plugin.py`: manifest plus `router` import.
- `accounts.py`: FastAPI routes and Pydantic models.
- `lifecycle.py`: install/startup/uninstall hooks.

API improvements:

1. Add strict input validation for usernames, passwords, and directories.
2. Normalize and validate FTP home directories with `pathlib.Path.resolve()` where possible.
3. Prevent prefix bypasses such as `/home/testuser2` being accepted for `testuser`; require the resolved path to equal `/home/<user>` or be inside it.
4. Use subprocess timeouts on every external command.
5. Centralize command execution and error conversion.
6. Return stable response shapes, for example `{"status": "success", "message": "..."}`.
7. Make `count` role-aware if dashboard blocks are shown to non-admin users, or explicitly keep it total-only and admin-only.
8. Add account existence checks before create/delete/password change to avoid confusing `pure-pw` errors.
9. Consider route aliases used by core user flows if the Users page expects "Enable FTP" APIs outside `/cpanelapi/ftp/accounts`.

Acceptance criteria:

- Admin can list, create, update password, and delete all FTP accounts.
- Standard users can only see and manage their own FTP account.
- Invalid directories outside `/home/<username>` are rejected.
- Failed `pure-pw` commands return actionable HTTP errors without leaking sensitive input.

## Phase 4: Lifecycle and Runtime State

Revise `on_install()`:

- Create `/opt/hostpanel/plugins/ftp/etc`.
- Create `/opt/hostpanel/plugins/ftp/logs`.
- Create `pureftpd.passwd` with mode `600` if missing.
- Build `pureftpd.pdb` only when needed.
- Validate that `/opt/hostpanel/plugins/ftp/pure-ftpd` and `/opt/hostpanel/plugins/ftp/pure-pw` exist and are executable.
- Start `hostpanel-ftp` through systemd after Package Manager installs the service.

Revise `on_startup()`:

- Ensure state directories exist.
- Rebuild `pureftpd.pdb` if the passwd file exists and the pdb file is missing.
- Start service only when binaries and service file exist.
- Log clear warnings instead of raising for recoverable missing runtime pieces.

Revise `pre_uninstall(force=False)`:

- Default `force` to `False`.
- If accounts exist and `force` is false, raise `HTTPException(status_code=409, detail="Cannot uninstall: N FTP account(s) still exist. Use force=True to remove them.")`.
- If `force` is true, delete package-owned virtual accounts and rebuild the DB.
- Stop and disable `hostpanel-ftp`.
- Remove `/etc/systemd/system/hostpanel-ftp.service`.
- Remove `/opt/hostpanel/plugins/ftp`.
- Remove `/etc/sudoers.d/hostpanel-ftp` last.
- Treat missing binaries, missing passwd files, and inactive services as non-fatal.

Add optional `on_user_delete(username: str, **kwargs)`:

- Delete that user's FTP virtual account if present.
- Rebuild the PureDB.
- Do not delete the Linux user or home directory; those belong to core.

Acceptance criteria:

- Fresh install starts the FTP service.
- Restart repairs missing runtime state without overwriting user-owned account data.
- Uninstall blocks with active accounts unless forced.
- Force uninstall removes only FTP-owned resources.
- Re-running lifecycle cleanup does not fail on already-removed files.

## Phase 5: Binary and Build Strategy

Decide how FTP binaries are produced and shipped.

Recommended target:

- Commit or attach release-built binaries in `bin/` only when they are small enough and architecture-specific release policy is clear.
- Otherwise add `scripts/build-pureftpd.sh` and document that release artifacts must include:
  - `bin/pure-ftpd`
  - `bin/pure-pw`

Build script changes:

- Read version from `plugin/setup.py`.
- Include folders only when they exist.
- Exclude dotfiles, source archives, caches, and Python bytecode.
- Fail early if required binaries are absent.
- Produce `hostpanel-ftp-<version>.zip`.

Acceptance criteria:

- `./build.sh` fails clearly when required FTP binaries are missing.
- Built zip installs with the HostPanel Package Manager upload flow.
- Runtime paths match the service file and Python constants.

## Phase 6: Frontend UI

Add `frontend/main.js` registered as `ftp`:

```javascript
window.__hpkg_sdk.register('ftp', FtpPlugin);
```

Expected UI:

- Account list.
- Create account modal.
- Change password modal.
- Delete confirmation.
- Admin view for all accounts.
- Standard-user view restricted to their own account.
- Service status hint if `/cpanelapi/services` exposes `hostpanel-ftp`.
- Empty state when no account exists.

Use HostPanel SDK conventions:

- Use `window.__hpkg_sdk`.
- Use host classes such as `page`, `page-title`, `btn`, `modal`, `badge`, `empty`.
- Use `api.get('accounts')`, `api.post('accounts', body)`, and `api.delete('accounts/<username>')` for slug-relative calls.

Acceptance criteria:

- `/app/ftp` loads `/packages/ftp/main.js`.
- The package route does not show "Package ftp did not register a plugin".
- UI actions match backend permission behavior.
- The dashboard block remains functional.

## Phase 7: Sudoers and Systemd Review

Sudoers:

- Keep `pure-pw` permissions as narrow as possible.
- Add only required systemctl commands if core sudoers does not already cover service control.
- Validate with `sudo visudo -c -f sudoers/hostpanel-ftp`.

Systemd:

- Confirm `ExecStart` points to `/opt/hostpanel/plugins/ftp/pure-ftpd`.
- Confirm `puredb` path points to `/opt/hostpanel/plugins/ftp/etc/pureftpd.pdb`.
- Keep passive port range documented: `40000:40100`.
- Document firewall requirements for port `21` and passive ports.

Acceptance criteria:

- `visudo` validation passes.
- `systemctl start hostpanel-ftp` works after package install.
- Passive FTP listing works from an external client when firewall ports are open.

## Phase 8: Documentation and Test Scenarios

Update `README.md`:

- Reflect the new `plugin/` development path.
- Document upload install and editable install separately.
- Document required bundled binaries.
- Document passive port firewall requirements.
- Include API prefix and entry points.
- Include uninstall behavior.

Update `test.scenario`:

- Fresh install from zip.
- Package appears in installed packages with compatibility true.
- `/app/ftp` loads frontend.
- Admin creates FTP account.
- Standard user can only manage own account.
- Directory validation rejects paths outside `/home/<user>`.
- FTP active/passive login test.
- Password change invalidates old password.
- Disable/delete account.
- Startup recovery after service stop.
- Uninstall blocked without force when accounts exist.
- Force uninstall removes FTP resources and preserves Linux users/home directories.

Acceptance criteria:

- Test scenarios cover backend, frontend, lifecycle, systemd, sudoers, and real FTP login.
- README matches the actual zip layout and runtime paths.

## Suggested Implementation Order

1. Migrate file layout to `plugin/`.
2. Update `build.sh` and `.gitignore`.
3. Add manifest metadata and entry points.
4. Split route code into `accounts.py`.
5. Harden backend validation and subprocess handling.
6. Revise lifecycle hooks.
7. Add or document binary build/release path.
8. Add `frontend/main.js`.
9. Update README and `test.scenario`.
10. Build zip and test upload install on a real HostPanel host.

## Release Target

Use version `1.1.0` for the revamp unless a smaller patch release is required for compatibility. Tag as `v1.1.0` and publish `hostpanel-ftp-1.1.0.zip` as the release asset.

## Risks and Decisions

Open decisions:

- Whether to commit architecture-specific FTP binaries in `bin/` or build them only in release automation.
- Whether FTP account deletion should cascade from core user deletion through `hostpanel.hooks.user_delete`.
- Whether the FTP dashboard count should be global or user-scoped.
- Whether user-facing FTP account management belongs on `/app/ftp`, the Users page, or both.

Primary risks:

- Existing installations using the root-level editable package path need updated development instructions.
- Missing FTP binaries will make upload installs look successful until service start unless `build.sh` and `on_install()` fail clearly.
- FTP passive mode requires firewall configuration outside the package.

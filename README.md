# hostpanel-ftp

FTP account management package for [HostPanel](https://github.com/Developer-Geekay/hostpanel).

It bundles Pure-FTPd and `pure-pw`, manages PureDB virtual users, exposes a HostPanel package UI at `/app/ftp`, and runs the FTP daemon as `hostpanel-ftp`.

## Requirements

- HostPanel core installed.
- Linux ARM64 runtime compatible with the bundled binaries in `bin/`.
- Firewall allows TCP port `21` and passive ports `40000-40100`.

## Package Layout

```text
plugin/      Python package installed by HostPanel Package Manager
frontend/    HostPanel package UI loaded from /packages/ftp/main.js
bin/         Bundled Pure-FTPd binaries copied to /opt/hostpanel/plugins/ftp/
conf/        Reserved for default config files
service/     systemd unit installed to /etc/systemd/system/
sudoers/     sudo permissions installed to /etc/sudoers.d/
```

## Build

The package expects these executable files:

```text
bin/pure-ftpd
bin/pure-pw
```

Build the HostPanel upload artifact:

```bash
./build.sh
```

Output:

```text
hostpanel-ftp-<version>.zip
```

## Install

Install from the HostPanel Package Manager by uploading the generated zip. The install flow:

1. Installs `plugin/` with pip.
2. Copies `bin/` to `/opt/hostpanel/plugins/ftp/`.
3. Installs `service/hostpanel-ftp.service`.
4. Installs `sudoers/hostpanel-ftp`.
5. Copies `frontend/main.js` to `/opt/hostpanel/frontend/packages/ftp/main.js`.
6. Runs the `on_install` lifecycle hook and restarts HostPanel.

## Development

For Python-only development:

```bash
cd plugin
pip install -e .
sudo systemctl restart hostpanel-api
```

For upload-path testing:

```bash
./build.sh
```

Then upload the zip through the Package Manager.

## What It Provides

| Surface | Route | Description |
|---|---|---|
| UI | `/app/ftp` | List, create, delete FTP accounts and change passwords |
| API | `/cpanelapi/ftp/accounts` | Account CRUD |
| API | `/cpanelapi/ftp/count` | Dashboard count |
| Service | `hostpanel-ftp` | Pure-FTPd daemon |

Standard users can only manage their own FTP account. Admins can manage all accounts.

## Entry Points

| Group | Name | Points to |
|---|---|---|
| `hostpanel.modules` | `ftp` | `hostpanel_ftp.plugin` |
| `hostpanel.setup` | `hostpanel-ftp` | `hostpanel_ftp.lifecycle:on_install` |
| `hostpanel.lifecycle` | `hostpanel-ftp` | `hostpanel_ftp.lifecycle:pre_uninstall` |
| `hostpanel.hooks.on_startup` | `hostpanel-ftp` | `hostpanel_ftp.lifecycle:on_startup` |
| `hostpanel.hooks.user_delete` | `hostpanel-ftp` | `hostpanel_ftp.lifecycle:on_user_delete` |

## Runtime Paths

```text
/opt/hostpanel/plugins/ftp/pure-ftpd
/opt/hostpanel/plugins/ftp/pure-pw
/opt/hostpanel/plugins/ftp/etc/pureftpd.passwd
/opt/hostpanel/plugins/ftp/etc/pureftpd.pdb
/etc/systemd/system/hostpanel-ftp.service
/etc/sudoers.d/hostpanel-ftp
```

## Uninstall Behavior

Without `force`, uninstall blocks when FTP virtual accounts exist.

With `force=True`, the package removes FTP virtual accounts, stops/disables `hostpanel-ftp`, removes the service file, removes `/opt/hostpanel/plugins/ftp`, and removes its sudoers file. Linux users and home directories are preserved.

## License

MIT

# hostpanel-ftp

FTP account management plugin for [HostPanel](https://github.com/Developer-Geekay/hostpanel).

Manages PureFTPd virtual users — create, delete, and change passwords via the panel UI. Each hosting user sees only their own FTP account; admins see all.

## Requirements

- HostPanel core installed (`setup.sh` completed)
- PureFTPd built at `/opt/hostpanel/ftp/` (installed by the plugin's `on_install` hook)

## Install

From the HostPanel Package Manager UI, or manually:

```bash
pip install git+https://github.com/Developer-Geekay/hostpanel-package-ftp.git
sudo systemctl restart hostpanel-api
```

## What it provides

| Nav | Route | Description |
|---|---|---|
| FTP | `/dashboard/ftp` | List, create, delete FTP accounts; change passwords |

API prefix: `/cpanelapi/ftp/`

## Entry points

| Group | Name | Points to |
|---|---|---|
| `hostpanel.modules` | `ftp` | `hostpanel_ftp.plugin` |
| `hostpanel.lifecycle` | `hostpanel-ftp` | `hostpanel_ftp.lifecycle:pre_uninstall` |

## Development

```bash
git clone https://github.com/Developer-Geekay/hostpanel-package-ftp.git
cd hostpanel-package-ftp
pip install -e .
```

## License

MIT

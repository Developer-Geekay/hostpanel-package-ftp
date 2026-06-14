import logging
import os
import subprocess
from typing import List

from fastapi import HTTPException

logger = logging.getLogger(__name__)

FTP_DIR = "/opt/hostpanel/plugins/ftp"
PURE_FTPD = f"{FTP_DIR}/pure-ftpd"
PURE_PW = f"{FTP_DIR}/pure-pw"
PASSWD_FILE = f"{FTP_DIR}/etc/pureftpd.passwd"
PDB_FILE = f"{FTP_DIR}/etc/pureftpd.pdb"
SERVICE_NAME = "hostpanel-ftp"
SERVICE_DST = f"/etc/systemd/system/{SERVICE_NAME}.service"
SUDOERS_DST = "/etc/sudoers.d/hostpanel-ftp"
COMMAND_TIMEOUT = 30


def _run(command: List[str], check: bool = False, input_data: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        input=input_data,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=COMMAND_TIMEOUT,
    )


def _sudo(command: List[str], check: bool = False, input_data: str | None = None) -> subprocess.CompletedProcess:
    return _run(["sudo"] + command, check=check, input_data=input_data)


def _binary_ready(path: str) -> bool:
    return os.path.isfile(path) and os.access(path, os.X_OK)


def _ensure_runtime_state() -> None:
    for directory in (f"{FTP_DIR}/etc", f"{FTP_DIR}/logs"):
        _sudo(["mkdir", "-p", directory], check=True)

    if not os.path.exists(PASSWD_FILE):
        _sudo(["touch", PASSWD_FILE], check=True)
        _sudo(["chmod", "600", PASSWD_FILE], check=True)

    if _binary_ready(PURE_PW) and not os.path.exists(PDB_FILE):
        result = _sudo([PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE])
        if result.returncode != 0:
            logger.warning("Could not initialize FTP database: %s", (result.stderr or result.stdout).strip())


def _list_users() -> list[str]:
    if not _binary_ready(PURE_PW) or not os.path.exists(PASSWD_FILE):
        return []
    result = _sudo([PURE_PW, "list", "-f", PASSWD_FILE])
    if result.returncode != 0:
        logger.warning("Could not list FTP users: %s", (result.stderr or result.stdout).strip())
        return []
    return [line.split()[0] for line in result.stdout.strip().splitlines() if line.strip()]


def _rebuild_db() -> None:
    if _binary_ready(PURE_PW) and os.path.exists(PASSWD_FILE):
        _sudo([PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE])


def on_install():
    logger.info("FTP on_install: initializing runtime state")
    _ensure_runtime_state()

    missing = [path for path in (PURE_FTPD, PURE_PW) if not _binary_ready(path)]
    if missing:
        logger.warning("FTP binaries missing or not executable: %s", ", ".join(missing))
        return

    _sudo(["systemctl", "daemon-reload"])
    _sudo(["systemctl", "enable", SERVICE_NAME])
    _sudo(["systemctl", "start", SERVICE_NAME])
    logger.info("FTP on_install: service enabled and started")


def on_startup():
    logger.info("FTP on_startup: checking service state")
    try:
        _ensure_runtime_state()
    except Exception as e:
        logger.warning("FTP on_startup: runtime repair failed: %s", e)
        return

    if not _binary_ready(PURE_FTPD) or not os.path.exists(SERVICE_DST):
        logger.warning("FTP on_startup: service not ready; binary or service file is missing")
        return

    result = _sudo(["systemctl", "is-active", SERVICE_NAME])
    if result.returncode != 0:
        logger.info("FTP on_startup: service not active, starting")
        _sudo(["systemctl", "start", SERVICE_NAME])
    else:
        logger.info("FTP on_startup: service is active")


def pre_uninstall(force: bool = False):
    logger.info("FTP pre_uninstall hook called with force=%s", force)
    users = _list_users()
    if users and not force:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot uninstall: {len(users)} FTP account(s) still exist. Use force=True to remove them.",
        )

    if users and force:
        logger.warning("Force uninstalling FTP module; deleting %s virtual account(s)", len(users))
        for username in users:
            _sudo([PURE_PW, "userdel", username, "-f", PASSWD_FILE])
        _rebuild_db()

    _sudo(["systemctl", "stop", SERVICE_NAME])
    _sudo(["systemctl", "disable", SERVICE_NAME])
    _sudo(["rm", "-f", SERVICE_DST])
    _sudo(["systemctl", "daemon-reload"])

    if os.path.isdir(FTP_DIR):
        _sudo(["rm", "-rf", FTP_DIR])

    _sudo(["rm", "-f", SUDOERS_DST])
    logger.info("FTP pre_uninstall: service, runtime files, and sudoers removed")


def on_user_delete(username: str, **kwargs):
    if not username:
        return
    users = set(_list_users())
    if username not in users:
        return
    logger.info("FTP on_user_delete: removing virtual account for %s", username)
    _sudo([PURE_PW, "userdel", username, "-f", PASSWD_FILE])
    _rebuild_db()

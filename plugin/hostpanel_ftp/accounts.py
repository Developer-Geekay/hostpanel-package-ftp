import logging
import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import User
from deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cpanelapi/ftp", tags=["FTP"])

FTP_DIR = "/opt/hostpanel/plugins/ftp"
PURE_PW = f"{FTP_DIR}/pure-pw"
PASSWD_FILE = f"{FTP_DIR}/etc/pureftpd.passwd"
PDB_FILE = f"{FTP_DIR}/etc/pureftpd.pdb"
COMMAND_TIMEOUT = 20
USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")


class FTPAccount(BaseModel):
    username: str
    home_dir: str


class FTPCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=32)
    password: str = Field(..., min_length=8, max_length=256)
    directory: Optional[str] = Field(default=None, max_length=4096)


class FTPPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=256)


def _validate_username(username: str) -> str:
    if not USERNAME_RE.fullmatch(username):
        raise HTTPException(status_code=400, detail="Invalid username")
    return username


def _user_home(username: str) -> Path:
    return Path("/home") / username


def _resolve_home_dir(username: str, directory: Optional[str]) -> str:
    base = _user_home(username).resolve(strict=False)
    if not directory:
        return str(base)

    requested = Path(directory.rstrip("/")).expanduser()
    if not requested.is_absolute():
        raise HTTPException(status_code=400, detail="FTP directory must be an absolute path")

    resolved = requested.resolve(strict=False)
    if resolved != base and base not in resolved.parents:
        raise HTTPException(status_code=400, detail=f"FTP directory must be within /home/{username}/")
    return str(resolved)


def _run(command: List[str], input_data: Optional[str] = None, check: bool = True) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["sudo"] + command,
            input=input_data,
            check=check,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=COMMAND_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="FTP command timed out")
    except subprocess.CalledProcessError as e:
        detail = (e.stderr or e.stdout or "FTP command failed").strip()
        logger.error("Command failed: %s: %s", " ".join(command), detail)
        raise HTTPException(status_code=500, detail=detail)


def _list_accounts_raw() -> List[FTPAccount]:
    if not os.path.exists(PASSWD_FILE):
        return []
    result = _run([PURE_PW, "list", "-f", PASSWD_FILE], check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Failed to list FTP accounts").strip()
        logger.error("pure-pw list failed: %s", detail)
        raise HTTPException(status_code=500, detail=detail)

    accounts: List[FTPAccount] = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        parts = line.split()
        username = parts[0]
        home_dir = parts[1].rstrip("./") if len(parts) > 1 else f"/home/{username}"
        accounts.append(FTPAccount(username=username, home_dir=home_dir))
    return accounts


def _account_exists(username: str) -> bool:
    return any(account.username == username for account in _list_accounts_raw())


def _rebuild_db() -> None:
    _run([PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE])


def _ensure_system_user(username: str) -> None:
    try:
        subprocess.run(
            ["id", username],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=COMMAND_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="System user lookup timed out")
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=404, detail=f"System user '{username}' does not exist. Create the user first.")


def _ensure_allowed(username: str, current_user: User) -> None:
    if current_user.role != "admin" and username != current_user.linux_user:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("/accounts", response_model=List[FTPAccount])
async def list_ftp_accounts(current_user: User = Depends(get_current_user)):
    accounts = _list_accounts_raw()
    if current_user.role != "admin":
        accounts = [account for account in accounts if account.username == current_user.linux_user]
    return accounts


@router.post("/accounts")
async def create_ftp_account(request: FTPCreateRequest, current_user: User = Depends(get_current_user)):
    username = _validate_username(request.username)
    _ensure_allowed(username, current_user)
    _ensure_system_user(username)

    if _account_exists(username):
        raise HTTPException(status_code=409, detail=f"FTP account '{username}' already exists")

    home_dir = _resolve_home_dir(username, request.directory)
    password_input = f"{request.password}\n{request.password}\n"
    _run([PURE_PW, "useradd", username, "-u", username, "-d", home_dir, "-f", PASSWD_FILE], input_data=password_input)
    _rebuild_db()
    return {"status": "success", "message": f"FTP account {username} created"}


@router.put("/accounts/{username}/password")
async def change_ftp_password(
    username: str,
    request: FTPPasswordRequest,
    current_user: User = Depends(get_current_user),
):
    username = _validate_username(username)
    _ensure_allowed(username, current_user)
    if not _account_exists(username):
        raise HTTPException(status_code=404, detail=f"FTP account '{username}' does not exist")

    password_input = f"{request.new_password}\n{request.new_password}\n"
    _run([PURE_PW, "passwd", username, "-f", PASSWD_FILE], input_data=password_input)
    _rebuild_db()
    return {"status": "success", "message": f"FTP password changed for {username}"}


@router.delete("/accounts/{username}")
async def delete_ftp_account(username: str, current_user: User = Depends(get_current_user)):
    username = _validate_username(username)
    _ensure_allowed(username, current_user)
    if not _account_exists(username):
        raise HTTPException(status_code=404, detail=f"FTP account '{username}' does not exist")

    _run([PURE_PW, "userdel", username, "-f", PASSWD_FILE])
    _rebuild_db()
    return {"status": "success", "message": f"FTP account {username} deleted"}


@router.get("/count")
async def count_ftp_accounts(current_user: User = Depends(get_current_user)):
    accounts = _list_accounts_raw()
    if current_user.role != "admin":
        accounts = [account for account in accounts if account.username == current_user.linux_user]
    return {"count": len(accounts)}

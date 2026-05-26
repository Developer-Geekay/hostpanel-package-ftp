import subprocess
import logging
import os
from fastapi import HTTPException

logger = logging.getLogger(__name__)

PURE_PW = "/opt/hostpanel/plugins/ftp/pure-pw"
PASSWD_FILE = "/opt/hostpanel/plugins/ftp/etc/pureftpd.passwd"
PDB_FILE = "/opt/hostpanel/plugins/ftp/etc/pureftpd.pdb"
SERVICE_NAME = "hostpanel-ftp"
SERVICE_DST = f"/etc/systemd/system/{SERVICE_NAME}.service"
FTP_DIR = "/opt/hostpanel/plugins/ftp"


def on_install():
    """Initialise pure-ftpd data dirs and start the service.
    Binaries (pure-ftpd, pure-pw) are pre-installed by the package manager
    from the zip's sbin/ and bin/ directories — no apt required."""
    logger.info("FTP on_install: initialising")

    # Ensure data directories exist (binaries land flat in the plugin dir via package manager)
    for d in ["/opt/hostpanel/plugins/ftp/etc", "/opt/hostpanel/plugins/ftp/logs"]:
        subprocess.run(["sudo", "mkdir", "-p", d], check=True)

    # Create initial empty passwd + pdb (only on first install)
    if not os.path.exists(PASSWD_FILE):
        subprocess.run(["sudo", "touch", PASSWD_FILE], check=True)
        subprocess.run(["sudo", "chmod", "600", PASSWD_FILE], check=True)

    if not os.path.exists(PDB_FILE):
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            capture_output=True, text=True
        )

    # Install service file if the package manager upload path didn't do it already
    if not os.path.exists(SERVICE_DST):
        try:
            import importlib.resources as pkg_res
            svc_src = pkg_res.files("hostpanel_ftp").joinpath(f"{SERVICE_NAME}.service")
            with pkg_res.as_file(svc_src) as p:
                subprocess.run(["sudo", "cp", str(p), SERVICE_DST], check=True)
                subprocess.run(["sudo", "chmod", "644", SERVICE_DST], check=True)
                logger.info(f"Installed service file → {SERVICE_DST}")
        except Exception as e:
            logger.warning(f"Could not install bundled service file: {e}")

    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "enable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    logger.info("FTP on_install: service enabled and started")

def _rebuild_db():
    try:
        subprocess.run(
            ["sudo", PURE_PW, "mkdb", PDB_FILE, "-f", PASSWD_FILE],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pure-pw mkdb failed: {e.stderr}")

def pre_uninstall(force: bool):
    """
    Lifecycle hook called before uninstalling the hostpanel-ftp package.
    Checks if FTP users exist. If so, blocks uninstallation unless force=True.
    """
    logger.info(f"FTP pre_uninstall hook called with force={force}")
    
    try:
        result = subprocess.run(
            ["sudo", PURE_PW, "list", "-f", PASSWD_FILE],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        users = []
        for line in result.stdout.strip().splitlines():
            if line:
                users.append(line.split()[0])
                
        if users:
            if not force:
                raise HTTPException(
                    status_code=409, 
                    detail=f"There are {len(users)} FTP user(s) currently configured. Uninstalling this module will permanently delete these users. Are you sure you want to proceed?"
                )
            else:
                # Force is true, delete the users
                logger.warning(f"Force uninstalling FTP module. Deleting {len(users)} users...")
                for username in users:
                    subprocess.run(["sudo", PURE_PW, "userdel", username, "-f", PASSWD_FILE], check=False)
                _rebuild_db()
                logger.info("FTP users successfully purged.")
                
    except HTTPException:
        raise
    except FileNotFoundError:
        # pure-pw might not be installed, ignore
        pass
    except Exception as e:
        logger.error(f"Error checking FTP users during uninstall: {e}")

    # Stop and remove the service
    subprocess.run(["sudo", "systemctl", "stop", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "systemctl", "disable", SERVICE_NAME], capture_output=True)
    subprocess.run(["sudo", "rm", "-f", SERVICE_DST], capture_output=True)
    subprocess.run(["sudo", "systemctl", "daemon-reload"], capture_output=True)
    logger.info("FTP pre_uninstall: service stopped and removed")

    # Remove FTP binary directory
    if os.path.isdir(FTP_DIR):
        subprocess.run(["sudo", "rm", "-rf", FTP_DIR], capture_output=True)
        logger.info(f"FTP pre_uninstall: removed {FTP_DIR}")


def on_startup():
    """Called at server startup. Ensures the FTP service is running."""
    result = subprocess.run(
        ["sudo", "systemctl", "is-active", SERVICE_NAME],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        logger.info(f"FTP on_startup: service not active ({result.stdout.strip()}), starting...")
        subprocess.run(["sudo", "systemctl", "start", SERVICE_NAME], capture_output=True)
    else:
        logger.info("FTP on_startup: service is active")

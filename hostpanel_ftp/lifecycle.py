import subprocess
import logging
import os
from fastapi import HTTPException

logger = logging.getLogger(__name__)

PURE_PW = "/opt/hostpanel/ftp/bin/pure-pw"
PASSWD_FILE = "/opt/hostpanel/ftp/etc/pureftpd.passwd"
PDB_FILE = "/opt/hostpanel/ftp/etc/pureftpd.pdb"
SERVICE_NAME = "hostpanel-ftp"
SERVICE_DST = f"/etc/systemd/system/{SERVICE_NAME}.service"
FTP_DIR = "/opt/hostpanel/ftp"


def on_install():
    """Set up pure-ftpd binaries and directory structure."""
    logger.info("FTP on_install: setting up pure-ftpd")

    # Install system package
    subprocess.run(
        ["sudo", "apt-get", "install", "-y", "pure-ftpd"],
        check=True, capture_output=True, text=True
    )

    # Create directory structure
    for d in ["/opt/hostpanel/ftp/sbin", "/opt/hostpanel/ftp/bin",
              "/opt/hostpanel/ftp/etc", "/opt/hostpanel/ftp/logs"]:
        subprocess.run(["sudo", "mkdir", "-p", d], check=True)

    # Stop service before copying (binary can't be replaced while in use)
    subprocess.run(["sudo", "systemctl", "stop", "hostpanel-ftp"], capture_output=True)

    # Copy binaries from system install
    for src, dst in [
        ("/usr/sbin/pure-ftpd", "/opt/hostpanel/ftp/sbin/pure-ftpd"),
        ("/usr/bin/pure-pw",    "/opt/hostpanel/ftp/bin/pure-pw"),
    ]:
        if os.path.exists(src):
            subprocess.run(["sudo", "cp", src, dst], check=True)
            subprocess.run(["sudo", "chmod", "755", dst], check=True)

    # Disable system pure-ftpd so it doesn't conflict on port 21
    subprocess.run(["sudo", "systemctl", "stop", "pure-ftpd"], capture_output=True)
    subprocess.run(["sudo", "systemctl", "disable", "pure-ftpd"], capture_output=True)

    # Create initial empty passwd + database (only if not already present)
    if not os.path.exists(PASSWD_FILE):
        subprocess.run(["sudo", "touch", PASSWD_FILE], check=True)
        subprocess.run(["sudo", "chmod", "600", PASSWD_FILE], check=True)

    if not os.path.exists(PDB_FILE):
        subprocess.run(
            ["sudo", "/usr/bin/pure-pw", "mkdb", PDB_FILE, "-f", PASSWD_FILE],
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

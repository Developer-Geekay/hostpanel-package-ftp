from setuptools import find_packages, setup

setup(
    name="hostpanel-ftp",
    version="1.1.0",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "pydantic",
    ],
    entry_points={
        "hostpanel.modules": [
            "ftp = hostpanel_ftp.plugin",
        ],
        "hostpanel.lifecycle": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:pre_uninstall",
        ],
        "hostpanel.setup": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:on_install",
        ],
        "hostpanel.hooks.on_startup": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:on_startup",
        ],
        "hostpanel.hooks.user_delete": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:on_user_delete",
        ],
    },
)

from setuptools import setup, find_packages

setup(
    name="hostpanel-ftp",
    version="1.0.0",
    packages=find_packages(),
    package_data={"hostpanel_ftp": ["*.service"]},
    install_requires=[
        "fastapi",
        "pydantic",
    ],
    entry_points={
        "hostpanel.modules": [
            "ftp = hostpanel_ftp.plugin"
        ],
        "hostpanel.lifecycle": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:pre_uninstall"
        ],
        "hostpanel.setup": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:on_install"
        ],
        "hostpanel.hooks.on_startup": [
            "hostpanel-ftp = hostpanel_ftp.lifecycle:on_startup"
        ],
    }
)

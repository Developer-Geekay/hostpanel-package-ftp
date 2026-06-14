from hostpanel_ftp.accounts import router

PLUGIN_MANIFEST = {
    "requires_core": [1, 0, 0],
    "repository": "https://github.com/Developer-Geekay/hostpanel-package-ftp",
    "nav_items": [
        {
            "nav_route": "ftp",
            "nav_label": "FTP",
            "nav_icon": "swap_vert",
            "nav_section": "my_space",
            "nav_section_label": "My Space",
            "nav_section_order": 20,
            "admin_only": False,
        },
    ],
    "dashboard_blocks": [
        {
            "type": "stat",
            "label": "FTP Accounts",
            "icon": "swap_vert",
            "endpoint": "ftp/count",
            "size": "sm",
        },
    ],
    "service": {
        "name": "ftp",
        "unit": "hostpanel-ftp",
        "label": "FTP Server",
        "icon": "swap_vert",
        "can_reload": False,
    },
}

/* hostpanel-package-ftp - frontend/main.js */
(function () {
  'use strict';

  const sdk = window.__hpkg_sdk;
  const { html, useEffect, useState, useCallback } = sdk;
  const { SdkFormModal, SdkConfirmModal } = sdk.components;
  const { useToast } = sdk.hooks;

  function FtpPlugin() {
    const { ok, err } = useToast();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [passwordTarget, setPasswordTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const load = useCallback(() => {
      setLoading(true);
      setError('');
      sdk.fetch('GET', '/cpanelapi/ftp/accounts')
        .then(data => setAccounts(data || []))
        .catch(e => setError(e.message || 'Failed to load FTP accounts'))
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const createAccount = async (values) => {
      await sdk.fetch('POST', '/cpanelapi/ftp/accounts', {
        username: values.username,
        password: values.password,
        directory: values.directory || null,
      });
      setCreateOpen(false);
      ok('FTP account created');
      load();
    };

    const changePassword = async (values) => {
      await sdk.fetch('PUT', '/cpanelapi/ftp/accounts/' + encodeURIComponent(passwordTarget.username) + '/password', {
        new_password: values.new_password,
      });
      setPasswordTarget(null);
      ok('FTP password changed');
    };

    const deleteAccount = async () => {
      const username = deleteTarget.username;
      await sdk.fetch('DELETE', '/cpanelapi/ftp/accounts/' + encodeURIComponent(username));
      setDeleteTarget(null);
      ok('FTP account deleted');
      load();
    };

    return html`
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-title">FTP</div>
            <div class="page-subtitle">Pure-FTPd virtual accounts</div>
          </div>
          <button class="btn btn-primary btn-md" onClick=${() => setCreateOpen(true)}>Create Account</button>
        </div>

        ${error && html`
          <div class="empty" style=${{ marginBottom: 14 }}>
            <div class="empty-title">Could not load FTP accounts</div>
            <div class="empty-desc">${error}</div>
          </div>
        `}

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Home Directory</th>
                <th style=${{ width: 180, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${loading && html`
                <tr>
                  <td colspan="3" style=${{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>Loading...</td>
                </tr>
              `}
              ${!loading && !accounts.length && html`
                <tr>
                  <td colspan="3">
                    <div class="empty" style=${{ padding: '28px 0' }}>
                      <div class="empty-title">No FTP accounts</div>
                      <div class="empty-desc">Create an account to enable FTP access for a hosting user.</div>
                    </div>
                  </td>
                </tr>
              `}
              ${!loading && accounts.map(account => html`
                <tr key=${account.username}>
                  <td class="mono">${account.username}</td>
                  <td class="mono" style=${{ color: 'var(--text-2)', wordBreak: 'break-all' }}>${account.home_dir}</td>
                  <td>
                    <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button class="btn btn-ghost btn-sm" onClick=${() => setPasswordTarget(account)}>Password</button>
                      <button class="btn btn-danger btn-sm" onClick=${() => setDeleteTarget(account)}>Delete</button>
                    </div>
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      ${createOpen && html`
        <${SdkFormModal}
          open=${true}
          title="Create FTP Account"
          fields=${[
            { key: 'username', label: 'Linux user', type: 'text', required: true, placeholder: 'testuser' },
            { key: 'password', label: 'Password', type: 'password', required: true },
            { key: 'directory', label: 'Directory', type: 'text', required: false, placeholder: '/home/testuser' },
          ]}
          onClose=${() => setCreateOpen(false)}
          onSubmit=${createAccount}
        />
      `}

      ${passwordTarget && html`
        <${SdkFormModal}
          open=${true}
          title=${'Change Password - ' + passwordTarget.username}
          fields=${[
            { key: 'new_password', label: 'New password', type: 'password', required: true },
          ]}
          onClose=${() => setPasswordTarget(null)}
          onSubmit=${changePassword}
        />
      `}

      ${deleteTarget && html`
        <${SdkConfirmModal}
          open=${true}
          title="Delete FTP Account"
          message=${'Delete FTP account "' + deleteTarget.username + '"? The Linux user and home directory are preserved.'}
          danger=${true}
          onClose=${() => setDeleteTarget(null)}
          onConfirm=${deleteAccount}
        />
      `}
    `;
  }

  sdk.register('ftp', FtpPlugin);
})();

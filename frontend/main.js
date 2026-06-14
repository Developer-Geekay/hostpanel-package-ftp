/* hostpanel-package-ftp - frontend/main.js */
(function () {
  'use strict';

  const sdk = window.__hpkg_sdk;
  const { html, useEffect, useState, useCallback } = sdk;
  const { SdkConfirmModal, SdkDataTable } = sdk.components;
  const { useToast } = sdk.hooks;

  function FtpFormModal({ title, mode, account, onClose, onSubmit }) {
    const [username, setUsername] = useState(account?.username || '');
    const [password, setPassword] = useState('');
    const [directory, setDirectory] = useState(account?.home_dir || '');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const save = async () => {
      setFormError('');
      if (mode === 'create' && !username.trim()) {
        setFormError('Linux user is required');
        return;
      }
      if (!password.trim()) {
        setFormError(mode === 'create' ? 'Password is required' : 'New password is required');
        return;
      }
      setBusy(true);
      try {
        await onSubmit({
          username: username.trim(),
          password,
          directory: directory.trim(),
          new_password: password,
        });
      } catch (e) {
        setFormError(e.message || 'Something went wrong');
      } finally {
        setBusy(false);
      }
    };

    return html`
      <div class="modal-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
        <div class="modal animate-fade-in" style=${{ width: 440 }}>
          <div class="modal-header">
            <span class="modal-title">${title}</span>
            <button class="modal-close" onClick=${onClose} aria-label="Close">x</button>
          </div>
          <div class="modal-body" style=${{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            ${mode === 'create' && html`
              <div class="field">
                <label>Linux user</label>
                <input
                  type="text"
                  value=${username}
                  placeholder="testuser"
                  onInput=${e => setUsername(e.target.value)}
                />
              </div>
            `}
            <div class="field">
              <label>${mode === 'create' ? 'Password' : 'New password'}</label>
              <input
                type="password"
                value=${password}
                autocomplete="new-password"
                onInput=${e => setPassword(e.target.value)}
              />
            </div>
            ${mode === 'create' && html`
              <div class="field">
                <label>Directory</label>
                <input
                  type="text"
                  value=${directory}
                  placeholder=${username ? '/home/' + username : '/home/testuser'}
                  onInput=${e => setDirectory(e.target.value)}
                />
              </div>
            `}
            ${formError && html`
              <div style=${{ color: 'var(--err)', fontSize: 12 }}>${formError}</div>
            `}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-sm" onClick=${onClose} disabled=${busy}>Cancel</button>
            <button class="btn btn-primary btn-sm" onClick=${save} disabled=${busy}>
              ${busy ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function FtpPlugin() {
    const { ok } = useToast();
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
        <div class="page-header">
          <div>
            <h1 class="page-title">FTP</h1>
            <p class="page-desc">Pure-FTPd virtual accounts</p>
          </div>
        </div>

        <div class="card">
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span class="card-title" style=${{ marginBottom: 0 }}>Accounts</span>
            <button class="btn btn-primary btn-sm" onClick=${() => setCreateOpen(true)}>
              Create Account
            </button>
          </div>

          ${error
            ? html`
                <div class="empty">
                  <div class="empty-title" style=${{ color: 'var(--err)' }}>Could not load FTP accounts</div>
                  <div class="empty-desc">${error}</div>
                </div>
              `
            : html`
                <${SdkDataTable}
                  columns=${[
                    { key: 'username', label: 'Username', type: 'mono' },
                    { key: 'home_dir', label: 'Home Directory', type: 'mono' },
                  ]}
                  rows=${accounts}
                  loading=${loading}
                  empty=${{ title: 'No FTP accounts', desc: 'Create an account to enable FTP access for a hosting user.' }}
                  renderActions=${(row) => html`
                    <button class="btn btn-ghost btn-sm" onClick=${() => setPasswordTarget(row)}>
                      Password
                    </button>
                    <button class="btn btn-danger btn-sm" onClick=${() => setDeleteTarget(row)}>
                      Delete
                    </button>
                  `}
                />
              `
          }
        </div>
      </div>

      ${createOpen && html`
        <${FtpFormModal}
          title="Create FTP Account"
          mode="create"
          onClose=${() => setCreateOpen(false)}
          onSubmit=${createAccount}
        />
      `}

      ${passwordTarget && html`
        <${FtpFormModal}
          title=${'Change Password - ' + passwordTarget.username}
          mode="password"
          account=${passwordTarget}
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

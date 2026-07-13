/* hostpanel-package-ftp — frontend/main.js
 * SDK plugin: Pure-FTPd virtual accounts manager UI.
 * Redesigned to match the design mockup exactly.
 */
(function () {
  'use strict';

  const sdk = window.__hpkg_sdk;
  const { html, useEffect, useState, useCallback, useMemo } = sdk;
  const { SdkConfirmModal } = sdk.components;
  const { useToast } = sdk.hooks;

  // ── Inline User SVG Icon ─────────────────────────────────────────────────────

  const UserIcon = ({ color = 'var(--accent)', size = 14 }) => html`
    <svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke=${color} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>`;

  const KeyIcon = ({ size = 12 }) => html`
    <svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>`;

  const LockIcon = ({ size = 12 }) => html`
    <svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`;

  const TrashIcon = ({ size = 12 }) => html`
    <svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>`;

  // ── Generate random password ─────────────────────────────────────────────────

  function genPassword(len = 16) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
    return Array.from(crypto.getRandomValues(new Uint8Array(len)))
      .map(b => chars[b % chars.length]).join('');
  }

  // ── FTP Plugin Component ─────────────────────────────────────────────────────

  function FtpPlugin() {
    const { ok, err: toastErr } = useToast();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedUsername, setSelectedUsername] = useState(null);
    const [addingNew, setAddingNew] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Create form state
    const [formUser, setFormUser] = useState('');
    const [formPass, setFormPass] = useState('');
    const [formDir, setFormDir] = useState('/var/www/');
    const [formQuota, setFormQuota] = useState('5120');
    const [formPerms, setFormPerms] = useState('readwrite');
    const [formIp, setFormIp] = useState('');
    const [formBusy, setFormBusy] = useState(false);
    const [formError, setFormError] = useState('');

    // Change password state
    const [changePass, setChangePass] = useState('');
    const [changeBusy, setChangeBusy] = useState(false);
    const [changeError, setChangeError] = useState('');

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    const activeAccount = useMemo(() =>
      accounts.find(a => a.username === selectedUsername), [accounts, selectedUsername]);

    const load = useCallback((silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      sdk.fetch('GET', '/cpanelapi/ftp/accounts')
        .then(data => setAccounts(data || []))
        .catch(e => setError(e.message || 'Failed to load FTP accounts'))
        .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const filteredAccounts = useMemo(() => {
      if (!searchQuery.trim()) return accounts;
      const q = searchQuery.toLowerCase();
      return accounts.filter(acc => acc.username.toLowerCase().includes(q));
    }, [accounts, searchQuery]);

    const selectAccount = (acc) => {
      setSelectedUsername(acc.username);
      setAddingNew(false);
      setActiveTab('overview');
      setChangePass('');
      setChangeError('');
    };

    const triggerAddView = () => {
      setAddingNew(true);
      setSelectedUsername(null);
      setFormUser('');
      setFormPass('');
      setFormDir('/var/www/');
      setFormQuota('5120');
      setFormPerms('readwrite');
      setFormIp('');
      setFormError('');
    };

    const handleCreateSubmit = async (e) => {
      e.preventDefault();
      setFormError('');
      if (!formUser.trim()) { setFormError('Username is required'); return; }
      if (!formPass.trim()) { setFormError('Password is required'); return; }
      setFormBusy(true);
      try {
        await sdk.fetch('POST', '/cpanelapi/ftp/accounts', {
          username: formUser.trim(),
          password: formPass,
          directory: formDir.trim() || null,
          quota_mb: formQuota ? parseInt(formQuota, 10) : 0,
          permissions: formPerms,
          ip_restriction: formIp.trim() || null,
        });
        ok('FTP account created successfully');
        load();
        setAddingNew(false);
        setSelectedUsername(formUser.trim());
      } catch (e) {
        setFormError(e.message || 'Creation failed');
      } finally {
        setFormBusy(false);
      }
    };

    const handleChangePassword = async (e) => {
      e.preventDefault();
      if (!activeAccount) return;
      setChangeError('');
      if (!changePass.trim()) { setChangeError('Password cannot be empty'); return; }
      setChangeBusy(true);
      try {
        await sdk.fetch('PUT', '/cpanelapi/ftp/accounts/' + encodeURIComponent(activeAccount.username) + '/password', {
          new_password: changePass,
        });
        ok('Password updated successfully');
        setChangePass('');
      } catch (e) {
        setChangeError(e.message || 'Failed to update password');
      } finally {
        setChangeBusy(false);
      }
    };

    const handleDeleteAccount = async () => {
      if (!deleteTarget) return;
      try {
        await sdk.fetch('DELETE', '/cpanelapi/ftp/accounts/' + encodeURIComponent(deleteTarget.username));
        ok(`FTP account "${deleteTarget.username}" deleted`);
        setDeleteTarget(null);
        setSelectedUsername(null);
        load();
      } catch (e) {
        toastErr(e.message || 'Deletion failed');
      }
    };

    const getStatusChip = (acc) => {
      const s = acc.status || 'active';
      if (s === 'locked') return html`<span class="chip chip-amber" style=${{ fontSize: 10 }}>locked</span>`;
      if (s === 'disabled') return html`<span class="chip chip-red" style=${{ fontSize: 10 }}>disabled</span>`;
      return html`<span class="chip chip-green" style=${{ fontSize: 10 }}>active</span>`;
    };

    return html`
      <div class="page" style=${{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', padding: '24px' }}>

        <!-- Page Header -->
        <div class="page-header" style=${{ flexShrink: 0, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 class="page-title">FTP Accounts</h1>
            <p class="page-desc">
              Pure-FTPd · FTPS/TLS enforced · ${accounts.length} account${accounts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button class="btn btn-primary btn-sm" onClick=${triggerAddView}>
            + Create Account
          </button>
        </div>

        <div class="split-view" style=${{ flex: 1, minHeight: 0 }}>

          <!-- Left Panel: Accounts List -->
          <div class="split-left" style=${{ width: 270, display: 'flex', flexDirection: 'column' }}>
            <div style=${{ padding: '0 12px 8px' }}>
              <input
                class="search-input"
                type="text"
                placeholder="Search accounts…"
                value=${searchQuery}
                onInput=${e => setSearchQuery(e.target.value)}
                style=${{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div class="split-scroll" style=${{ flex: 1, overflowY: 'auto' }}>
              ${loading && accounts.length === 0
                ? html`<div style=${{ color: 'var(--text-3)', padding: 20, textAlign: 'center', fontSize: 12.5 }}>Loading accounts…</div>`
                : error
                ? html`<div style=${{ color: 'var(--err)', padding: 16, fontSize: 12.5 }}>${error}</div>`
                : filteredAccounts.length === 0
                ? html`
                    <div class="empty" style=${{ padding: '32px 16px' }}>
                      <div class="empty-title">No FTP accounts</div>
                      <div class="empty-desc" style=${{ fontSize: 11 }}>Click "Create Account" to add one.</div>
                    </div>`
                : filteredAccounts.map(acc => html`
                    <div
                      key=${acc.username}
                      class=${'list-item ' + (selectedUsername === acc.username ? 'sel' : '')}
                      onClick=${() => selectAccount(acc)}
                    >
                      <div style=${{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <${UserIcon}
                          color=${selectedUsername === acc.username ? 'var(--accent)' : 'var(--text-3)'}
                          size=${14}
                        />
                        <div style=${{ flex: 1, minWidth: 0 }}>
                          <div class="li-name" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${acc.username}</div>
                          <div class="li-sub" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ${acc.home_dir || '—'}
                          </div>
                        </div>
                        ${getStatusChip(acc)}
                      </div>
                    </div>`)}
            </div>
          </div>

          <!-- Right Panel -->
          <div class="split-right" style=${{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            ${addingNew ? html`
              <!-- Add Account Form -->
              <div class="animate-fade-in" style=${{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 24 }}>
                <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div>
                    <div style=${{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.3px' }}>New FTP Account</div>
                    <div style=${{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>FTPS (TLS) enforced for all connections</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" onClick=${() => setAddingNew(false)}>✕</button>
                </div>

                <form onSubmit=${handleCreateSubmit}>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 620 }}>
                    <div>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Username</label>
                      <input class="search-input" style=${{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. ftpuser" value=${formUser} onInput=${e => setFormUser(e.target.value)} required />
                    </div>
                    <div>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Password</label>
                      <div style=${{ display: 'flex', gap: 6 }}>
                        <input class="search-input" style=${{ flex: 1 }} type="password" placeholder="••••••••" value=${formPass} onInput=${e => setFormPass(e.target.value)} required />
                        <button type="button" class="btn btn-outline btn-sm" onClick=${() => setFormPass(genPassword())} title="Generate random password">⟳</button>
                      </div>
                    </div>
                    <div style=${{ gridColumn: '1 / -1' }}>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Home Directory</label>
                      <input class="search-input" style=${{ width: '100%', boxSizing: 'border-box' }} value=${formDir} onInput=${e => setFormDir(e.target.value)} />
                    </div>
                    <div>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Disk Quota</label>
                      <div style=${{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input class="search-input" style=${{ flex: 1 }} placeholder="0 = unlimited" value=${formQuota} onInput=${e => setFormQuota(e.target.value)} />
                        <span style=${{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>MB</span>
                      </div>
                    </div>
                    <div>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Permissions</label>
                      <select style=${{ width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }} value=${formPerms} onChange=${e => setFormPerms(e.target.value)}>
                        <option value="readwrite">Read + Write (full)</option>
                        <option value="read">Read only</option>
                        <option value="write">Write only</option>
                      </select>
                    </div>
                    <div style=${{ gridColumn: '1 / -1' }}>
                      <label style=${{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>IP Restrictions (optional)</label>
                      <input class="search-input" style=${{ width: '100%', boxSizing: 'border-box' }} placeholder="e.g. 203.0.113.0/24, leave empty for any" value=${formIp} onInput=${e => setFormIp(e.target.value)} />
                    </div>
                  </div>

                  ${formError && html`<div style=${{ color: 'var(--err)', fontSize: 12, marginTop: 12 }}>${formError}</div>`}

                  <div style=${{ marginTop: 20, display: 'flex', gap: 10 }}>
                    <button type="submit" class="btn btn-primary btn-sm" disabled=${formBusy}>
                      ${formBusy ? 'Creating…' : 'Create Account'}
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" onClick=${() => setAddingNew(false)} disabled=${formBusy}>Cancel</button>
                  </div>
                </form>
              </div>

            ` : activeAccount ? html`
              <!-- Account Detail -->
              <div class="animate-fade-in" style=${{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 24 }}>

                <!-- Detail Header -->
                <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div>
                    <div style=${{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style=${{ fontSize: 17, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.4px' }}>${activeAccount.username}</span>
                      ${getStatusChip(activeAccount)}
                    </div>
                    <div style=${{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      ${activeAccount.last_login
                        ? `Last login: ${activeAccount.last_login} · FTPS`
                        : `Home: ${activeAccount.home_dir || '—'} · FTPS connection`}
                    </div>
                  </div>
                  <div style=${{ display: 'flex', gap: 6 }}>
                    <button class="btn btn-outline btn-sm" onClick=${() => setActiveTab('password')}>
                      <${KeyIcon} /> Change Password
                    </button>
                    <button class="btn btn-outline btn-sm" style=${{ color: 'var(--amber)', borderColor: 'var(--amber-border, #f59e0b)' }}>
                      <${LockIcon} /> Lock
                    </button>
                    <button class="btn btn-danger btn-sm" onClick=${() => setDeleteTarget(activeAccount)}>
                      <${TrashIcon} /> Delete
                    </button>
                  </div>
                </div>

                <!-- Stat Cards -->
                <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div class="stat-card">
                    <div class="stat-label">Quota Used</div>
                    <div class="stat-value">
                      ${activeAccount.used_mb ? (activeAccount.used_mb >= 1024 ? (activeAccount.used_mb / 1024).toFixed(1) + ' GB' : activeAccount.used_mb + ' MB') : '—'}
                    </div>
                    <div class="stat-sub">
                      of ${activeAccount.quota_mb ? (activeAccount.quota_mb >= 1024 ? (activeAccount.quota_mb / 1024).toFixed(0) + ' GB' : activeAccount.quota_mb + ' MB') : 'unlimited'}
                    </div>
                    ${activeAccount.quota_mb && activeAccount.used_mb && html`
                      <div class="progress" style=${{ marginTop: 8 }}>
                        <div class="progress-fill" style=${{ width: Math.min(100, (activeAccount.used_mb / activeAccount.quota_mb * 100)).toFixed(0) + '%' }}></div>
                      </div>`}
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Total Sessions</div>
                    <div class="stat-value">${activeAccount.total_sessions || '—'}</div>
                    <div class="stat-sub">all time</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-label">Files Uploaded</div>
                    <div class="stat-value">${activeAccount.files_uploaded || '—'}</div>
                    <div class="stat-sub">this month</div>
                  </div>
                </div>

                <!-- Account Settings Card -->
                <div class="card" style=${{ padding: 16, marginBottom: 14 }}>
                  <div style=${{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Account Settings</div>
                  <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    ${[
                      ['Home Directory', activeAccount.home_dir || '—', true],
                      ['Disk Quota', activeAccount.quota_mb ? (activeAccount.quota_mb >= 1024 ? (activeAccount.quota_mb / 1024).toFixed(0) + ' GB' : activeAccount.quota_mb + ' MB') : 'Unlimited', false],
                      ['Permissions', activeAccount.permissions === 'readwrite' ? 'Read + Write' : activeAccount.permissions || 'Read + Write', false],
                      ['IP Restriction', activeAccount.ip_restriction || 'any', false],
                      ['Chroot Jail', 'enabled', false],
                    ].map(([k, v, isMono], i) => html`
                      <div key=${k} style=${{ display: 'flex', justifyContent: 'space-between', padding: '8px ' + (i % 2 === 1 ? '0 8px 24px' : '0'), borderBottom: i < 4 ? '1px solid var(--border)' : 'none', gap: 8 }}>
                        <span style=${{ fontSize: 12, color: 'var(--text-3)' }}>${k}</span>
                        <span style=${{ fontSize: 12, color: 'var(--text-2)', fontFamily: isMono ? 'var(--font-mono)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                          ${k === 'IP Restriction' ? html`<span class="chip chip-gray" style=${{ fontSize: 10 }}>${v}</span>` :
                            k === 'Chroot Jail' ? html`<span class="chip chip-green" style=${{ fontSize: 10 }}>enabled</span>` : v}
                        </span>
                      </div>`)}
                  </div>
                </div>

                <!-- Change Password inline (shown when tab is 'password') -->
                ${activeTab === 'password' && html`
                  <div class="card animate-fade-in" style=${{ padding: 16, marginBottom: 14 }}>
                    <div style=${{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12 }}>Change Password</div>
                    <form onSubmit=${handleChangePassword} style=${{ display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: 400 }}>
                      <div class="field" style=${{ flex: 1, marginBottom: 0 }}>
                        <input type="password" placeholder="Enter new password" value=${changePass} autocomplete="new-password" onInput=${e => setChangePass(e.target.value)} required />
                      </div>
                      <button type="submit" class="btn btn-primary btn-sm" disabled=${changeBusy}>${changeBusy ? 'Saving…' : 'Update Password'}</button>
                      <button type="button" class="btn btn-ghost btn-sm" onClick=${() => setActiveTab('overview')}>Cancel</button>
                    </form>
                    ${changeError && html`<div style=${{ color: 'var(--err)', fontSize: 12, marginTop: 8 }}>${changeError}</div>`}
                  </div>`}

                <!-- Recent Sessions Card -->
                <div class="card" style=${{ padding: 16 }}>
                  <div style=${{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>Recent Sessions</div>
                  ${(activeAccount.recent_sessions || []).length === 0
                    ? html`<div style=${{ fontSize: 12, color: 'var(--text-3)', padding: '12px 0', textAlign: 'center' }}>No recent session data available</div>`
                    : html`
                      <table style=${{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style=${{ borderBottom: '1px solid var(--border)' }}>
                            ${['Time', 'IP', 'Protocol', 'Transferred'].map(h => html`
                              <th key=${h} style=${{ textAlign: h === 'Transferred' ? 'right' : 'left', padding: '6px 0', fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>${h}</th>`)}
                          </tr>
                        </thead>
                        <tbody>
                          ${(activeAccount.recent_sessions || []).map((s, i) => html`
                            <tr key=${i} style=${{ borderBottom: i < (activeAccount.recent_sessions.length - 1) ? '1px solid var(--border)' : 'none' }}>
                              <td style=${{ padding: '7px 0', color: 'var(--text-3)' }}>${s.time}</td>
                              <td style=${{ padding: '7px 0', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>${s.ip}</td>
                              <td style=${{ padding: '7px 0' }}><span class="chip chip-green" style=${{ fontSize: 10 }}>FTPS</span></td>
                              <td style=${{ padding: '7px 0', textAlign: 'right', color: 'var(--text-2)' }}>${s.transferred}</td>
                            </tr>`)}
                        </tbody>
                      </table>`}
                </div>
              </div>

            ` : html`
              <!-- Blank State -->
              <div class="empty" style=${{ flex: 1 }}>
                <div class="empty-icon" style=${{ fontSize: 32 }}>🔑</div>
                <div class="empty-title">No FTP Account Selected</div>
                <div class="empty-desc">Select an account from the left panel or click "Create Account" to add one.</div>
              </div>`}

          </div>
        </div>

        ${deleteTarget && html`
          <${SdkConfirmModal}
            open=${true}
            title="Delete FTP Account"
            message=${'Delete FTP account "' + deleteTarget.username + '"? FTP access is revoked immediately. Files are kept.'}
            danger=${true}
            onClose=${() => setDeleteTarget(null)}
            onConfirm=${handleDeleteAccount}
          />`}
      </div>`;
  }

  sdk.register('ftp', FtpPlugin);
})();

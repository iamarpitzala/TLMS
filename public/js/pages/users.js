// ── Users page (admin only) ───────────────────────────────────────────────

const ROLE_BADGE = {
  administrator: '<span class="badge badge-admin">Administrator</span>',
  operator:      '<span class="badge badge-operator">Operator</span>',
  viewer:        '<span class="badge badge-viewer">Viewer</span>'
};

async function renderUsers() {
  const page = document.getElementById('page-users');

  if (!APP.isAdmin()) {
    page.innerHTML = `<div class="alert alert-error">Access denied. Administrators only.</div>`;
    return;
  }

  page.innerHTML = `
    <div class="page-header">
      <h2>🔐 Users</h2>
      <button class="btn btn-primary" onclick="openAddUserModal()">＋ Add User</button>
    </div>
    <div class="card">
      <div id="users-table-wrap">
        <div class="loading"><span class="spinner"></span> Loading...</div>
      </div>
    </div>
  `;

  loadUsers();
}

async function loadUsers() {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><span class="spinner"></span> Loading...</div>`;

  try {
    const users = await API.get('/api/users');
    renderUsersTable(users);
  } catch (e) {
    wrap.innerHTML = `<div class="alert alert-error">${escHtml(e.message)}</div>`;
  }
}

function renderUsersTable(users) {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;

  if (users.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔐</div><p>No users found.</p></div>`;
    return;
  }

  const currentUserId = APP.user.id;

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr style="${u.is_active === 0 ? 'opacity:0.6;background:#fafafa' : ''}">
              <td style="color:#9ca3af;font-size:0.8rem">${u.id}</td>
              <td>
                <strong>${escHtml(u.username)}</strong>
                ${u.id === currentUserId ? '<span class="badge badge-viewer" style="margin-left:6px;font-size:0.7rem">You</span>' : ''}
              </td>
              <td>${ROLE_BADGE[u.role] || escHtml(u.role)}</td>
              <td>
                ${u.is_active !== 0
                  ? '<span class="badge badge-active">Active</span>'
                  : '<span class="badge badge-inactive">Deactivated</span>'}
              </td>
              <td style="font-size:0.82rem;color:#6b7280">${u.created_at ? u.created_at.slice(0,16) : '-'}</td>
              <td>
                <div class="btn-group">
                  ${u.is_active !== 0 ? `
                    <button class="btn btn-outline btn-xs" onclick="openChangePasswordModal(${u.id}, '${escHtml(u.username)}')">
                      🔑 Password
                    </button>
                    <button class="btn btn-outline btn-xs" onclick="openChangeRoleModal(${u.id}, '${escHtml(u.username)}', '${u.role}')">
                      🎭 Role
                    </button>
                    ${u.id !== currentUserId ? `
                      <button class="btn btn-warning btn-xs" onclick="deactivateUser(${u.id}, '${escHtml(u.username)}')">
                        🚫 Deactivate
                      </button>
                    ` : ''}
                  ` : `
                    <button class="btn btn-success btn-xs" onclick="reactivateUser(${u.id}, '${escHtml(u.username)}')">
                      ✅ Reactivate
                    </button>
                  `}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:0.5rem;font-size:0.82rem;color:#6b7280">${users.length} user(s)</div>
  `;
}

// ── Add User ──────────────────────────────────────────────────────────────
function openAddUserModal() {
  Modal.open({
    title: '＋ Add New User',
    body: `
      <div class="field-group">
        <label class="required">Username</label>
        <input type="text" id="nu-username" placeholder="Enter username" autocomplete="off" />
      </div>
      <div class="field-group">
        <label class="required">Role</label>
        <select id="nu-role">
          <option value="viewer">Viewer — read-only access</option>
          <option value="operator">Operator — create accounts &amp; transactions</option>
          <option value="administrator">Administrator — full access</option>
        </select>
      </div>
      <div class="field-group">
        <label class="required">Password</label>
        <input type="password" id="nu-password" placeholder="Min. 6 characters" autocomplete="new-password" />
      </div>
      <div class="field-group">
        <label class="required">Confirm Password</label>
        <input type="password" id="nu-confirm" placeholder="Re-enter password" autocomplete="new-password" />
      </div>
      <div id="nu-error" class="alert alert-error" style="display:none"></div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddUser()">＋ Create User</button>
    `
  });
}

async function submitAddUser() {
  const errEl  = document.getElementById('nu-error');
  errEl.style.display = 'none';

  const username = document.getElementById('nu-username').value.trim();
  const role     = document.getElementById('nu-role').value;
  const password = document.getElementById('nu-password').value;
  const confirm  = document.getElementById('nu-confirm').value;

  if (!username) { errEl.textContent = 'Username is required.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    await API.post('/api/users', { username, password, role });
    toast(`User "${username}" created successfully`, 'success');
    Modal.close();
    loadUsers();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '＋ Create User'; }
  }
}

// ── Change Password ───────────────────────────────────────────────────────
function openChangePasswordModal(userId, username) {
  Modal.open({
    title: `🔑 Change Password — ${username}`,
    body: `
      <div class="field-group">
        <label class="required">New Password</label>
        <input type="password" id="cp-password" placeholder="Min. 6 characters" autocomplete="new-password" />
      </div>
      <div class="field-group">
        <label class="required">Confirm New Password</label>
        <input type="password" id="cp-confirm" placeholder="Re-enter new password" autocomplete="new-password" />
      </div>
      <div id="cp-error" class="alert alert-error" style="display:none"></div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitChangePassword(${userId})">💾 Update Password</button>
    `
  });
}

async function submitChangePassword(userId) {
  const errEl   = document.getElementById('cp-error');
  errEl.style.display = 'none';

  const password = document.getElementById('cp-password').value;
  const confirm  = document.getElementById('cp-confirm').value;

  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; return; }

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    await API.patch(`/api/users/${userId}/password`, { password });
    toast('Password updated successfully', 'success');
    Modal.close();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Update Password'; }
  }
}

// ── Change Role ───────────────────────────────────────────────────────────
function openChangeRoleModal(userId, username, currentRole) {
  Modal.open({
    title: `🎭 Change Role — ${username}`,
    body: `
      <p style="margin-bottom:1rem;color:#6b7280;font-size:0.9rem">
        Current role: ${ROLE_BADGE[currentRole] || currentRole}
      </p>
      <div class="field-group">
        <label class="required">New Role</label>
        <select id="cr-role">
          <option value="viewer"        ${currentRole === 'viewer'        ? 'selected' : ''}>Viewer — read-only access</option>
          <option value="operator"      ${currentRole === 'operator'      ? 'selected' : ''}>Operator — create accounts &amp; transactions</option>
          <option value="administrator" ${currentRole === 'administrator' ? 'selected' : ''}>Administrator — full access</option>
        </select>
      </div>
      <div id="cr-error" class="alert alert-error" style="display:none"></div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
      <button class="btn btn-primary" onclick="submitChangeRole(${userId})">💾 Update Role</button>
    `
  });
}

async function submitChangeRole(userId) {
  const errEl = document.getElementById('cr-error');
  errEl.style.display = 'none';

  const role = document.getElementById('cr-role').value;

  const btn = Modal.footer.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    await API.patch(`/api/users/${userId}/role`, { role });
    toast('Role updated successfully', 'success');
    Modal.close();
    loadUsers();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Update Role'; }
  }
}

// ── Deactivate / Reactivate User ─────────────────────────────────────────
async function deactivateUser(userId, username) {
  if (!confirm(`Deactivate "${username}"?\n\nThey will not be able to log in until reactivated.`)) return;
  try {
    await API.delete(`/api/users/${userId}`);
    toast(`User "${username}" deactivated`, 'success');
    loadUsers();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function reactivateUser(userId, username) {
  if (!confirm(`Reactivate "${username}"? They will be able to log in again.`)) return;
  try {
    await API.patch(`/api/users/${userId}/reactivate`, {});
    toast(`User "${username}" reactivated`, 'success');
    loadUsers();
  } catch (e) {
    toast(e.message, 'error');
  }
}

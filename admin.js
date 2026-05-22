// ══════════════════════════════════════════
//  NexTrade — admin.js
//  Admin Panel: Overview, Users, Verifications,
//  Logs, Deposits, Withdrawals, Trades, Settings
// ══════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyCEvGiXfF8xjODvUnuieHQqcnvyide_DUM",
  authDomain: "nextrade-80b98.firebaseapp.com",
  projectId: "nextrade-80b98",
  storageBucket: "nextrade-80b98.firebasestorage.app",
  messagingSenderId: "996607757147",
  appId: "1:996607757147:web:e90f9baa7ca2db876f687e"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentAdmin = null;
let adminRole = null;

// ── Auth guard ──
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  const userDoc = await db.collection('users').doc(user.uid).get();
  const userData = userDoc.data();
  if (!userData || (userData.role !== 'owner' && userData.role !== 'manager' && userData.role !== 'support')) {
    alert('Access denied.');
    window.location.href = 'index.html';
    return;
  }
  currentAdmin = user;
  adminRole = userData.role;
  document.getElementById('adminEmail').textContent = user.email;
  document.getElementById('adminAvatarInitial').textContent = user.email[0].toUpperCase();
  switchAdminPage('overview');
});

// ── Navigation ──
function switchAdminPage(page) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '';
  switch (page) {
    case 'overview': loadOverview(); break;
    case 'users': loadAllUsers(); break;
    case 'verifications': loadVerifications(); break;
    case 'logs': loadLogs(); break;
    case 'deposits': loadDeposits(); break;
    case 'withdrawals': loadWithdrawals(); break;
    case 'trades': loadTrades(); break;
    case 'settings': loadSettings(); break;
  }
  document.getElementById('adminPageTitle').textContent = page.charAt(0).toUpperCase() + page.slice(1);
}

// ── Overview ──
async function loadOverview() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading stats…</p>';
  try {
    const allUsersSnap = await db.collection('users').get();
    const totalUsers = allUsersSnap.size;
    let pendingVer = 0;
    allUsersSnap.forEach(doc => {
      if (doc.data().verificationStatus === 'pending') pendingVer++;
    });
    const logsSnap = await db.collection('adminLogs').orderBy('timestamp','desc').limit(5).get();
    let logsHTML = '';
    logsSnap.forEach(doc => {
      const l = doc.data();
      const date = l.timestamp?.toDate?.()?.toLocaleString() || new Date(l.timestamp?.seconds*1000).toLocaleString();
      logsHTML += `<div class="history-row">
        <div class="history-left">
          <span class="history-type" style="color:var(--accent)">${l.action}</span>
          <span class="history-meta">${l.adminEmail} → ${l.targetUser || '—'} | ${date}</span>
        </div>
      </div>`;
    });
    content.innerHTML = `
      <div class="grid-2col" style="margin-bottom:30px;">
        <div class="card" style="text-align:center;">
          <div style="font-size:32px; font-weight:700; color:var(--text);">${totalUsers}</div>
          <div style="color:var(--muted);">Total Users</div>
        </div>
        <div class="card" style="text-align:center;">
          <div style="font-size:32px; font-weight:700; color:var(--accent3);">${pendingVer}</div>
          <div style="color:var(--muted);">Pending Verifications</div>
        </div>
      </div>
      <div class="card">
        <h3>🕒 Recent Admin Actions</h3>
        ${logsHTML || '<p class="empty-state">No actions yet.</p>'}
      </div>`;
  } catch (err) {
    content.innerHTML = '<p class="error">Failed to load stats.</p>';
    console.error(err);
  }
}

// ── All Users ──
let allUsers = [];
async function loadAllUsers() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = `
    <input type="text" class="search-box" id="userSearch" placeholder="Search by email..." oninput="filterUsers()">
    <div id="usersTableContainer"><p class="loading">Loading users…</p></div>`;
  try {
    const snapshot = await db.collection('users').limit(500).get();
    allUsers = [];
    snapshot.forEach(doc => allUsers.push({ id: doc.id, ...doc.data() }));
    renderUsersTable(allUsers);
  } catch (err) {
    document.getElementById('usersTableContainer').innerHTML = '<p class="error">Error loading users.</p>';
    console.error(err);
  }
}
function filterUsers() {
  const search = document.getElementById('userSearch').value.toLowerCase();
  renderUsersTable(allUsers.filter(u => u.email.toLowerCase().includes(search)));
}
function renderUsersTable(users) {
  const container = document.getElementById('usersTableContainer');
  if (!users.length) { container.innerHTML = '<p class="empty-state">No users found.</p>'; return; }
  let html = `<table class="data-table"><thead><tr><th>Email</th><th>Balance</th><th>Role</th><th>Status</th><th>Verified</th></tr></thead><tbody>`;
  users.forEach(u => {
    const statusBadge = u.suspended ? '<span class="badge badge-danger">Suspended</span>' : '<span class="badge badge-success">Active</span>';
    const verBadge = u.verificationStatus === 'verified' ? '<span class="badge badge-success">Verified</span>' :
                     u.verificationStatus === 'pending' ? '<span class="badge badge-warning">Pending</span>' :
                     u.verificationStatus === 'rejected' ? '<span class="badge badge-danger">Rejected</span>' :
                     '<span class="badge badge-info">Unsubmitted</span>';
    html += `<tr class="clickable-row" onclick="openUserDetail('${u.id}')">
      <td>${u.email}</td><td>$${u.balance?.toFixed(2) || '0.00'}</td><td>${u.role || 'user'}</td><td>${statusBadge}</td><td>${verBadge}</td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── User Detail Modal ──
async function openUserDetail(uid) {
  const modal = document.getElementById('userDetailModal');
  const content = document.getElementById('userDetailContent');
  content.innerHTML = '<p class="loading">Loading user details…</p>';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    if (!userData) throw new Error('User not found');
    const [holdingsSnap, tradesSnap, depositsSnap, withdrawalsSnap] = await Promise.all([
      userRef.collection('holdings').get(),
      userRef.collection('trades').orderBy('timestamp','desc').limit(10).get(),
      userRef.collection('deposits').orderBy('timestamp','desc').limit(5).get(),
      userRef.collection('withdrawals').orderBy('timestamp','desc').limit(5).get()
    ]);
    const holdings = []; holdingsSnap.forEach(doc => holdings.push({ symbol: doc.id, ...doc.data() }));
    const trades = []; tradesSnap.forEach(doc => trades.push(doc.data()));
    const deposits = []; depositsSnap.forEach(doc => deposits.push(doc.data()));
    const withdrawals = []; withdrawalsSnap.forEach(doc => withdrawals.push(doc.data()));

    content.innerHTML = `
      <h2>${userData.email}</h2>
      <div class="badge badge-${userData.verificationStatus==='verified'?'success':'warning'}" style="margin-bottom:16px;">${userData.verificationStatus||'unsubmitted'}</div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Balance</h3>
        <div style="font-size:28px;">$${userData.balance?.toFixed(2)||'0.00'}</div>
        <button class="btn-primary" style="margin-top:12px;" onclick="openBalanceAdjust('${uid}','${userData.email}',${userData.balance||0})">Adjust Balance</button>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Holdings</h3>
        ${holdings.length ? holdings.map(h=>`<div>${h.symbol}: ${h.quantity.toFixed(6)}</div>`).join('') : '<p class="empty-state">No holdings.</p>'}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Recent Trades</h3>
        ${trades.length ? trades.map(t=>`<div class="history-row"><span>${t.side.toUpperCase()} ${t.symbol} | $${t.amount.toFixed(2)}</span><span class="history-meta">${t.timestamp?.toDate?.().toLocaleString()}</span></div>`).join('') : '<p class="empty-state">No trades.</p>'}
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Deposits</h3>
        ${deposits.length ? deposits.map(d=>`<div class="history-row"><span>${d.coin||d.asset||'—'}: $${d.amount.toFixed(2)}</span><span class="history-meta">${d.status} | ${d.txHash?.slice(0,10)}…</span></div>`).join('') : '<p class="empty-state">No deposits.</p>'}
      </div>
      <div class="card"><h3>Withdrawals</h3>
        ${withdrawals.length ? withdrawals.map(w=>`<div class="history-row"><span>${w.asset||'—'}: $${w.amount.toFixed(2)}</span><span class="history-meta">${w.status} | ${w.address?.slice(0,10)}…</span></div>`).join('') : '<p class="empty-state">No withdrawals.</p>'}
      </div>`;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading user.</p>';
    console.error(err);
  }
}

// ── Balance Adjustment ──
function openBalanceAdjust(uid, email, currentBalance) {
  document.getElementById('adjustUserInfo').textContent = `Adjusting: ${email} (current: $${currentBalance.toFixed(2)})`;
  document.getElementById('balanceAdjustModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  window._adjustUid = uid;
  document.getElementById('adjustAmount').value = '';
  document.getElementById('adjustReason').value = '';
  document.getElementById('adjustError').style.display = 'none';
}
async function applyBalanceAdjustment() {
  const uid = window._adjustUid;
  const amount = parseFloat(document.getElementById('adjustAmount').value);
  const reason = document.getElementById('adjustReason').value.trim();
  const errEl = document.getElementById('adjustError');
  if (isNaN(amount) || !reason) { errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  try {
    await db.collection('users').doc(uid).update({ balance: firebase.firestore.FieldValue.increment(amount) });
    await db.collection('adminLogs').add({
      adminEmail: currentAdmin.email,
      action: 'balance_adjustment',
      targetUser: uid,
      amount, reason,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Balance updated.');
    closeModal('balanceAdjustModal');
    openUserDetail(uid);
  } catch (err) {
    console.error(err);
    alert('Error: ' + err.message);
  }
}

// ── Verifications ──
async function loadVerifications() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading verifications…</p>';
  try {
    const snapshot = await db.collection('users').where('verificationStatus','==','pending').get();
    if (snapshot.empty) { content.innerHTML = '<p class="empty-state">No pending verifications.</p>'; return; }
    let html = '<table class="data-table"><thead><tr><th>Email</th><th>Full Name</th><th>Phone</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
    snapshot.forEach(doc => {
      const d = doc.data();
      const vd = d.verificationData || {};
      const date = vd.submittedAt ? new Date(vd.submittedAt.seconds ? vd.submittedAt.seconds*1000 : vd.submittedAt).toLocaleString() : '—';
      html += `<tr>
        <td>${d.email}</td><td>${vd.fullName||'—'}</td><td>${vd.phone||'—'}</td><td>${date}</td>
        <td>
          <button class="action-btn approve" onclick="verifyUser('${doc.id}','approve')">Approve</button>
          <button class="action-btn reject" onclick="rejectUserVerification('${doc.id}')">Reject</button>
        </td></tr>`;
    });
    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading verifications.</p>';
    console.error(err);
  }
}
async function verifyUser(uid, action) {
  if (action === 'approve') {
    await db.collection('users').doc(uid).update({ verificationStatus: 'verified' });
    await logAction('verification_approved', uid);
    loadVerifications();
  }
}
function rejectUserVerification(uid) {
  const reason = prompt('Reason for rejection:');
  if (reason === null) return;
  db.collection('users').doc(uid).update({ verificationStatus: 'rejected', rejectionReason: reason })
    .then(() => logAction('verification_rejected', uid, reason))
    .then(() => loadVerifications());
}

// ── Deposits Queue ──
async function loadDeposits() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading deposits…</p>';
  try {
    const usersSnap = await db.collection('users').get();
    const pendingDeposits = [];
    for (const userDoc of usersSnap.docs) {
      const userEmail = userDoc.data().email;
      const depSnap = await userDoc.ref.collection('deposits').where('status','==','pending').get();
      depSnap.forEach(d => pendingDeposits.push({ id: d.id, userId: userDoc.id, userEmail, ...d.data() }));
    }
    if (!pendingDeposits.length) { content.innerHTML = '<p class="empty-state">No pending deposits.</p>'; return; }
    let html = '<table class="data-table"><thead><tr><th>User</th><th>Asset</th><th>Amount</th><th>TX Hash</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
    pendingDeposits.forEach(d => {
      const date = d.timestamp?.toDate?.()?.toLocaleString() || '—';
      html += `<tr>
        <td>${d.userEmail}</td><td>${d.coin||d.asset||'—'}</td><td>$${d.amount.toFixed(2)}</td>
        <td style="font-family:monospace;font-size:12px;">${d.txHash?.slice(0,10)||'—'}…</td><td>${date}</td>
        <td>
          <button class="action-btn approve" onclick="approveDeposit('${d.userId}','${d.id}')">Approve</button>
          <button class="action-btn reject" onclick="rejectDeposit('${d.userId}','${d.id}')">Reject</button>
        </td></tr>`;
    });
    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading deposits.</p>';
    console.error(err);
  }
}
async function approveDeposit(userId, depositId) {
  const userRef = db.collection('users').doc(userId);
  const depositRef = userRef.collection('deposits').doc(depositId);
  const depSnap = await depositRef.get();
  if (!depSnap.exists) return;
  const dep = depSnap.data();
  await depositRef.update({ status: 'approved' });
  if (dep.status !== 'auto') {
    await userRef.update({ balance: firebase.firestore.FieldValue.increment(dep.amount) });
  }
  await logAction('deposit_approved', userId, `Deposit ${depositId}`);
  loadDeposits();
}
async function rejectDeposit(userId, depositId) {
  await db.collection('users').doc(userId).collection('deposits').doc(depositId).update({ status: 'rejected' });
  await logAction('deposit_rejected', userId, `Deposit ${depositId}`);
  loadDeposits();
}

// ── Withdrawals Queue ──
async function loadWithdrawals() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading withdrawals…</p>';
  try {
    const usersSnap = await db.collection('users').get();
    const pendingWithdrawals = [];
    for (const userDoc of usersSnap.docs) {
      const userEmail = userDoc.data().email;
      const wSnap = await userDoc.ref.collection('withdrawals').where('status','==','pending').get();
      wSnap.forEach(w => pendingWithdrawals.push({ id: w.id, userId: userDoc.id, userEmail, ...w.data() }));
    }
    if (!pendingWithdrawals.length) { content.innerHTML = '<p class="empty-state">No pending withdrawals.</p>'; return; }
    let html = '<table class="data-table"><thead><tr><th>User</th><th>Asset</th><th>Amount</th><th>Address</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
    pendingWithdrawals.forEach(w => {
      const date = w.timestamp?.toDate?.()?.toLocaleString() || '—';
      html += `<tr>
        <td>${w.userEmail}</td><td>${w.asset||'—'}</td><td>$${w.amount.toFixed(2)}</td>
        <td style="font-family:monospace;font-size:12px;">${w.address?.slice(0,10)||'—'}…</td><td>${date}</td>
        <td>
          <button class="action-btn approve" onclick="approveWithdrawal('${w.userId}','${w.id}')">Approve</button>
          <button class="action-btn reject" onclick="rejectWithdrawal('${w.userId}','${w.id}',${w.amount})">Reject</button>
        </td></tr>`;
    });
    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading withdrawals.</p>';
    console.error(err);
  }
}
async function approveWithdrawal(userId, withdrawalId) {
  await db.collection('users').doc(userId).collection('withdrawals').doc(withdrawalId).update({ status: 'completed' });
  await logAction('withdrawal_approved', userId, `Withdrawal ${withdrawalId}`);
  loadWithdrawals();
}
async function rejectWithdrawal(userId, withdrawalId, amount) {
  const userRef = db.collection('users').doc(userId);
  await userRef.collection('withdrawals').doc(withdrawalId).update({ status: 'rejected' });
  await userRef.update({ balance: firebase.firestore.FieldValue.increment(amount) });
  await logAction('withdrawal_rejected', userId, `Withdrawal ${withdrawalId} refunded $${amount}`);
  loadWithdrawals();
}

// ── Trades Monitor ──
async function loadTrades() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading trades…</p>';
  try {
    const usersSnap = await db.collection('users').get();
    const allTrades = [];
    for (const userDoc of usersSnap.docs) {
      const userEmail = userDoc.data().email;
      const tradesSnap = await userDoc.ref.collection('trades').orderBy('timestamp','desc').limit(50).get();
      tradesSnap.forEach(t => allTrades.push({ userEmail, ...t.data() }));
    }
    allTrades.sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
    const recent = allTrades.slice(0, 100);
    if (!recent.length) { content.innerHTML = '<p class="empty-state">No trades found.</p>'; return; }
    let html = '<table class="data-table"><thead><tr><th>User</th><th>Side</th><th>Symbol</th><th>Amount</th><th>Price</th><th>Date</th></tr></thead><tbody>';
    recent.forEach(t => {
      const date = t.timestamp?.toDate?.()?.toLocaleString() || '—';
      const sideClass = t.side === 'buy' ? 'trade-buy' : 'trade-sell';
      html += `<tr>
        <td>${t.userEmail}</td>
        <td class="${sideClass}">${t.side.toUpperCase()}</td>
        <td>${t.symbol}</td>
        <td>$${t.amount.toFixed(2)}</td>
        <td>$${t.price.toFixed(2)}</td>
        <td>${date}</td></tr>`;
    });
    html += '</tbody></table>';
    content.innerHTML = html;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading trades.</p>';
    console.error(err);
  }
}

// ── Settings ──
async function loadSettings() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading settings…</p>';
  try {
    let snap = await db.collection('adminSettings').doc('platform').get();
    if (!snap.exists) {
      await db.collection('adminSettings').doc('platform').set({
        maintenanceMode: false,
        tradingFeePercent: 0.1,
        minWithdrawalAmount: 10,
        allowedCoins: ["BTC","ETH","SOL","BNB","DOGE","ADA","LINK","USDT"],
        announcement: "",
        referralBonusAmount: 50
      });
      snap = await db.collection('adminSettings').doc('platform').get();
    }
    const s = snap.data();
    content.innerHTML = `
      <div class="card">
        <h3>⚙️ Platform Settings</h3>
        <div class="form-field"><label class="form-label">Trading Fee (%)</label><input type="number" id="setFee" class="form-input" value="${s.tradingFeePercent}" step="0.01"></div>
        <div class="form-field"><label class="form-label">Minimum Withdrawal ($)</label><input type="number" id="setMinWithdraw" class="form-input" value="${s.minWithdrawalAmount}" step="1"></div>
        <div class="form-field"><label class="form-label">Referral Bonus ($)</label><input type="number" id="setRefBonus" class="form-input" value="${s.referralBonusAmount}" step="1"></div>
        <div class="form-field"><label class="form-label">Allowed Coins (comma separated)</label><input type="text" id="setAllowedCoins" class="form-input" value="${s.allowedCoins.join(',')}"></div>
        <div class="form-field" style="display:flex;align-items:center;gap:12px;"><label class="form-label" style="margin-bottom:0;">Maintenance Mode</label><input type="checkbox" id="setMaintenance" ${s.maintenanceMode?'checked':''}></div>
        <div class="form-field"><label class="form-label">Announcement Banner</label><textarea id="setAnnouncement" class="form-input" rows="3">${s.announcement||''}</textarea></div>
        <button class="btn-primary" onclick="saveSettings()">Save Settings</button>
      </div>`;
  } catch (err) {
    content.innerHTML = '<p class="error">Error loading settings.</p>';
    console.error(err);
  }
}
async function saveSettings() {
  const fee = parseFloat(document.getElementById('setFee').value)||0.1;
  const minW = parseFloat(document.getElementById('setMinWithdraw').value)||10;
  const refBonus = parseFloat(document.getElementById('setRefBonus').value)||50;
  const coins = document.getElementById('setAllowedCoins').value.split(',').map(c=>c.trim()).filter(Boolean);
  const maintenance = document.getElementById('setMaintenance').checked;
  const announcement = document.getElementById('setAnnouncement').value.trim();
  try {
    await db.collection('adminSettings').doc('platform').set({
      maintenanceMode: maintenance,
      tradingFeePercent: fee,
      minWithdrawalAmount: minW,
      allowedCoins: coins,
      announcement,
      referralBonusAmount: refBonus
    }, { merge: true });
    await logAction('settings_updated', null, 'Platform settings updated');
    alert('Settings saved.');
    loadSettings();
  } catch (err) {
    console.error(err);
    alert('Error saving settings.');
  }
}

// ── Utility ──
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
function handleBackdropClick(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}
async function logAction(action, targetUser, details) {
  await db.collection('adminLogs').add({
    adminEmail: currentAdmin.email,
    action,
    targetUser: targetUser || null,
    details: details || '',
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
function logout() {
  auth.signOut();
  window.location.href = 'index.html';
}
// Mobile
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

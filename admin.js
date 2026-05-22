// ══════════════════════════════════════════
//  NexTrade — admin.js
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
let selectedAdminUser = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  const doc = await db.collection('users').doc(user.uid).get();
  const role = doc.exists ? doc.data().role : null;
  if (!['owner','manager','support'].includes(role)) {
    alert('Access denied');
    window.location.href = 'index.html';
    return;
  }
  currentAdmin = user;
  adminRole = role;
  document.getElementById('adminEmail').textContent = user.email;
  document.getElementById('adminAvatarInitial').textContent = user.email[0].toUpperCase();
  switchAdminPage('overview');
});

function switchAdminPage(page) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  const title = document.getElementById('adminPageTitle');
  if (title) title.textContent = page.charAt(0).toUpperCase() + page.slice(1);
  const content = document.getElementById('adminPageContent');
  if (!content) return;
  content.innerHTML = '';
  switch (page) {
    case 'overview': loadOverview(); break;
    case 'users': loadAllUsers(); break;
    case 'verifications': loadVerifications(); break;
    case 'logs': loadLogs(); break;
    case 'deposits': loadDeposits(); break;
    case 'withdrawals': loadWithdrawals(); break;
    case 'wallets': loadWalletsPage(); break;
    case 'trades': loadTrades(); break;
    case 'settings': loadSettings(); break;
    default: loadOverview(); break;
  }
}

async function loadOverview() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading overview…</h3><p class="loading">Please wait.</p></div>';
  let userCount = 0;
  let pendingVerifications = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  try {
    const usersSnap = await db.collection('users').get();
    userCount = usersSnap.size;
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.verificationStatus === 'pending') pendingVerifications++;
    });
    const depositsSnap = await db.collectionGroup('depositHistory').get();
    depositCount = depositsSnap.size;
    const withdrawSnap = await db.collectionGroup('withdrawHistory').get();
    withdrawalCount = withdrawSnap.size;
  } catch (e) {
    console.error(e);
  }
  content.innerHTML = `
    <div class="card">
      <h3>Platform Overview</h3>
      <div class="grid-2col" style="gap:20px;">
        <div class="card"><strong style="font-size:28px;">${userCount}</strong><p>Registered users</p></div>
        <div class="card"><strong style="font-size:28px;">${pendingVerifications}</strong><p>Pending verifications</p></div>
      </div>
      <div class="grid-2col" style="gap:20px;">
        <div class="card"><strong style="font-size:28px;">${depositCount}</strong><p>Deposit records</p></div>
        <div class="card"><strong style="font-size:28px;">${withdrawalCount}</strong><p>Withdrawal records</p></div>
      </div>
    </div>`;
}

async function loadAllUsers() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading users…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').limit(200).get();
    if (snap.empty) {
      content.innerHTML = '<div class="card"><p class="empty-state">No users found.</p></div>';
      return;
    }
    let html = `<div class="card"><h3>Users</h3><table class="data-table"><thead><tr><th>Email</th><th>Role</th><th>Balance</th><th>Verified</th><th>Joined</th><th style="text-align:right">Action</th></tr></thead><tbody>`;
    snap.forEach(doc => {
      const data = doc.data();
      html += `<tr class="clickable-row"><td>${data.email || '—'}</td><td>${data.role || 'user'}</td><td>$${(data.balance || 0).toFixed(2)}</td><td>${data.verificationStatus === 'verified' ? 'Yes' : data.verificationStatus || 'No'}</td><td>${data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString() : '—'}</td><td style="text-align:right"><button class="btn-primary" onclick="openUserDetail('${doc.id}')">View</button></td></tr>`;
    });
    html += '</tbody></table></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load users.</p></div>';
  }
}

async function openUserDetail(userId) {
  selectedAdminUser = userId;
  const modal = document.getElementById('userDetailModal');
  const content = document.getElementById('userDetailContent');
  content.innerHTML = '<p class="loading">Loading user details…</p>';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      content.innerHTML = '<p class="empty-state">User not found.</p>';
      return;
    }
    const data = doc.data();
    content.innerHTML = `
      <h2>User details</h2>
      <div class="form-field"><label class="form-label">Email</label><div>${data.email || '—'}</div></div>
      <div class="form-field"><label class="form-label">Role</label><div>${data.role || 'user'}</div></div>
      <div class="form-field"><label class="form-label">Balance</label><div>$${(data.balance || 0).toFixed(2)}</div></div>
      <div class="form-field"><label class="form-label">Verification</label><div>${data.verificationStatus || 'Not submitted'}</div></div>
      <div class="form-field"><label class="form-label">Referral Code</label><div>${data.referralCode || '—'}</div></div>
      <div class="form-field"><label class="form-label">Created</label><div>${data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : '—'}</div></div>
      <button class="btn-primary" onclick="openBalanceAdjustModal('${userId}')">Adjust Balance</button>
    `;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<p class="empty-state">Unable to load user details.</p>';
  }
}

function openBalanceAdjustModal(userId) {
  selectedAdminUser = userId;
  const modal = document.getElementById('balanceAdjustModal');
  const info = document.getElementById('adjustUserInfo');
  if (info) info.textContent = `User ID: ${userId}`;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function applyBalanceAdjustment() {
  const amount = parseFloat(document.getElementById('adjustAmount')?.value);
  const reason = document.getElementById('adjustReason')?.value.trim();
  const error = document.getElementById('adjustError');
  if (!selectedAdminUser || !amount || !reason) {
    if (error) error.style.display = 'block';
    return;
  }
  if (error) error.style.display = 'none';
  try {
    const userRef = db.collection('users').doc(selectedAdminUser);
    await userRef.update({ balance: firebase.firestore.FieldValue.increment(amount) });
    await db.collection('adminLogs').add({
      admin: currentAdmin.email,
      userId: selectedAdminUser,
      amount,
      reason,
      type: 'balance_adjustment',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert('Balance adjusted successfully.');
    document.getElementById('balanceAdjustModal').classList.remove('open');
    document.body.style.overflow = '';
    loadAllUsers();
  } catch (e) {
    console.error(e);
    alert('Could not apply adjustment.');
  }
}

async function loadVerifications() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading verifications…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    const rows = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.verificationStatus && data.verificationStatus !== 'verified') {
        rows.push({ id: doc.id, ...data });
      }
    });
    if (!rows.length) {
      content.innerHTML = '<div class="card"><p class="empty-state">No pending verification items.</p></div>';
      return;
    }
    let html = '<div class="card"><h3>Verification Requests</h3><table class="data-table"><thead><tr><th>Email</th><th>Status</th><th>Full Name</th><th>Phone</th><th style="text-align:right">Action</th></tr></thead><tbody>';
    rows.forEach(data => {
      html += `<tr><td>${data.email || '—'}</td><td><span class="badge badge-warning">${data.verificationStatus}</span></td><td>${data.verificationData?.fullName || '—'}</td><td>${data.verificationData?.phone || '—'}</td><td style="text-align:right"><button class="btn-primary" onclick="changeVerificationStatus('${data.id}','verified')">Approve</button> <button class="btn-deposit" style="margin-left:8px;" onclick="changeVerificationStatus('${data.id}','rejected')">Reject</button></td></tr>`;
    });
    html += '</tbody></table></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load verification requests.</p></div>';
  }
}

async function changeVerificationStatus(userId, status) {
  try {
    await db.collection('users').doc(userId).update({ verificationStatus: status, verified: status === 'verified' });
    alert(`User verification ${status}.`);
    loadVerifications();
  } catch (e) {
    console.error(e);
    alert('Unable to update verification status.');
  }
}

async function loadLogs() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading logs…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collection('adminLogs').orderBy('createdAt', 'desc').limit(100).get();
    if (snap.empty) {
      content.innerHTML = '<div class="card"><p class="empty-state">No logs available.</p></div>';
      return;
    }
    let html = '<div class="card"><h3>Activity Logs</h3><div>';
    snap.forEach(doc => {
      const data = doc.data();
      html += `<div class="history-row"><div><strong>${data.type || 'Event'}</strong><div class="history-meta">${data.admin || 'Admin'} • ${data.reason || ''}</div></div><div>${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}</div></div>`;
    });
    html += '</div></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load logs.</p></div>';
  }
}

async function loadDeposits() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading deposits…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collectionGroup('depositHistory').orderBy('createdAt', 'desc').limit(100).get();
    if (snap.empty) {
      content.innerHTML = '<div class="card"><p class="empty-state">No deposit records found.</p></div>';
      return;
    }
    let html = '<div class="card"><h3>Deposit History</h3><div>';
    snap.forEach(doc => {
      const data = doc.data();
      html += `<div class="history-row"><div><strong>${data.asset || 'N/A'} $${(data.amount || 0).toFixed(2)}</strong><div class="history-meta">${data.status || 'Submitted'} • ${data.txHash || 'No TX'}</div></div><div>${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}</div></div>`;
    });
    html += '</div></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load deposits.</p></div>';
  }
}

async function loadWithdrawals() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading withdrawals…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collectionGroup('withdrawHistory').orderBy('createdAt', 'desc').limit(100).get();
    if (snap.empty) {
      content.innerHTML = '<div class="card"><p class="empty-state">No withdrawal records found.</p></div>';
      return;
    }
    let html = '<div class="card"><h3>Withdrawal History</h3><div>';
    snap.forEach(doc => {
      const data = doc.data();
      html += `<div class="history-row"><div><strong>${data.asset || 'N/A'} $${(data.amount || 0).toFixed(2)}</strong><div class="history-meta">${data.status || 'Submitted'} • ${data.address || 'No address'}</div></div><div>${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}</div></div>`;
    });
    html += '</div></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load withdrawals.</p></div>';
  }
}

async function loadTrades() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading trades…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collectionGroup('tradeHistory').orderBy('createdAt', 'desc').limit(100).get();
    if (snap.empty) {
      content.innerHTML = '<div class="card"><p class="empty-state">No trades found.</p></div>';
      return;
    }
    let html = '<div class="card"><h3>Recent Trades</h3><div>';
    snap.forEach(doc => {
      const data = doc.data();
      html += `<div class="history-row"><div><strong>${data.side?.toUpperCase() || 'TRADE'} ${data.symbol || ''}</strong><div class="history-meta">$${(data.amount || 0).toFixed(2)} • Fee $${(data.fee || 0).toFixed(2)}</div></div><div>${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}</div></div>`;
    });
    html += '</div></div>';
    content.innerHTML = html;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load trades.</p></div>';
  }
}

async function loadSettings() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<div class="card"><h3>Loading settings…</h3><p class="loading">Please wait.</p></div>';
  try {
    const snap = await db.collection('adminSettings').doc('platform').get();
    const data = snap.exists ? snap.data() : {};
    content.innerHTML = `
      <div class="card">
        <h3>Platform Settings</h3>
        <div class="form-field"><label class="form-label">Maintenance Mode</label><input type="checkbox" id="settingMaintenance" ${data.maintenanceMode ? 'checked' : ''}></div>
        <div class="form-field"><label class="form-label">Announcement</label><input type="text" id="settingAnnouncement" class="form-input" value="${data.announcement || ''}" placeholder="Message for banner"></div>
        <div class="form-field"><label class="form-label">Trading Fee %</label><input type="number" id="settingTradingFee" class="form-input" value="${data.tradingFeePercent || 0.1}" step="0.1"></div>
        <div class="form-field"><label class="form-label">Minimum Withdrawal</label><input type="number" id="settingMinWithdrawal" class="form-input" value="${data.minWithdrawalAmount || 10}" step="1"></div>
        <div class="form-field"><label class="form-label">Referral Bonus</label><input type="number" id="settingReferralBonus" class="form-input" value="${data.referralBonusAmount || 50}" step="1"></div>
        <button class="btn-primary" onclick="savePlatformSettings()">Save Settings</button>
      </div>`;
  } catch (e) {
    console.error(e);
    content.innerHTML = '<div class="card"><p class="empty-state">Unable to load settings.</p></div>';
  }
}

async function savePlatformSettings() {
  const maintenance = document.getElementById('settingMaintenance')?.checked;
  const announcement = document.getElementById('settingAnnouncement')?.value.trim();
  const tradingFeePercent = parseFloat(document.getElementById('settingTradingFee')?.value) || 0.1;
  const minWithdrawalAmount = parseFloat(document.getElementById('settingMinWithdrawal')?.value) || 10;
  const referralBonusAmount = parseFloat(document.getElementById('settingReferralBonus')?.value) || 50;
  try {
    await db.collection('adminSettings').doc('platform').set({
      maintenanceMode: maintenance,
      announcement,
      tradingFeePercent,
      minWithdrawalAmount,
      referralBonusAmount
    }, { merge: true });
    alert('Platform settings saved.');
  } catch (e) {
    console.error(e);
    alert('Unable to save settings.');
  }
}

async function loadWalletsPage() {
  const content = document.getElementById('adminPageContent');
  content.innerHTML = '<p class="loading">Loading wallets…</p>';
  let wallets = {};
  try {
    const snap = await db.collection('adminSettings').doc('platform').get();
    if (snap.exists && snap.data().wallets) wallets = snap.data().wallets;
  } catch (e) { console.error(e); }
  const coins = ['BTC','ETH','USDT','BNB','SOL','DOGE','LINK','ADA'];
  let html = '<div class="card"><h3>💼 Edit Wallet Addresses</h3>';
  coins.forEach(coin => {
    const addr = wallets[coin] || '';
    html += `
      <div class="form-field">
        <label class="form-label">${coin} Address</label>
        <input type="text" id="wallet-${coin}" class="form-input" value="${addr}" placeholder="Wallet address for ${coin}">
      </div>`;
  });
  html += `
      <button class="btn-primary" onclick="saveWalletAddresses()">Save Addresses</button>
      <hr style="border-color:var(--border); margin:20px 0;">
      <h4>QR Preview (after saving)</h4>
      <div id="qrPreviews" style="display:flex; flex-wrap:wrap; gap:16px; margin-top:12px;"></div>
    </div>`;
  content.innerHTML = html;
  setTimeout(() => generateQRPreviews(wallets), 200);
}

function generateQRPreviews(wallets) {
  const container = document.getElementById('qrPreviews');
  if (!container) return;
  container.innerHTML = '';
  for (const [coin, addr] of Object.entries(wallets)) {
    if (!addr) continue;
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.innerHTML = `<strong>${coin}</strong>`;
    const qrDiv = document.createElement('div');
    div.appendChild(qrDiv);
    container.appendChild(div);
    new QRCode(qrDiv, { text: addr, width: 100, height: 100, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.M });
  }
}

async function saveWalletAddresses() {
  const wallets = {};
  const coins = ['BTC','ETH','USDT','BNB','SOL','DOGE','LINK','ADA'];
  coins.forEach(coin => {
    const el = document.getElementById('wallet-' + coin);
    if (el && el.value.trim()) wallets[coin] = el.value.trim();
  });
  try {
    await db.collection('adminSettings').doc('platform').set({ wallets }, { merge: true });
    alert('Wallet addresses saved.');
    document.getElementById('qrPreviews').innerHTML = '';
    setTimeout(() => generateQRPreviews(wallets), 100);
  } catch (e) {
    console.error(e);
    alert('Error saving wallet addresses.');
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

function handleBackdropClick(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

function logout() {
  auth.signOut();
  window.location.href = 'index.html';
}

window.openUserDetail = openUserDetail;
window.openBalanceAdjustModal = openBalanceAdjustModal;
window.savePlatformSettings = savePlatformSettings;
window.changeVerificationStatus = changeVerificationStatus;
window.saveWalletAddresses = saveWalletAddresses;
window.applyBalanceAdjustment = applyBalanceAdjustment;

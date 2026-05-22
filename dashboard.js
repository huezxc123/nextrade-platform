// ══════════════════════════════════════════
//  NexTrade — dashboard.js
//  (hardcoded config for local use only)
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

// ── Coin data (used by holdings display) ──
const coins = {
  BTC: { name:'Bitcoin', price:0 },
  ETH: { name:'Ethereum', price:0 },
  SOL: { name:'Solana', price:0 },
  BNB: { name:'BNB', price:0 },
  DOGE:{ name:'Dogecoin', price:0 },
  ADA: { name:'Cardano', price:0 },
  LINK:{ name:'Chainlink', price:0 },
  USDT:{ name:'Tether', price:0 }
};

// ── Admin settings ──
async function applyAdminSettings() {
  try {
    const settingsSnap = await db.collection('adminSettings').doc('platform').get();
    if (!settingsSnap.exists) return;
    const s = settingsSnap.data();
    if (s.maintenanceMode && currentUser) {
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      const role = userDoc.data()?.role;
      if (role !== 'owner' && role !== 'manager') {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#f0f2f8;font-family:Syne,sans-serif;font-size:24px;">🚧 Platform is under maintenance. Please check back later.</div>';
        return;
      }
    }
    if (s.announcement) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#7c3aed;color:#fff;padding:10px;text-align:center;';
      banner.textContent = s.announcement;
      document.body.insertBefore(banner, document.body.firstChild);
    }
    window._tradingFeePercent = s.tradingFeePercent || 0.1;
    window._minWithdrawal = s.minWithdrawalAmount || 10;
    window._allowedCoins = s.allowedCoins || Object.keys(coins);
    window._referralBonus = s.referralBonusAmount || 50;
  } catch (err) {
    console.error('Admin settings load failed:', err);
  }
}

// ── Global state ──
let currentUser = null;
let userBalance = 0;
let holdings = {};
let isVerified = false;

// UI elements
const balanceDisplay = document.getElementById('balanceDisplay');
const userEmailSpan = document.getElementById('userEmail');
const tradeUnverified = document.getElementById('tradeUnverified');
const tradeContent = document.getElementById('tradeContent');
const holdingsContainer = document.getElementById('holdingsContainer');

// ── Tab switching ──
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('topbarTitle').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    if (tab === 'referral') loadReferralData();
    if (tab === 'receipts') {
      loadReceipts();
      loadDepositHistory();
      loadWithdrawHistory();
    }
    if (tab === 'account') loadVerificationStatus();
  });
});

// ── Auth ──
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  userEmailSpan.textContent = user.email;
  if (window._setUserUI) window._setUserUI(user.email);

  // Email verification check (disabled for demo)
  document.getElementById('verificationPrompt').style.display = 'none';
  document.getElementById('mainDashboardContent').style.display = 'block';

  await applyAdminSettings();
  await initializeUserData();
  await loadHoldings();
  loadReferralCode();
  loadVerificationStatus();
  loadReferralData();
  loadReceipts();
  loadDepositHistory();
  loadWithdrawHistory();
  updateNotifBadge();
  listenNotifications();
});

// ── Initialize user data ──
async function initializeUserData() {
  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  if (!doc.exists) {
    await userRef.set({
      email: currentUser.email,
      balance: 10000,
      verified: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    userBalance = 10000;
    isVerified = false;
  } else {
    const data = doc.data();
    userBalance = data.balance || 10000;
    isVerified = data.verified || false;
    if (data.balance === undefined) {
      await userRef.update({ balance: 10000 });
      userBalance = 10000;
    }
  }
  balanceDisplay.textContent = '$' + userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
  toggleTradeAccess();
}

function toggleTradeAccess() {
  if (isVerified) {
    tradeUnverified.style.display = 'none';
    tradeContent.style.display = 'block';
    // Trigger chart initialisation
    setTimeout(() => {
      if (typeof window.initTradeModule === 'function') {
        window.initTradeModule();
      }
    }, 200);
  } else {
    tradeUnverified.style.display = 'block';
    tradeContent.style.display = 'none';
  }
}

// ── Holdings ──
async function loadHoldings() {
  const snapshot = await db.collection('users').doc(currentUser.uid).collection('holdings').get();
  holdings = {};
  snapshot.forEach(doc => holdings[doc.id] = doc.data().quantity);
  renderHoldings();
}
function renderHoldings() {
  if (!holdingsContainer) return;
  if (Object.keys(holdings).length === 0) {
    holdingsContainer.innerHTML = '<p class="empty-state">No holdings yet.</p>';
    return;
  }
  let html = `<table class="data-table"><thead><tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead><tbody>`;
  for (const [sym, qty] of Object.entries(holdings)) {
    const price = coins[sym]?.price || 0;
    html += `<tr><td>${sym}</td><td>${qty.toFixed(6)}</td><td>$${price.toFixed(2)}</td><td>$${(qty*price).toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  holdingsContainer.innerHTML = html;
}

// ── Verification ──
document.getElementById('verificationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('fullName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const referralCode = document.getElementById('referralCodeInput').value.trim();
  if (!fullName || !phone) return alert('Please fill all fields.');
  const userRef = db.collection('users').doc(currentUser.uid);
  await userRef.update({
    verificationData: { fullName, phone, submittedAt: new Date() },
    verificationStatus: 'pending'
  });
  if (referralCode) {
    const snapshot = await db.collection('users').where('referralCode', '==', referralCode).get();
    if (!snapshot.empty) {
      const referrerDoc = snapshot.docs[0];
      await userRef.update({ referredBy: referralCode });
      const alreadyReferred = (await db.collection('users').doc(referrerDoc.id).collection('referrals').doc(currentUser.uid).get()).exists;
      if (!alreadyReferred) {
        await db.collection('users').doc(referrerDoc.id).collection('referrals').doc(currentUser.uid).set({
          email: currentUser.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        const referrerData = (await referrerDoc.ref.get()).data();
        await referrerDoc.ref.update({ balance: (referrerData.balance || 0) + (window._referralBonus || 50) });
      }
    }
  }
  alert('Verification submitted! Awaiting admin approval.');
  loadVerificationStatus();
});

async function loadVerificationStatus() {
  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  const data = doc.data();
  const status = data.verificationStatus || 'unsubmitted';
  let statusHTML = '';
  if (status === 'verified') statusHTML = '<span class="vbadge-verified">✅ Verified</span>';
  else if (status === 'pending') statusHTML = '<span class="vbadge-pending">⏳ Pending Approval</span>';
  else if (status === 'rejected') statusHTML = '<span class="vbadge-rejected">❌ Rejected</span>';
  else statusHTML = '<span class="verification-badge" style="color:var(--muted);">Not submitted</span>';
  document.getElementById('verificationStatusDisplay').innerHTML = statusHTML;
  isVerified = status === 'verified';
  toggleTradeAccess();
  if (data.verificationData) {
    document.getElementById('fullName').value = data.verificationData.fullName || '';
    document.getElementById('phone').value = data.verificationData.phone || '';
  }
}

// ── Referral ──
function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}
async function loadReferralCode() {
  const userRef = db.collection('users').doc(currentUser.uid);
  const doc = await userRef.get();
  let code = doc.data()?.referralCode;
  if (!code) {
    code = generateReferralCode();
    await userRef.update({ referralCode: code });
  }
  document.getElementById('myReferralCode').textContent = code;
}
async function loadReferralData() {
  const referralsSnapshot = await db.collection('users').doc(currentUser.uid).collection('referrals').get();
  const count = referralsSnapshot.size;
  document.getElementById('referralStats').innerHTML = `Total referrals: ${count} (earning $${count * (window._referralBonus || 50)} bonus)`;
  let html = '';
  referralsSnapshot.forEach(doc => {
    html += `<div class="history-row"><span>${doc.data().email}</span><span class="history-meta">${new Date(doc.data().timestamp?.seconds*1000).toLocaleDateString()}</span></div>`;
  });
  document.getElementById('referredList').innerHTML = html || '<p class="empty-state">No referrals yet.</p>';
}

// ── Trade receipts ──
async function loadReceipts() {
  const container = document.getElementById('receiptsContainer');
  if (!container) return;
  const snapshot = await db.collection('users').doc(currentUser.uid).collection('trades')
    .orderBy('timestamp','desc').limit(50).get();
  let html = '';
  snapshot.forEach(doc => {
    const t = doc.data();
    const dt = t.timestamp?.toDate().toLocaleString();
    html += `
      <div class="history-row">
        <div class="history-left">
          <span class="history-type ${t.side==='buy'?'trade-buy':'trade-sell'}">${t.side.toUpperCase()}</span>
          <span>${t.quantity?.toFixed(6)} ${t.symbol}</span>
          <span class="history-meta">${dt}</span>
        </div>
        <div style="text-align:right;">
          <div>$${t.amount.toFixed(2)}</div>
          <div class="history-meta">@ $${t.price.toFixed(2)}</div>
        </div>
      </div>`;
  });
  container.innerHTML = html || '<p class="empty-state">No trades yet.</p>';
}

// ── Deposit receipt submission & history ──
async function submitDepositReceipt() {
  const txHash = document.getElementById('receiptTxHash').value.trim();
  const amount = parseFloat(document.getElementById('receiptAmountDep').value);
  const asset = document.getElementById('receiptAssetSelect').value;
  const msgEl = document.getElementById('receiptSubmitMsg');
  if (!txHash || isNaN(amount) || amount < 10) {
    msgEl.innerHTML = '<span style="color:var(--danger);">Please fill all fields (min $10).</span>';
    return;
  }
  msgEl.innerHTML = 'Submitting…';
  try {
    const user = auth.currentUser;
    const ref = 'DEP-' + Date.now().toString(36).toUpperCase();
    await db.collection('users').doc(user.uid).collection('deposits').add({
      txHash, amount, asset,
      status: 'pending',
      ref,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    msgEl.innerHTML = '<span style="color:var(--success);">Receipt submitted for review.</span>';
    document.getElementById('receiptTxHash').value = '';
    document.getElementById('receiptAmountDep').value = '';
    loadDepositHistory();
  } catch (err) {
    console.error(err);
    msgEl.innerHTML = '<span style="color:var(--danger);">Error: ' + err.message + '</span>';
  }
}

async function loadDepositHistory() {
  const container = document.getElementById('depositHistoryContainer');
  if (!container) return;
  const snapshot = await db.collection('users').doc(currentUser.uid).collection('deposits')
    .orderBy('timestamp', 'desc').limit(30).get();
  if (snapshot.empty) {
    container.innerHTML = '<p class="empty-state">No deposits yet.</p>';
    return;
  }
  let html = `<table class="data-table"><thead><tr><th>Asset</th><th>Amount</th><th>TX Hash</th><th>Status</th><th>Date</th></tr></thead><tbody>`;
  snapshot.forEach(doc => {
    const d = doc.data();
    const date = d.timestamp?.toDate().toLocaleString();
    html += `
      <tr>
        <td>${d.asset || d.coin || '—'}</td>
        <td>$${d.amount.toFixed(2)}</td>
        <td style="font-family:monospace; font-size:12px;">${d.txHash?.slice(0,10) || '—'}…</td>
        <td><span class="badge-status badge-${d.status}">${d.status}</span></td>
        <td>${date}</td>
      </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Withdrawal history ──
async function loadWithdrawHistory() {
  const container = document.getElementById('withdrawHistoryContainer');
  if (!container) return;
  const snapshot = await db.collection('users').doc(currentUser.uid).collection('withdrawals')
    .orderBy('timestamp', 'desc').limit(30).get();
  if (snapshot.empty) {
    container.innerHTML = '<p class="empty-state">No withdrawals yet.</p>';
    return;
  }
  let html = `<table class="data-table"><thead><tr><th>Asset</th><th>Amount</th><th>Address</th><th>Status</th><th>Date</th></tr></thead><tbody>`;
  snapshot.forEach(doc => {
    const d = doc.data();
    const date = d.timestamp?.toDate().toLocaleString();
    html += `
      <tr>
        <td>${d.asset || '—'}</td>
        <td>$${d.amount.toFixed(2)}</td>
        <td style="font-family:monospace; font-size:12px;">${d.address?.slice(0,10) || '—'}…</td>
        <td><span class="badge-status badge-${d.status}">${d.status}</span></td>
        <td>${date}</td>
      </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Live price fetch (for holdings display) ──
async function fetchLivePrices() {
  try {
    const ids = Object.values(coins).map(c => c.name.toLowerCase()).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await res.json();
    for (const [sym, obj] of Object.entries(coins)) {
      const key = obj.name.toLowerCase();
      if (data[key]?.usd) obj.price = data[key].usd;
    }
    renderHoldings();
  } catch (err) {
    console.warn('Live price fetch failed.');
  }
}
fetchLivePrices();
setInterval(fetchLivePrices, 30000);

// ── Notifications ──
let unreadNotifCount = 0;

async function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  try {
    const unreadSnap = await db.collection('users').doc(currentUser.uid)
      .collection('notifications').where('read', '==', false).get();
    unreadNotifCount = unreadSnap.size;
    if (unreadNotifCount > 0) {
      badge.textContent = unreadNotifCount;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

async function openNotificationsModal() {
  const modal = document.getElementById('notifModal');
  const container = document.getElementById('notifListContainer');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  container.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const snap = await db.collection('users').doc(currentUser.uid)
      .collection('notifications').orderBy('timestamp', 'desc').limit(50).get();

    if (snap.empty) {
      container.innerHTML = '<p class="empty-state">No notifications.</p>';
    } else {
      let html = '';
      snap.forEach(doc => {
        const n = doc.data();
        const date = n.timestamp?.toDate?.()?.toLocaleString() || '—';
        html += `
          <div class="history-row" style="align-items:flex-start; ${!n.read ? 'border-left:3px solid var(--accent); padding-left:12px;' : ''}">
            <div>
              <strong>${n.title}</strong>
              <p style="color:var(--muted); font-size:12px; margin-top:4px;">${n.message}</p>
              <span class="history-meta">From: ${n.from || 'Admin'} • ${date}</span>
            </div>
            ${!n.read ? '<span class="badge badge-info" style="font-size:10px;">NEW</span>' : ''}
          </div>`;
      });
      container.innerHTML = html;
    }

    // Mark all as read
    const unreadSnap = await db.collection('users').doc(currentUser.uid)
      .collection('notifications').where('read', '==', false).get();
    const batch = db.batch();
    unreadSnap.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();
    updateNotifBadge();
  } catch (err) {
    container.innerHTML = '<p class="error">Error loading notifications.</p>';
    console.error(err);
  }
}

function listenNotifications() {
  if (!currentUser) return;
  db.collection('users').doc(currentUser.uid)
    .collection('notifications').where('read', '==', false)
    .onSnapshot(snap => {
      unreadNotifCount = snap.size;
      const badge = document.getElementById('notifBadge');
      if (badge) {
        badge.textContent = unreadNotifCount;
        badge.style.display = unreadNotifCount > 0 ? 'block' : 'none';
      }
    });
}

// ── Resend verification email ──
async function resendVerificationEmail() {
  try {
    await auth.currentUser.sendEmailVerification();
    alert('Verification email resent.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Logout ──
function logout() {
  auth.signOut();
  window.location.href = 'index.html';
}

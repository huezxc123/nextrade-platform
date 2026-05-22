// ══════════════════════════════════════════
//  NexTrade — dashboard.js
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

const coins = { BTC: { name:'Bitcoin', price:0 }, ETH: { name:'Ethereum', price:0 }, SOL: { name:'Solana', price:0 }, BNB: { name:'BNB', price:0 }, DOGE:{ name:'Dogecoin', price:0 }, ADA: { name:'Cardano', price:0 }, LINK:{ name:'Chainlink', price:0 }, USDT:{ name:'Tether', price:0 } };

// ── Admin settings ──
async function applyAdminSettings() {
  try {
    const snap = await db.collection('adminSettings').doc('platform').get();
    if (!snap.exists) return;
    const s = snap.data();
    if (s.maintenanceMode && currentUser) {
      const role = (await db.collection('users').doc(currentUser.uid).get()).data()?.role;
      if (role !== 'owner' && role !== 'manager') {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#f0f2f8;font-family:Syne,sans-serif;font-size:24px;">🚧 Under maintenance</div>';
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
  } catch (e) { console.error(e); }
}

let currentUser = null;
let userBalance = 0;
let holdings = {};
let isVerified = false;

const balanceDisplay = document.getElementById('balanceDisplay');
const userEmailSpan = document.getElementById('userEmail');
const tradeUnverified = document.getElementById('tradeUnverified');
const tradeContent = document.getElementById('tradeContent');
const holdingsContainer = document.getElementById('holdingsContainer');

// Tab switching
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('topbarTitle').textContent = tab.charAt(0).toUpperCase() + tab.slice(1);
    if (tab === 'referral') loadReferralData();
    if (tab === 'receipts') { loadReceipts(); loadDepositHistory(); loadWithdrawHistory(); }
    if (tab === 'account') loadVerificationStatus();
  });
});

// Auth
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  userEmailSpan.textContent = user.email;
  if (window._setUserUI) window._setUserUI(user.email);
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

async function initializeUserData() {
  const ref = db.collection('users').doc(currentUser.uid);
  const doc = await ref.get();
  if (!doc.exists) {
    await ref.set({ email: currentUser.email, balance: 10000, verified: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    userBalance = 10000;
    isVerified = false;
  } else {
    const data = doc.data();
    userBalance = data.balance || 10000;
    isVerified = data.verified || false;
    if (data.balance === undefined) { await ref.update({ balance: 10000 }); userBalance = 10000; }
  }
  balanceDisplay.textContent = '$' + userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
  toggleTradeAccess();
}
function toggleTradeAccess() {
  if (isVerified) {
    tradeUnverified.style.display = 'none';
    tradeContent.style.display = 'block';
    setTimeout(() => { if (typeof window.initTradeModule === 'function') window.initTradeModule(); }, 200);
  } else {
    tradeUnverified.style.display = 'block';
    tradeContent.style.display = 'none';
  }
}
async function loadHoldings() {
  const snap = await db.collection('users').doc(currentUser.uid).collection('holdings').get();
  holdings = {};
  snap.forEach(doc => holdings[doc.id] = doc.data().quantity);
  renderHoldings();
}
function renderHoldings() {
  if (!holdingsContainer) return;
  if (Object.keys(holdings).length === 0) { holdingsContainer.innerHTML = '<p class="empty-state">No holdings yet.</p>'; return; }
  let html = `<table class="data-table"><thead><tr><th>Asset</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead><tbody>`;
  for (const [sym, qty] of Object.entries(holdings)) {
    const price = coins[sym]?.price || 0;
    html += `<tr><td>${sym}</td><td>${qty.toFixed(6)}</td><td>$${price.toFixed(2)}</td><td>$${(qty*price).toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  holdingsContainer.innerHTML = html;
}

// (Verification, Referral, Receipts, Deposit/Withdraw history, Notifications, etc. – same as previously provided, keep them)
// … I'll include the complete remainder in a separate code block if needed, but you already have it.

function logout() { auth.signOut(); window.location.href = 'index.html'; }

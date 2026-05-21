// ══════════════════════════════════════════
//  NexTrade — dashboard.js
//  Auth, Tabs, Trade, Verification, Referral,
//  Receipts, Deposit History, Withdrawals,
//  REAL‑TIME PRICES (CoinGecko)
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

// ── Coin list with CoinGecko IDs ──
const coins = {
  BTC: { name:'Bitcoin', id:'bitcoin', price:0 },
  ETH: { name:'Ethereum', id:'ethereum', price:0 },
  SOL: { name:'Solana', id:'solana', price:0 },
  BNB: { name:'BNB', id:'binancecoin', price:0 },
  DOGE:{ name:'Dogecoin', id:'dogecoin', price:0 },
  ADA: { name:'Cardano', id:'cardano', price:0 },
  LINK:{ name:'Chainlink', id:'chainlink', price:0 },
  USDT:{ name:'Tether', id:'tether', price:0 }
};

// ── Fetch real‑time prices from CoinGecko ──
async function fetchLivePrices() {
  try {
    const ids = Object.values(coins).map(c => c.id).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    const data = await res.json();
    for (const [sym, obj] of Object.entries(coins)) {
      if (data[obj.id]?.usd) {
        obj.price = data[obj.id].usd;
      }
    }
    // Update UI if visible
    if (document.getElementById('tab-trade').classList.contains('active')) renderHoldings();
    updateEstimatedQty();
  } catch (err) {
    console.warn('Price fetch failed, using last known prices.', err);
  }
}

// Initial fetch, then every 30 seconds
fetchLivePrices();
setInterval(fetchLivePrices, 30000);

let currentUser = null;
let userBalance = 0;
let holdings = {};
let isVerified = false;

// UI elements
const balanceDisplay = document.getElementById('balanceDisplay');
const userEmailSpan = document.getElementById('userEmail');
const tradeUnverified = document.getElementById('tradeUnverified');
const tradeContent = document.getElementById('tradeContent');
const tradeSymbol = document.getElementById('tradeSymbol');
const tradeAmount = document.getElementById('tradeAmount');
const estimatedQty = document.getElementById('estimatedQty');
const buyBtn = document.getElementById('buyBtn');
const sellBtn = document.getElementById('sellBtn');
const holdingsContainer = document.getElementById('holdingsContainer');

// ── Tab switching ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'referral') loadReferralData();
    if (btn.dataset.tab === 'receipts') {
      loadReceipts();
      loadDepositHistory();
      loadWithdrawHistory();
    }
    if (btn.dataset.tab === 'account') loadVerificationStatus();
  });
});

// ── Auth ──
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  userEmailSpan.textContent = user.email;
  await initializeUserData();
  await loadHoldings();
  updateEstimatedQty();
  loadReferralCode();
  loadVerificationStatus();
  loadReferralData();
  loadReceipts();
  loadDepositHistory();
  loadWithdrawHistory();
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
  if (Object.keys(holdings).length === 0) {
    holdingsContainer.innerHTML = '<div class="loading">No holdings yet.</div>';
    return;
  }
  let html = `<table class="holdings-table"><thead><tr><th>Asset</th><th>Quantity</th><th>Price</th><th>Value</th></tr></thead><tbody>`;
  for (const [sym, qty] of Object.entries(holdings)) {
    const price = coins[sym]?.price || 0;
    html += `<tr><td>${sym}</td><td>${qty.toFixed(6)}</td><td>$${price.toFixed(2)}</td><td>$${(qty*price).toFixed(2)}</td></tr>`;
  }
  html += '</tbody></table>';
  holdingsContainer.innerHTML = html;
}

// ── Trade execution ──
async function executeTrade(type) {
  if (!isVerified) return alert('Verification required to trade.');
  const symbol = tradeSymbol.value;
  const amountUSD = parseFloat(tradeAmount.value);
  if (!amountUSD || amountUSD <= 0) return alert('Enter a valid USD amount.');
  const price = coins[symbol]?.price;
  if (!price) return alert('Price not available. Try again.');
  const quantity = amountUSD / price;
  const userRef = db.collection('users').doc(currentUser.uid);
  if (type === 'buy' && userBalance < amountUSD) return alert('Insufficient balance.');
  if (type === 'sell') {
    const currentQty = holdings[symbol] || 0;
    if (currentQty < quantity) return alert('Not enough holdings.');
  }
  const batch = db.batch();
  const newBalance = type === 'buy' ? userBalance - amountUSD : userBalance + amountUSD;
  batch.update(userRef, { balance: newBalance });
  const holdingRef = userRef.collection('holdings').doc(symbol);
  const newQty = type === 'buy' ? (holdings[symbol]||0) + quantity : (holdings[symbol]||0) - quantity;
  if (newQty <= 0) batch.delete(holdingRef);
  else batch.set(holdingRef, { quantity: newQty });
  const tradeRef = userRef.collection('trades').doc();
  batch.set(tradeRef, {
    symbol, type, quantity, price, amount: amountUSD,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  userBalance = newBalance;
  balanceDisplay.textContent = '$' + userBalance.toLocaleString('en-US', { minimumFractionDigits: 2 });
  if (newQty <= 0) delete holdings[symbol];
  else holdings[symbol] = newQty;
  renderHoldings();
  tradeAmount.value = '';
  updateEstimatedQty();
  loadReceipts();
}
buyBtn.addEventListener('click', () => executeTrade('buy'));
sellBtn.addEventListener('click', () => executeTrade('sell'));
function updateEstimatedQty() {
  const amount = parseFloat(tradeAmount.value);
  const price = coins[tradeSymbol.value]?.price;
  if (amount && price) estimatedQty.textContent = `You get ≈ ${(amount/price).toFixed(6)} ${tradeSymbol.value}`;
  else estimatedQty.textContent = '';
}
tradeSymbol.addEventListener('change', updateEstimatedQty);
tradeAmount.addEventListener('input', updateEstimatedQty);

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
        await referrerDoc.ref.update({ balance: (referrerData.balance || 0) + 50 });
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
  if (status === 'verified') statusHTML = '<span class="verification-status status-verified">✅ Verified</span>';
  else if (status === 'pending') statusHTML = '<span class="verification-status status-pending">⏳ Pending Approval</span>';
  else if (status === 'rejected') statusHTML = '<span class="verification-status status-rejected">❌ Rejected</span>';
  else statusHTML = '<span class="verification-status" style="color:var(--muted);">Not submitted</span>';
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
  document.getElementById('referralStats').innerHTML = `Total referrals: ${count} (earning $${count*50} bonus)`;
  let html = '';
  referralsSnapshot.forEach(doc => {
    html += `<div class="history-item"><span>${doc.data().email}</span><span style="color:var(--muted)">${new Date(doc.data().timestamp?.seconds*1000).toLocaleDateString()}</span></div>`;
  });
  document.getElementById('referredList').innerHTML = html || '<div class="loading">No referrals yet.</div>';
}

// ── Trade receipts ──
async function loadReceipts() {
  const snapshot = await db.collection('users').doc(currentUser.uid).collection('trades').orderBy('timestamp','desc').limit(50).get();
  let html = '';
  snapshot.forEach(doc => {
    const t = doc.data();
    const dt = t.timestamp?.toDate().toLocaleString();
    html += `
      <div class="receipt-item">
        <div>
          <strong class="${t.type==='buy'?'trade-buy':'trade-sell'}">${t.type.toUpperCase()}</strong> ${t.quantity.toFixed(6)} ${t.symbol}
          <div style="color:var(--muted); font-size:12px;">${dt}</div>
        </div>
        <div style="text-align:right;">
          <div>$${t.amount.toFixed(2)}</div>
          <div style="font-size:12px; color:var(--muted);">@ $${t.price.toFixed(2)}</div>
        </div>
      </div>`;
  });
  document.getElementById('receiptsContainer').innerHTML = html || '<div class="loading">No trades yet.</div>';
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
    container.innerHTML = '<div class="loading">You have not submitted any receipts.</div>';
    return;
  }
  let html = `
    <table class="holdings-table">
      <thead>
        <tr><th>Asset</th><th>Amount</th><th>TX Hash</th><th>Status</th><th>Date</th></tr>
      </thead>
      <tbody>
  `;
  snapshot.forEach(doc => {
    const d = doc.data();
    const date = d.timestamp?.toDate().toLocaleString();
    html += `
      <tr>
        <td>${d.asset || d.coin || '—'}</td>
        <td>$${d.amount.toFixed(2)}</td>
        <td style="font-family:monospace; font-size:12px;">${d.txHash.slice(0,10)}…</td>
        <td style="color:${d.status==='approved' ? 'var(--success)' : d.status==='rejected' ? 'var(--danger)' : 'var(--accent3)'}">${d.status}</td>
        <td>${date}</td>
      </tr>
    `;
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
    container.innerHTML = '<div class="loading">No withdrawals yet.</div>';
    return;
  }
  let html = `
    <table class="holdings-table">
      <thead>
        <tr><th>Asset</th><th>Amount</th><th>Address</th><th>Status</th><th>Date</th></tr>
      </thead>
      <tbody>
  `;
  snapshot.forEach(doc => {
    const d = doc.data();
    const date = d.timestamp?.toDate().toLocaleString();
    html += `
      <tr>
        <td>${d.asset || '—'}</td>
        <td>$${d.amount.toFixed(2)}</td>
        <td style="font-family:monospace; font-size:12px;">${d.address.slice(0,10)}…</td>
        <td style="color:var(--success)">${d.status || 'completed'}</td>
        <td>${date}</td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Logout ──
function logout() {
  auth.signOut();
  window.location.href = 'index.html';
}
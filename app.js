// ══════════════════════════════════════════
//  NexTrade — app.js
//  Firebase Auth + Firestore + live market
//  Owner detection & admin link
// ══════════════════════════════════════════

// ── YOUR FIREBASE CONFIG ──
const firebaseConfig = {
  apiKey: "AIzaSyCEvGiXfF8xjODvUnuieHQqcnvyide_DUM",
  authDomain: "nextrade-80b98.firebaseapp.com",
  projectId: "nextrade-80b98",
  storageBucket: "nextrade-80b98.firebasestorage.app",
  messagingSenderId: "996607757147",
  appId: "1:996607757147:web:e90f9baa7ca2db876f687e"
};

// Initialize Firebase (compat SDK)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ═══════════════ MARKET DATA (unchanged) ═══════════════
const coins = [
  { sym:'BTC', name:'Bitcoin',  price:77754, change:1.30,  cap:'$1.56T',  color:'#F7931A', bg:'rgba(247,147,26,0.15)' },
  { sym:'ETH', name:'Ethereum', price:2138.47,change:1.18, cap:'$258.3B', color:'#627EEA', bg:'rgba(98,126,234,0.15)' },
  { sym:'SOL', name:'Solana',   price:86.42, change:2.53,  cap:'$49.9B',  color:'#9945FF', bg:'rgba(153,69,255,0.15)' },
  { sym:'BNB', name:'BNB',      price:652.29,change:1.98,  cap:'$87.9B',  color:'#F3BA2F', bg:'rgba(243,186,47,0.15)' },
  { sym:'DOGE',name:'Dogecoin', price:0.1045,change:1.85,  cap:'$16.2B',  color:'#C2A633', bg:'rgba(194,166,51,0.15)' },
  { sym:'ADA', name:'Cardano',  price:0.2506,change:1.20,  cap:'$9.28B',  color:'#0033AD', bg:'rgba(0,51,173,0.2)' },
  { sym:'LINK',name:'Chainlink',price:9.70,  change:2.62,  cap:'$7.05B',  color:'#2A5ADA', bg:'rgba(42,90,218,0.15)' },
  { sym:'USDT',name:'Tether',   price:0.999, change:-0.01, cap:'$189.6B', color:'#26A17B', bg:'rgba(38,161,123,0.15)' },
];

function fmtPrice(p) {
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (p >= 1) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}

// Populate market table
const tbody = document.getElementById('marketBody');
coins.forEach(c => {
  const pos = c.change >= 0;
  const row = document.createElement('tr');
  row.innerHTML = `
    <td>
      <div class="asset-cell">
        <div class="asset-icon" style="background:${c.bg};color:${c.color}">${c.sym.slice(0,2)}</div>
        <div>
          <div class="asset-name">${c.name}</div>
          <div class="asset-sym">${c.sym}</div>
        </div>
      </div>
    </td>
    <td class="price-cell" id="price-${c.sym}">${fmtPrice(c.price)}</td>
    <td class="change-cell ${pos ? 'pos' : 'neg'}">${pos ? '▲' : '▼'} ${Math.abs(c.change).toFixed(2)}%</td>
    <td class="cap-cell">${c.cap}</td>
    <td><button class="trade-btn">Trade →</button></td>
  `;
  tbody.appendChild(row);
});

// Ticker
const tickerEl = document.getElementById('ticker');
const items = [...coins, ...coins].map(c => {
  const pos = c.change >= 0;
  return `<span class="ticker-item"><strong>${c.sym}/USDT</strong><span>${fmtPrice(c.price)}</span><span style="color:${pos ? 'var(--success)':'var(--danger)'}">${pos?'+':''}${c.change.toFixed(2)}%</span></span>`;
}).join('');
tickerEl.innerHTML = items;

// Live price flicker
setInterval(() => {
  coins.forEach(c => {
    c.price *= (1 + (Math.random() - 0.499) * 0.0004);
    const el = document.getElementById('price-' + c.sym);
    if (el) el.textContent = fmtPrice(c.price);
  });
}, 2000);

// ═══════════════ FIREBASE AUTH UI ═══════════════
const modal = document.getElementById('authModal');
const closeModal = document.getElementById('closeAuthModal');
const authTitle = document.getElementById('authTitle');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authActionBtn = document.getElementById('authActionBtn');
const toggleAuthMode = document.getElementById('toggleAuthMode');
const navActions = document.getElementById('navActions');
const heroCta = document.getElementById('heroCta');
const bottomCta = document.getElementById('bottomCta');

let isLoginMode = true;

// Show modal
function openAuthModal(mode = 'login') {
  isLoginMode = mode === 'login';
  authTitle.textContent = isLoginMode ? 'Welcome back' : 'Create your account';
  authActionBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
  toggleAuthMode.innerHTML = isLoginMode
    ? `<span id="toggleAuthMode">Don't have an account? Sign up</span>`
    : `<span id="toggleAuthMode">Already have an account? Log in</span>`;
  modal.classList.add('active');
}

// Close modal
closeModal.addEventListener('click', () => modal.classList.remove('active'));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('active');
});

// Toggle login/signup
toggleAuthMode.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  openAuthModal(isLoginMode ? 'login' : 'signup');
});

// Handle auth
authActionBtn.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return alert('Please enter email and password.');

  try {
    if (isLoginMode) {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
    }
    modal.classList.remove('active');
    authEmail.value = '';
    authPassword.value = '';
  } catch (err) {
    alert(err.message);
  }
});

// Logout
function logout() {
  auth.signOut();
}

// ═══════════════ OWNER DETECTION ═══════════════
auth.onAuthStateChanged(async (user) => {
  const ownerPanel = document.getElementById('ownerPanel');

  if (user) {
    // Fetch user data from Firestore
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    let userData = doc.data();

    // If first login, create the user document (no role set by default)
    if (!doc.exists) {
      await userRef.set({
        email: user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        preferences: { theme: 'dark', notifications: true }
      });
      userData = { email: user.email }; // no role yet
    }

    console.log('User data:', userData);

    // Check if owner
    const isOwner = userData && userData.role === 'owner';

    // Show / hide admin panel link
    if (ownerPanel) {
      ownerPanel.style.display = isOwner ? 'block' : 'none';
    }

    // Update nav bar
    navActions.innerHTML = `
      <div class="user-menu">
        <span class="user-email">${user.email}</span>
        <button class="btn-logout" id="logoutBtn">Logout</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Update CTA buttons
    heroCta.textContent = 'Go to Dashboard';
    heroCta.href = 'dashboard.html';
    bottomCta.textContent = 'Go to Dashboard';
    bottomCta.href = '#';

  } else {
    // Signed out
    if (ownerPanel) ownerPanel.style.display = 'none';

    navActions.innerHTML = `
      <a href="#" class="btn-ghost" id="loginBtn">Log In</a>
      <a href="#" class="btn-primary" id="signupBtn">Get Started</a>
    `;
    document.getElementById('loginBtn').addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('login');
    });
    document.getElementById('signupBtn').addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('signup');
    });

    heroCta.textContent = 'Create Free Account';
    heroCta.href = '#';
    bottomCta.textContent = "Sign Up — It's Free";
    bottomCta.href = '#';
  }
});

// Catch clicks on dynamic login/signup buttons that might appear before auth state resolves
document.addEventListener('click', (e) => {
  if (e.target.id === 'loginBtn') {
    e.preventDefault();
    openAuthModal('login');
  }
  if (e.target.id === 'signupBtn' || e.target.id === 'heroCta' || e.target.id === 'bottomCta') {
    if (!auth.currentUser) {
      e.preventDefault();
      openAuthModal('signup');
    }
  }
});
// ========== Firebase險ｭ螳夲ｼ郁ｦ∝ｷｮ縺玲崛縺茨ｼ・==========
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAbRKR_p-y30ZD5Mq2WLPXPCyT3Zmz1YQw",
  authDomain:        "case-management-2cef3.firebaseapp.com",
  projectId:         "case-management-2cef3",
  storageBucket:     "case-management-2cef3.firebasestorage.app",
  messagingSenderId: "720886451916",
  appId:             "1:720886451916:web:a1d12ca788d9c7383cbc69"
};

// ========== Discord騾夂衍險ｭ螳・==========
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1498458001730699397/HbR3B9kVBNGw-fg91U6Wd-4zfaE2ggZKTgHw5kOV3QEG1RZ-XxLhLAqLO8VOOjmSC1rb';

// ========== Firebase SDK CDN隱ｭ縺ｿ霎ｼ縺ｿ ==========
import { initializeApp }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc,
         addDoc, getDoc, getDocs, updateDoc,
         deleteDoc, query, where, orderBy,
         serverTimestamp, Timestamp }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========== 蛻晄悄蛹・==========
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ========== 迥ｶ諷狗ｮ｡逅・==========
let currentUser    = null;
let currentCaseId  = null;
let currentCaseDoc = null;
let allCases       = [];
let currentFilter  = 'all';
let editingCaseId  = null;
let editingHearingId  = null;
let editingEstimateId = null;
let editingPaymentId  = null;
const statuses = ['蝠上＞蜷医ｏ縺・,'繝偵い繝ｪ繝ｳ繧ｰ','隕狗ｩ堺ｸｭ','謠先｡井ｸｭ','蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・,'螟ｱ豕ｨ'];
let followUpChecked = false;

// ========== Discord騾夂衍 ==========
async function notifyDiscord(message) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (_) { /* silent */ }
}

// ========== 繝輔か繝ｭ繝ｼ繧｢繝・・繝ｪ繝槭う繝ｳ繝繝ｼ ==========
async function checkFollowUpReminders() {
  if (followUpChecked) return;
  followUpChecked = true;
  const today = new Date().toISOString().split('T')[0];
  const targets = allCases.filter(c =>
    c.followUpDate && c.followUpDate <= today &&
    c.status !== '螟ｱ豕ｨ' && c.status !== '邏榊刀貂・
  );
  if (!targets.length) return;
  const lines = targets.map(c =>
    `繝ｻ${c.clientName} / ${c.projectName}・・{c.status}・峨ヵ繧ｩ繝ｭ繝ｼ譛滄剞: ${c.followUpDate}`
  ).join('\n');
  await notifyDiscord(`套 縲舌ヵ繧ｩ繝ｭ繝ｼ繧｢繝・・繝ｪ繝槭う繝ｳ繝繝ｼ縲曾
${lines}`);
}

// ========== 繧ｰ繝ｭ繝ｼ繝舌Ν髢｢謨ｰ縺ｮ蜈ｬ髢・==========
// 繝｢繧ｸ繝･繝ｼ繝ｫ蜀・°繧・window 縺ｫ蜈ｬ髢具ｼ医う繝ｳ繝ｩ繧､繝ｳ繧､繝吶Φ繝医ワ繝ｳ繝峨Λ逕ｨ・噂nconst expose = obj => Object.assign(window, obj);

// ========== 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ ==========
function formatDate(ts) {
  if (!ts) return '窶・;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' });
}

function formatDateTime(ts) {
  if (!ts) return '窶・;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' })
       + ' ' + d.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
}

function formatMoney(n) {
  if (n == null || n === '') return '窶・;
  return 'ﾂ･' + Number(n).toLocaleString('ja-JP');
}

const STATUS_BADGE_CLASS = {
  '蝠上＞蜷医ｏ縺・: 'badge-inquiry',
  '繝偵い繝ｪ繝ｳ繧ｰ': 'badge-hearing',
  '隕狗ｩ堺ｸｭ':    'badge-estimating',
  '謠先｡井ｸｭ':    'badge-proposing',
  '蜿玲ｳｨ遒ｺ螳・:  'badge-won',
  '髢狗匱荳ｭ':    'badge-developing',
  '邏榊刀貂・:    'badge-delivered',
  '螟ｱ豕ｨ':      'badge-lost',
};

function statusBadge(status) {
  const cls = STATUS_BADGE_CLASS[status] || 'badge-inquiry';
  return `<span class="badge ${cls}"><span class="badge-dot"></span>${status}</span>`;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// ========== 逕ｻ髱｢蛻・ｊ譖ｿ縺・==========
function showView(id) {
  ['view-login', 'view-dashboard', 'view-case-detail', 'view-customers', 'view-customer-detail', 'view-ledger'].forEach(v => {
    document.getElementById(v).hidden = (v !== id);
  });
  document.getElementById('app-layout').hidden = (id === 'view-login');
}

function navigateTo(page) {
  if (page === 'dashboard') {
    showView('view-dashboard');
    setActiveNav('nav-dashboard');
    loadCases();
  } else if (page === 'cases') {
    showView('view-dashboard');
    setActiveNav('nav-cases');
    loadCases();
  } else if (page === 'customers') {
    showView('view-customers');
    setActiveNav('nav-customers');
    loadCustomers();
  } else if (page === 'ledger') {
    showView('view-ledger');
    setActiveNav('nav-ledger');
    loadLedger();
  }
  closeSidebar();
}

function setActiveNav(activeId) {
  ['nav-dashboard', 'nav-cases', 'nav-customers', 'nav-ledger'].forEach(id => {
    document.getElementById(id).classList.toggle('active', id === activeId);
  });
}

expose({ navigateTo });

// ========== 繧ｵ繧､繝峨ヰ繝ｼ・医Δ繝舌う繝ｫ・・==========
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}
expose({ toggleSidebar });

// ========== 隱崎ｨｼ ==========
async function handleLogin(e) {
  e.preventDefault();
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-password').value;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> 繝ｭ繧ｰ繧､繝ｳ荳ｭ...';
  errEl.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    const msg = err.code === 'auth/invalid-credential' ? '繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ'
              : err.code === 'auth/too-many-requests'  ? '繝ｭ繧ｰ繧､繝ｳ隧ｦ陦後′螟壹☆縺弱∪縺吶ゅ＠縺ｰ繧峨￥邨後▲縺ｦ縺九ｉ縺願ｩｦ縺励￥縺縺輔＞'
              : `繝ｭ繧ｰ繧､繝ｳ繧ｨ繝ｩ繝ｼ: ${err.message}`;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>繝ｭ繧ｰ繧､繝ｳ`;
  }
}

async function handleLogout() {
  if (!confirm('繝ｭ繧ｰ繧｢繧ｦ繝医＠縺ｾ縺吶°?')) return;
  await signOut(auth);
}

expose({ handleLogin, handleLogout });

onAuthStateChanged(auth, user => {
  showLoading(false);
  if (user) {
    currentUser = user;
    document.getElementById('user-email-display').textContent = user.email;
    const initial = user.email.charAt(0).toUpperCase();
    document.getElementById('user-avatar').textContent = initial;
    showView('view-dashboard');
    setActiveNav('nav-dashboard');
    loadCases();
  } else {
    currentUser = null;
    showView('view-login');
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn').innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>繝ｭ繧ｰ繧､繝ｳ`;
  }
});

// ========== 譯井ｻｶCRUD ==========
async function loadCases() {
  const grid = document.getElementById('cases-grid');
  grid.innerHTML = '<div class="loading-inline" style="padding:40px 0"><div class="spinner-sm"></div> 隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>';
  try {
    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allCases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateDashboardStats();
    renderCases(allCases, currentFilter);
    checkFollowUpReminders();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ: ${err.message}</p></div>`;
  }
}

function updateDashboardStats() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const today = now.toISOString().split('T')[0];

  document.getElementById('stat-total').textContent   = allCases.length;
  document.getElementById('stat-won').textContent     = allCases.filter(c => ['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・].includes(c.status)).length;
  document.getElementById('stat-active').textContent  = allCases.filter(c => ['繝偵い繝ｪ繝ｳ繧ｰ','隕狗ｩ堺ｸｭ','謠先｡井ｸｭ'].includes(c.status)).length;
  document.getElementById('stat-lost').textContent    = allCases.filter(c => {
    if (c.status !== '螟ｱ豕ｨ') return false;
    const d = c.createdAt?.toDate?.() || new Date(0);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  // 繝輔か繝ｭ繝ｼ譛滄剞雜・℃
  const overdueCount = allCases.filter(c =>
    c.followUpDate && c.followUpDate < today && c.status !== '螟ｱ豕ｨ' && c.status !== '邏榊刀貂・
  ).length;
  document.getElementById('stat-overdue').textContent = overdueCount;

  // 蜿玲ｳｨ驥鷹｡榊粋險茨ｼ・stimates 繧ｳ繝ｬ繧ｯ繧ｷ繝ｧ繝ｳ縺九ｉ髱槫酔譛溷叙蠕暦ｼ噂n  loadRevenueStats();
}

async function loadRevenueStats() {
  try {
    const wonIds = allCases
      .filter(c => ['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・].includes(c.status))
      .map(c => c.id);
    if (wonIds.length === 0) {
      document.getElementById('stat-revenue').textContent = 'ﾂ･0';
      return;
    }
    // Firestore 縺ｮ in 繧ｯ繧ｨ繝ｪ縺ｯ10莉ｶ縺ｾ縺ｧ縲・0莉ｶ莉･荳翫・繝舌ャ繝∝・逅・n    let total = 0;
    for (let i = 0; i < wonIds.length; i += 10) {
      const batch = wonIds.slice(i, i + 10);
      const snap = await getDocs(query(collection(db, 'estimates'), where('caseId', 'in', batch)));
      snap.docs.forEach(d => { total += Number(d.data().amount || 0); });
    }
    document.getElementById('stat-revenue').textContent = total > 0
      ? 'ﾂ･' + total.toLocaleString('ja-JP')
      : 'ﾂ･0';
  } catch(err) {
    document.getElementById('stat-revenue').textContent = '蜿門ｾ励お繝ｩ繝ｼ';
  }
}

function renderCaseCard(c) {
  const followHtml = (() => {
    if (!c.followUpDate) return '';
    const today = new Date().toISOString().split('T')[0];
    const overdue = c.followUpDate < today;
    return `<div style="font-size:11px;margin-top:4px;color:${overdue ? 'var(--danger)' : 'var(--primary-light)'}">
      ${overdue ? '笞・・ : '套'} 繝輔か繝ｭ繝ｼ: ${c.followUpDate}
    </div>`;
  })();
  return `
    <div class="case-card" onclick="openCaseDetail('${c.id}')">
      <div class="case-card-header">
        <div>
          <div class="case-client">${esc(c.clientName)}</div>
          <div class="case-name">${esc(c.projectName)}</div>
        </div>
        ${statusBadge(c.status)}
      </div>
      ${c.memo ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.memo)}</div>` : ''}
      ${followHtml}
      <div class="case-card-footer">
        <span class="case-source">${esc(c.source || '窶・)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="case-date">${formatDate(c.createdAt)}</span>
          <select class="status-quick-select" onchange="quickStatusChange('${c.id}', this.value, event)" onclick="event.stopPropagation()" style="font-size:11px;background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);border-radius:4px;padding:2px 4px;cursor:pointer">
            ${statuses.map(s => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
  `;
}

function renderCases(cases, filter) {
  const grid = document.getElementById('cases-grid');
  const filtered = filter === 'all' ? cases : cases.filter(c => c.status === filter);
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>隧ｲ蠖薙☆繧区｡井ｻｶ縺後≠繧翫∪縺帙ｓ</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(renderCaseCard).join('');
}

function filterCases(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
  renderCases(allCases, status);
}

async function quickStatusChange(caseId, newStatus, event) {
  event.stopPropagation();
  try {
    await updateDoc(doc(db, 'cases', caseId), { status: newStatus, updatedAt: serverTimestamp() });
    const idx = allCases.findIndex(c => c.id === caseId);
    if (idx !== -1) allCases[idx].status = newStatus;
    renderCases(allCases, currentFilter);
    toast(`繧ｹ繝・・繧ｿ繧ｹ繧偵・{newStatus}縲阪↓螟画峩縺励∪縺励◆`);
    const c = allCases.find(c => c.id === caseId);
    if (c) notifyDiscord(`売 縲舌せ繝・・繧ｿ繧ｹ螟画峩縲・{c.clientName} / ${c.projectName}・壺・縲・{newStatus}縲港);
  } catch(err) {
    toast(`譖ｴ譁ｰ繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

function searchCases(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    renderCases(allCases, currentFilter);
    return;
  }
  const filtered = allCases.filter(c =>
    (c.clientName || '').toLowerCase().includes(q) ||
    (c.projectName || '').toLowerCase().includes(q)
  );
  const grid = document.getElementById('cases-grid');
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>縲・{esc(query)}縲阪↓荳閾ｴ縺吶ｋ譯井ｻｶ縺後≠繧翫∪縺帙ｓ</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(renderCaseCard).join('');
}

expose({ filterCases, quickStatusChange, searchCases });

// ========== 鬘ｧ螳｢邂｡逅・==========
function loadCustomers() {
  const grid = document.getElementById('customers-grid');
  if (allCases.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>譯井ｻｶ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ</p></div>`;
    return;
  }

  // clientName 縺ｧ繧ｰ繝ｫ繝ｼ繝怜喧
  const map = {};
  allCases.forEach(c => {
    const name = c.clientName || '・域悴險ｭ螳夲ｼ・;
    if (!map[name]) map[name] = { total: 0, active: 0, won: 0, lost: 0, cases: [] };
    map[name].total++;
    if (['蝠上＞蜷医ｏ縺・,'繝偵い繝ｪ繝ｳ繧ｰ','隕狗ｩ堺ｸｭ','謠先｡井ｸｭ'].includes(c.status)) map[name].active++;
    if (['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・].includes(c.status)) map[name].won++;
    if (c.status === '螟ｱ豕ｨ') map[name].lost++;
    map[name].cases.push(c);
  });

  const sorted = Object.entries(map).sort((a, b) => b[1].total - a[1].total);

  grid.innerHTML = sorted.map(([name, d]) => `
    <div class="case-card" onclick="openCustomerDetail('${esc(name)}')">
      <div class="case-card-header">
        <div>
          <div class="case-client">${esc(name)}</div>
          <div class="case-name" style="margin-top:2px;font-size:12px;color:var(--text-3)">邱乗｡井ｻｶ謨ｰ ${d.total} 莉ｶ</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-3);flex-shrink:0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div class="case-card-footer" style="gap:8px;flex-wrap:wrap">
        <span class="case-source" style="color:var(--primary-light)">騾ｲ陦御ｸｭ ${d.active}</span>
        <span class="case-source" style="color:var(--accent)">蜿玲ｳｨ ${d.won}</span>
        <span class="case-source" style="color:var(--danger)">螟ｱ豕ｨ ${d.lost}</span>
      </div>
    </div>
  `).join('');
}

function openCustomerDetail(clientName) {
  const cases = allCases.filter(c => (c.clientName || '・域悴險ｭ螳夲ｼ・) === clientName);
  document.getElementById('customer-detail-name').textContent = clientName;
  document.getElementById('customer-detail-count').textContent = `譯井ｻｶ ${cases.length} 莉ｶ`;

  const grid = document.getElementById('customer-cases-grid');
  if (cases.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>譯井ｻｶ縺後≠繧翫∪縺帙ｓ</p></div>`;
  } else {
    grid.innerHTML = cases.map(c => `
      <div class="case-card" onclick="openCaseDetail('${c.id}')">
        <div class="case-card-header">
          <div>
            <div class="case-client">${esc(c.clientName)}</div>
            <div class="case-name">${esc(c.projectName)}</div>
          </div>
          ${statusBadge(c.status)}
        </div>
        ${c.memo ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.memo)}</div>` : ''}
        <div class="case-card-footer">
          <span class="case-source">${esc(c.source || '窶・)}</span>
          <span class="case-date">${formatDate(c.createdAt)}</span>
        </div>
      </div>
    `).join('');
  }

  showView('view-customer-detail');
  setActiveNav('nav-customers');
}

expose({ openCustomerDetail });

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ========== 譯井ｻｶ繝｢繝ｼ繝繝ｫ ==========
function openNewCaseModal() {
  editingCaseId = null;
  document.getElementById('modal-case-title').textContent = '譁ｰ隕乗｡井ｻｶ繧定ｿｽ蜉';
  document.getElementById('case-client-name').value = '';
  document.getElementById('case-project-name').value = '';
  document.getElementById('case-source').value = 'SNS';
  document.getElementById('case-status').value = '蝠上＞蜷医ｏ縺・;
  document.getElementById('case-memo').value = '';
  document.getElementById('case-follow-up-date').value = '';
  openModal('modal-case');
}

function openEditCaseModal() {
  if (!currentCaseDoc) return;
  editingCaseId = currentCaseId;
  document.getElementById('modal-case-title').textContent = '譯井ｻｶ繧堤ｷｨ髮・;
  document.getElementById('case-client-name').value = currentCaseDoc.clientName || '';
  document.getElementById('case-project-name').value = currentCaseDoc.projectName || '';
  document.getElementById('case-source').value = currentCaseDoc.source || 'SNS';
  document.getElementById('case-status').value = currentCaseDoc.status || '蝠上＞蜷医ｏ縺・;
  document.getElementById('case-memo').value = currentCaseDoc.memo || '';
  document.getElementById('case-follow-up-date').value = currentCaseDoc.followUpDate || '';
  openModal('modal-case');
}

expose({ openNewCaseModal, openEditCaseModal });

async function handleCaseSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('case-submit-btn');
  btn.disabled = true;
  const data = {
    clientName:   document.getElementById('case-client-name').value.trim(),
    projectName:  document.getElementById('case-project-name').value.trim(),
    source:       document.getElementById('case-source').value,
    status:       document.getElementById('case-status').value,
    memo:         document.getElementById('case-memo').value.trim(),
    followUpDate: document.getElementById('case-follow-up-date').value || null,
    updatedAt:    serverTimestamp(),
    createdBy:    currentUser.uid,
  };
  try {
    if (editingCaseId) {
      await updateDoc(doc(db, 'cases', editingCaseId), data);
      toast('譯井ｻｶ繧呈峩譁ｰ縺励∪縺励◆');
      closeModal('modal-case');
      await loadCaseDetail(editingCaseId);
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'cases'), data);
      toast('譯井ｻｶ繧定ｿｽ蜉縺励∪縺励◆');
      notifyDiscord(`・ 縲先眠隕乗｡井ｻｶ縲・{data.clientName} / ${data.projectName}・・{data.status}・荏);
      closeModal('modal-case');
      loadCases();
      openCaseDetail(ref.id);
    }
  } catch (err) {
    toast(`繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

expose({ handleCaseSubmit });

async function handleDeleteCase() {
  if (!currentCaseId) return;
  if (!confirm('縺薙・譯井ｻｶ繧貞炎髯､縺励※繧医ｍ縺励＞縺ｧ縺吶°・歃
髢｢騾｣縺吶ｋ繝偵い繝ｪ繝ｳ繧ｰ繝ｻ隕狗ｩ阪・蜈･驥代ョ繝ｼ繧ｿ繧ょ炎髯､縺輔ｌ縺ｾ縺吶・)) return;
  try {
    showLoading(true);
    // 髢｢騾｣繝峨く繝･繝｡繝ｳ繝医・蜑企勁
    for (const col of ['hearings', 'estimates', 'payments']) {
      const q = query(collection(db, col), where('caseId', '==', currentCaseId));
      const snap = await getDocs(q);
      for (const d of snap.docs) await deleteDoc(d.ref);
    }
    await deleteDoc(doc(db, 'cases', currentCaseId));
    toast('譯井ｻｶ繧貞炎髯､縺励∪縺励◆');
    navigateTo('dashboard');
  } catch (err) {
    toast(`蜑企勁繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

expose({ handleDeleteCase });

// ========== 譯井ｻｶ隧ｳ邏ｰ ==========
async function openCaseDetail(caseId) {
  currentCaseId = caseId;
  switchTab('info', document.querySelector('[data-tab="info"]'));
  showView('view-case-detail');
  setActiveNav('nav-cases');
  await loadCaseDetail(caseId);
}

expose({ openCaseDetail });

async function loadCaseDetail(caseId) {
  try {
    const snap = await getDoc(doc(db, 'cases', caseId));
    if (!snap.exists()) { toast('譯井ｻｶ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ', 'error'); return; }
    currentCaseDoc = snap.data();
    renderCaseDetail(caseId, currentCaseDoc);
  } catch (err) {
    toast(`隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

function renderCaseDetail(id, d) {
  document.getElementById('detail-project-name').textContent = d.projectName || '窶・;
  document.getElementById('detail-client-name').textContent  = d.clientName  || '窶・;
  document.getElementById('detail-status-badge').innerHTML   = statusBadge(d.status);
  document.getElementById('info-client-name').textContent    = d.clientName  || '窶・;
  document.getElementById('info-project-name').textContent   = d.projectName || '窶・;
  document.getElementById('info-source').textContent         = d.source      || '窶・;
  document.getElementById('info-status').innerHTML           = statusBadge(d.status);
  document.getElementById('info-memo').textContent           = d.memo        || '窶・;
  document.getElementById('info-created-at').textContent     = formatDateTime(d.createdAt);
  document.getElementById('info-updated-at').textContent     = formatDateTime(d.updatedAt);
  // 繧ｹ繝・・繧ｿ繧ｹ驕ｸ謚杤n  const statuses = ['蝠上＞蜷医ｏ縺・,'繝偵い繝ｪ繝ｳ繧ｰ','隕狗ｩ堺ｸｭ','謠先｡井ｸｭ','蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・,'螟ｱ豕ｨ'];
  const sel = document.getElementById('status-select');
  sel.innerHTML = statuses.map(s => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${s}</option>`).join('');
  renderDocButtons(id, d);
}

async function handleStatusChange(newStatus) {
  if (!currentCaseId) return;
  try {
    await updateDoc(doc(db, 'cases', currentCaseId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
    currentCaseDoc = { ...currentCaseDoc, status: newStatus };
    document.getElementById('detail-status-badge').innerHTML = statusBadge(newStatus);
    document.getElementById('info-status').innerHTML         = statusBadge(newStatus);
    toast(`繧ｹ繝・・繧ｿ繧ｹ繧偵・{newStatus}縲阪↓螟画峩縺励∪縺励◆`);
    notifyDiscord(`売 縲舌せ繝・・繧ｿ繧ｹ螟画峩縲・{currentCaseDoc.clientName} / ${currentCaseDoc.projectName}・壺・縲・{newStatus}縲港);
    renderDocButtons(currentCaseId, { ...currentCaseDoc, status: newStatus });
    // allCases繧よ峩譁ｰ
    const idx = allCases.findIndex(c => c.id === currentCaseId);
    if (idx !== -1) allCases[idx].status = newStatus;
  } catch (err) {
    toast(`譖ｴ譁ｰ繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

expose({ handleStatusChange });

async function autoDetectStatus() {
  if (!currentCaseId) return;
  try {
    const [hearingSnap, estimateSnap, paymentSnap] = await Promise.all([
      getDocs(query(collection(db, 'hearings'), where('caseId', '==', currentCaseId))),
      getDocs(query(collection(db, 'estimates'), where('caseId', '==', currentCaseId))),
      getDocs(query(collection(db, 'payments'), where('caseId', '==', currentCaseId))),
    ]);

    const hasHearing  = !hearingSnap.empty;
    const hasEstimate = !estimateSnap.empty;
    const hasPayment  = !paymentSnap.empty;

    let suggested = '蝠上＞蜷医ｏ縺・;

    if (hasPayment) {
      const p = paymentSnap.docs[0].data();
      if (p.depositStatus === '蜈･驥第ｸ・ && p.balanceStatus === '蜈･驥第ｸ・) {
        suggested = '邏榊刀貂・;
      } else if (p.devStarted) {
        suggested = '髢狗匱荳ｭ';
      } else {
        suggested = '蜿玲ｳｨ遒ｺ螳・;
      }
    } else if (hasEstimate) {
      const e = estimateSnap.docs[0].data();
      if (e.presidentApproved) {
        suggested = '蜿玲ｳｨ遒ｺ螳・;
      } else if (e.sentAt) {
        suggested = '謠先｡井ｸｭ';
      } else {
        suggested = '隕狗ｩ堺ｸｭ';
      }
    } else if (hasHearing) {
      suggested = '繝偵い繝ｪ繝ｳ繧ｰ';
    }

    const current = currentCaseDoc.status;
    if (suggested === current) {
      toast(`迴ｾ蝨ｨ縺ｮ繧ｹ繝・・繧ｿ繧ｹ縲・{current}縲阪・譌｢縺ｫ譛譁ｰ縺ｧ縺兪);
      return;
    }

    if (confirm(`閾ｪ蜍募愛蛻･邨先棡: 縲・{suggested}縲構
・育樟蝨ｨ: 縲・{current}縲搾ｼ噂
\n繧ｹ繝・・繧ｿ繧ｹ繧貞､画峩縺励∪縺吶°・歔)) {
      await handleStatusChange(suggested);
      document.getElementById('status-select').value = suggested;
    }
  } catch (err) {
    toast(`閾ｪ蜍募愛蛻･繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

expose({ autoDetectStatus });

// ========== 繧ｿ繝門・繧頑崛縺・==========
function switchTab(tabId, el) {
  ['info','hearing','estimate','payment'].forEach(t => {
    document.getElementById(`tab-${t}`).hidden = (t !== tabId);
  });
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  // 繧ｿ繝悶↓蠢懊§縺ｦ繝・・繧ｿ隱ｭ縺ｿ霎ｼ縺ｿ
  if (tabId === 'hearing')  loadHearingData();
  if (tabId === 'estimate') loadEstimateData();
  if (tabId === 'payment')  loadPaymentData();
}

expose({ switchTab });

// ========== 繝偵い繝ｪ繝ｳ繧ｰ ==========
function openHearingModal() {
  editingHearingId = null;
  ['contact-name','email','phone','industry','requirements','current-issues',
   'budget','deadline','target-user','device-target',
   'existing-site','reference-url','design-preference','function-list','contact-history','other-note']
    .forEach(id => { document.getElementById(`h-${id}`).value = ''; });
  ['db-required','auth-required','publicable','continuous-contract']
    .forEach(id => { document.getElementById(`h-${id}`).checked = false; });
  openModal('modal-hearing');
}

expose({ openHearingModal });

async function handleHearingSubmit(e) {
  e.preventDefault();
  const data = {
    caseId:             currentCaseId,
    contactName:        document.getElementById('h-contact-name').value.trim(),
    email:              document.getElementById('h-email').value.trim(),
    phone:              document.getElementById('h-phone').value.trim(),
    industry:           document.getElementById('h-industry').value.trim(),
    requirements:       document.getElementById('h-requirements').value.trim(),
    currentIssues:      document.getElementById('h-current-issues').value.trim(),
    budget:             document.getElementById('h-budget').value.trim(),
    deadline:           document.getElementById('h-deadline').value.trim(),
    targetUser:         document.getElementById('h-target-user').value.trim(),
    deviceTarget:       document.getElementById('h-device-target').value.trim(),
    existingSite:       document.getElementById('h-existing-site').value.trim(),
    referenceUrl:       document.getElementById('h-reference-url').value.trim(),
    designPreference:   document.getElementById('h-design-preference').value.trim(),
    functionList:       document.getElementById('h-function-list').value.trim(),
    dbRequired:         document.getElementById('h-db-required').checked,
    authRequired:       document.getElementById('h-auth-required').checked,
    publicable:         document.getElementById('h-publicable').checked,
    continuousContract: document.getElementById('h-continuous-contract').checked,
    contactHistory:     document.getElementById('h-contact-history').value.trim(),
    otherNote:          document.getElementById('h-other-note').value.trim(),
    updatedAt:          serverTimestamp(),
    createdBy:          currentUser.uid,
  };
  try {
    if (editingHearingId) {
      await updateDoc(doc(db, 'hearings', editingHearingId), data);
      toast('繝偵い繝ｪ繝ｳ繧ｰ繧呈峩譁ｰ縺励∪縺励◆');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'hearings'), data);
      toast('繝偵い繝ｪ繝ｳ繧ｰ繧剃ｿ晏ｭ倥＠縺ｾ縺励◆');
    }
    closeModal('modal-hearing');
    loadHearingData();
  } catch (err) {
    toast(`繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

expose({ handleHearingSubmit });

async function loadHearingData() {
  const container = document.getElementById('hearing-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>';
  try {
    const q = query(collection(db, 'hearings'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>繝偵い繝ｪ繝ｳ繧ｰ險倬鹸縺後≠繧翫∪縺帙ｓ</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = docs.map(h => `
      <div class="detail-main" style="margin-bottom:12px">
        <div class="flex-between" style="margin-bottom:16px">
          <span class="text-muted" style="font-size:12px;font-family:var(--font-mono)">${formatDateTime(h.createdAt)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="editHearing('${h.id}')">邱ｨ髮・/button>
            <button class="btn btn-danger btn-sm" onclick="deleteHearing('${h.id}')">蜑企勁</button>
          </div>
        </div>
        <div class="hearing-grid">
          ${hearingRow('諡・ｽ楢・錐', h.contactName)}
          ${hearingRow('繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ', h.email)}
          ${hearingRow('髮ｻ隧ｱ逡ｪ蜿ｷ', h.phone)}
          ${hearingRow('讌ｭ遞ｮ繝ｻ莠区･ｭ蜀・ｮｹ', h.industry)}
          ${hearingRow('隕∽ｻｶ', h.requirements)}
          ${hearingRow('迴ｾ迥ｶ縺ｮ隱ｲ鬘・, h.currentIssues)}
          ${hearingRow('莠育ｮ・, h.budget)}
          ${hearingRow('蟶梧悍邏肴悄', h.deadline)}
          ${hearingRow('繧ｿ繝ｼ繧ｲ繝・ヨ', h.targetUser)}
          ${hearingRow('蟇ｾ蠢懊ョ繝舌う繧ｹ', h.deviceTarget)}
          ${hearingRow('譌｢蟄倥し繧､繝・, h.existingSite)}
          ${hearingRow('蜿りザRL', h.referenceUrl)}
          ${hearingRow('繝・じ繧､繝ｳ螂ｽ縺ｿ', h.designPreference)}
          ${hearingRow('谺ｲ縺励＞讖溯・', h.functionList)}
          ${hearingRow('蝠上＞蜷医ｏ縺帷ｵ檎ｷｯ', h.contactHistory)}
          ${hearingRow('縺昴・莉門ｙ閠・, h.otherNote)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          ${boolBadge('DB蠢・ｦ・, h.dbRequired)}
          ${boolBadge('隱崎ｨｼ蠢・ｦ・, h.authRequired)}
          ${boolBadge('謗ｲ霈牙庄', h.publicable)}
          ${boolBadge('邯咏ｶ壽э蜷・, h.continuousContract)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ</p></div>`;
  }
}

function hearingRow(label, val) {
  if (!val) return '';
  return `
    <div class="detail-field">
      <div class="detail-field-label">${label}</div>
      <div class="detail-field-value" style="font-size:13px">${esc(val)}</div>
    </div>`;
}

function boolBadge(label, val) {
  if (!val) return '';
  return `<span class="badge badge-won"><span class="badge-dot"></span>${label}</span>`;
}

async function editHearing(id) {
  const snap = await getDoc(doc(db, 'hearings', id));
  if (!snap.exists()) return;
  const h = snap.data();
  editingHearingId = id;
  document.getElementById('h-contact-name').value         = h.contactName    || '';
  document.getElementById('h-email').value                = h.email          || '';
  document.getElementById('h-phone').value                = h.phone          || '';
  document.getElementById('h-industry').value             = h.industry       || '';
  document.getElementById('h-requirements').value         = h.requirements   || '';
  document.getElementById('h-current-issues').value       = h.currentIssues  || '';
  document.getElementById('h-budget').value               = h.budget         || '';
  document.getElementById('h-deadline').value             = h.deadline       || '';
  document.getElementById('h-target-user').value          = h.targetUser     || '';
  document.getElementById('h-device-target').value        = h.deviceTarget   || '';
  document.getElementById('h-existing-site').value        = h.existingSite   || '';
  document.getElementById('h-reference-url').value        = h.referenceUrl   || '';
  document.getElementById('h-design-preference').value    = h.designPreference || '';
  document.getElementById('h-function-list').value        = h.functionList   || '';
  document.getElementById('h-contact-history').value      = h.contactHistory || '';
  document.getElementById('h-other-note').value           = h.otherNote      || '';
  document.getElementById('h-db-required').checked        = !!h.dbRequired;
  document.getElementById('h-auth-required').checked      = !!h.authRequired;
  document.getElementById('h-publicable').checked         = !!h.publicable;
  document.getElementById('h-continuous-contract').checked = !!h.continuousContract;
  openModal('modal-hearing');
}

async function deleteHearing(id) {
  if (!confirm('縺薙・繝偵い繝ｪ繝ｳ繧ｰ險倬鹸繧貞炎髯､縺励∪縺吶°?')) return;
  await deleteDoc(doc(db, 'hearings', id));
  toast('蜑企勁縺励∪縺励◆');
  loadHearingData();
}

expose({ editHearing, deleteHearing });

// ========== 隕狗ｩ阪・謠先｡・==========
function openEstimateModal() {
  editingEstimateId = null;
  document.getElementById('e-plan').value             = 'Starter';
  document.getElementById('e-amount').value           = '';
  document.getElementById('e-sent-at').value          = '';
  document.getElementById('e-president-approved').checked = false;
  document.getElementById('e-note').value             = '';
  openModal('modal-estimate');
}

expose({ openEstimateModal });

async function handleEstimateSubmit(e) {
  e.preventDefault();
  const sentAtVal = document.getElementById('e-sent-at').value;
  const data = {
    caseId:            currentCaseId,
    plan:              document.getElementById('e-plan').value,
    amount:            Number(document.getElementById('e-amount').value) || 0,
    sentAt:            sentAtVal ? Timestamp.fromDate(new Date(sentAtVal)) : null,
    presidentApproved: document.getElementById('e-president-approved').checked,
    note:              document.getElementById('e-note').value.trim(),
    updatedAt:         serverTimestamp(),
    createdBy:         currentUser.uid,
  };
  try {
    if (editingEstimateId) {
      await updateDoc(doc(db, 'estimates', editingEstimateId), data);
      toast('隕狗ｩ阪ｒ譖ｴ譁ｰ縺励∪縺励◆');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'estimates'), data);
      toast('隕狗ｩ阪ｒ菫晏ｭ倥＠縺ｾ縺励◆');
    }
    closeModal('modal-estimate');
    loadEstimateData();
  } catch (err) {
    toast(`繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

expose({ handleEstimateSubmit });

async function loadEstimateData() {
  const container = document.getElementById('estimate-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>';
  try {
    const q = query(collection(db, 'estimates'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>隕狗ｩ阪ョ繝ｼ繧ｿ縺後≠繧翫∪縺帙ｓ</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>繝励Λ繝ｳ</th>
            <th>驥鷹｡・/th>
            <th>謠先｡域嶌騾∽ｻ俶律</th>
            <th>遉ｾ髟ｷ謇ｿ隱・/th>
            <th>蛯呵・/th>
            <th>謫堺ｽ・/th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(e => `
            <tr>
              <td><span class="plan-badge plan-${e.plan?.toLowerCase()}">${esc(e.plan)}</span></td>
              <td class="estimate-amount">${formatMoney(e.amount)}</td>
              <td class="text-mono" style="font-size:12px">${formatDate(e.sentAt)}</td>
              <td>${e.presidentApproved ? '<span class="badge badge-approved">謇ｿ隱肴ｸ・/span>' : '<span class="badge badge-pending">譛ｪ謇ｿ隱・/span>'}</td>
              <td style="font-size:12px;color:var(--text-2)">${esc(e.note || '窶・)}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-secondary btn-sm" onclick="editEstimate('${e.id}')">邱ｨ髮・/button>
                  <button class="btn btn-danger btn-sm" onclick="deleteEstimate('${e.id}')">蜑企勁</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ</p></div>`;
  }
}

async function editEstimate(id) {
  const snap = await getDoc(doc(db, 'estimates', id));
  if (!snap.exists()) return;
  const e = snap.data();
  editingEstimateId = id;
  document.getElementById('e-plan').value             = e.plan || 'Starter';
  document.getElementById('e-amount').value           = e.amount || '';
  document.getElementById('e-sent-at').value          = e.sentAt ? e.sentAt.toDate().toISOString().split('T')[0] : '';
  document.getElementById('e-president-approved').checked = !!e.presidentApproved;
  document.getElementById('e-note').value             = e.note || '';
  openModal('modal-estimate');
}

async function deleteEstimate(id) {
  if (!confirm('縺薙・隕狗ｩ阪ｒ蜑企勁縺励∪縺吶°?')) return;
  await deleteDoc(doc(db, 'estimates', id));
  toast('蜑企勁縺励∪縺励◆');
  loadEstimateData();
}

expose({ editEstimate, deleteEstimate });

// ========== 蜈･驥醍ｮ｡逅・==========
function openPaymentModal() {
  editingPaymentId = null;
  document.getElementById('p-deposit-status').value  = '譛ｪ蜈･驥・;
  document.getElementById('p-deposit-paid-at').value = '';
  document.getElementById('p-balance-status').value  = '譛ｪ蜈･驥・;
  document.getElementById('p-balance-paid-at').value = '';
  document.getElementById('p-dev-started').checked   = false;
  openModal('modal-payment');
}

expose({ openPaymentModal });

async function handlePaymentSubmit(e) {
  e.preventDefault();
  const depositAt = document.getElementById('p-deposit-paid-at').value;
  const balanceAt = document.getElementById('p-balance-paid-at').value;
  const data = {
    caseId:        currentCaseId,
    depositStatus: document.getElementById('p-deposit-status').value,
    depositPaidAt: depositAt ? Timestamp.fromDate(new Date(depositAt)) : null,
    balanceStatus: document.getElementById('p-balance-status').value,
    balancePaidAt: balanceAt ? Timestamp.fromDate(new Date(balanceAt)) : null,
    devStarted:    document.getElementById('p-dev-started').checked,
    updatedAt:     serverTimestamp(),
    createdBy:     currentUser.uid,
  };
  try {
    if (editingPaymentId) {
      await updateDoc(doc(db, 'payments', editingPaymentId), data);
      toast('蜈･驥第ュ蝣ｱ繧呈峩譁ｰ縺励∪縺励◆');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'payments'), data);
      toast('蜈･驥第ュ蝣ｱ繧剃ｿ晏ｭ倥＠縺ｾ縺励◆');
    }
    closeModal('modal-payment');
    loadPaymentData();
  } catch (err) {
    toast(`繧ｨ繝ｩ繝ｼ: ${err.message}`, 'error');
  }
}

expose({ handlePaymentSubmit });

async function loadPaymentData() {
  const container = document.getElementById('payment-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>';
  try {
    const q = query(collection(db, 'payments'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>蜈･驥題ｨ倬鹸縺後≠繧翫∪縺帙ｓ</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = docs.map(p => `
      <div class="detail-main" style="margin-bottom:12px">
        <div class="flex-between" style="margin-bottom:16px">
          <span class="text-muted" style="font-size:12px;font-family:var(--font-mono)">${formatDateTime(p.createdAt)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="editPayment('${p.id}')">邱ｨ髮・/button>
            <button class="btn btn-danger btn-sm" onclick="deletePayment('${p.id}')">蜑企勁</button>
          </div>
        </div>
        <div class="payment-timeline">
          <div class="timeline-item">
            <div class="timeline-dot ${p.depositStatus === '蜈･驥第ｸ・ ? 'done' : ''}"></div>
            <div class="timeline-label">逹謇矩≡・・0%・・/div>
            <div class="timeline-value">${p.depositStatus === '蜈･驥第ｸ・ ? '<span class="badge badge-paid">蜈･驥第ｸ・/span>' : '<span class="badge badge-unpaid">譛ｪ蜈･驥・/span>'}</div>
            ${p.depositPaidAt ? `<div class="timeline-sub">${formatDate(p.depositPaidAt)}</div>` : ''}
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${p.balanceStatus === '蜈･驥第ｸ・ ? 'done' : ''}"></div>
            <div class="timeline-label">谿矩≡・・0%・・/div>
            <div class="timeline-value">${p.balanceStatus === '蜈･驥第ｸ・ ? '<span class="badge badge-paid">蜈･驥第ｸ・/span>' : '<span class="badge badge-unpaid">譛ｪ蜈･驥・/span>'}</div>
            ${p.balancePaidAt ? `<div class="timeline-sub">${formatDate(p.balancePaidAt)}</div>` : ''}
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${p.devStarted ? 'done' : ''}"></div>
            <div class="timeline-label">髢狗匱髢句ｧ・/div>
            <div class="timeline-value">${p.devStarted ? '<span class="badge badge-won">髢句ｧ区ｸ医∩</span>' : '<span class="badge badge-pending">譛ｪ逹謇・/span>'}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ</p></div>`;
  }
}

async function editPayment(id) {
  const snap = await getDoc(doc(db, 'payments', id));
  if (!snap.exists()) return;
  const p = snap.data();
  editingPaymentId = id;
  document.getElementById('p-deposit-status').value  = p.depositStatus || '譛ｪ蜈･驥・;
  document.getElementById('p-deposit-paid-at').value = p.depositPaidAt ? p.depositPaidAt.toDate().toISOString().split('T')[0] : '';
  document.getElementById('p-balance-status').value  = p.balanceStatus || '譛ｪ蜈･驥・;
  document.getElementById('p-balance-paid-at').value = p.balancePaidAt ? p.balancePaidAt.toDate().toISOString().split('T')[0] : '';
  document.getElementById('p-dev-started').checked   = !!p.devStarted;
  openModal('modal-payment');
}

async function deletePayment(id) {
  if (!confirm('縺薙・蜈･驥題ｨ倬鹸繧貞炎髯､縺励∪縺吶°?')) return;
  await deleteDoc(doc(db, 'payments', id));
  toast('蜑企勁縺励∪縺励◆');
  loadPaymentData();
}

expose({ editPayment, deletePayment });

// ========== 譖ｸ鬘槫・蜉・==========
const DOC_OWNER = {
  name: '蟯ｩ譛ｬ蜥瑚ｲｴ',
  title: '繝輔Μ繝ｼ繝ｩ繝ｳ繧ｹWeb繧ｨ繝ｳ繧ｸ繝九い',
  email: 'k.iwamoto.202602@gmail.com',
  website: 'https://kiwamoto202602-a11y.github.io',
};

function todayStr() {
  return new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\//g, '-');
}

function docCss() {
  return `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;font-size:10pt;color:#1a1a1a;background:#f0f2f5}
    @page{size:A4;margin:16mm 14mm}
    @media print{body{background:#fff}.no-print{display:none}}
    .page{width:210mm;min-height:297mm;margin:20px auto;padding:16mm 14mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.13)}
    .doc-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1a3a5c;padding-bottom:10px;margin-bottom:18px}
    .doc-title{font-size:20pt;font-weight:bold;color:#1a3a5c;letter-spacing:.06em}
    .doc-subtitle{font-size:9pt;color:#666;margin-top:3px}
    .issuer{text-align:right;font-size:9pt;color:#444;line-height:1.7}
    .issuer-name{font-size:11pt;font-weight:bold;color:#1a3a5c}
    .section{margin-bottom:14px}
    .section-title{font-size:9.5pt;font-weight:bold;color:#fff;background:#1a3a5c;padding:4px 10px;margin-bottom:7px;border-radius:2px}
    table.data{width:100%;border-collapse:collapse;font-size:9.5pt}
    table.data th{background:#e8edf2;color:#1a3a5c;padding:5px 8px;border:1px solid #b0bec5;text-align:left}
    table.data td{padding:5px 8px;border:1px solid #b0bec5;color:#333}
    table.data tr:nth-child(even) td{background:#f8fafc}
    .field{border-bottom:1.5px solid #90a4ae;padding:4px;min-height:22px;font-size:9.5pt;color:#555}
    .field-box{border:1.5px solid #90a4ae;padding:6px 8px;min-height:52px;font-size:9.5pt;color:#555;border-radius:2px}
    .total-area{display:flex;justify-content:flex-end;margin:8px 0 16px}
    .total-table{border-collapse:collapse;font-size:10pt;min-width:260px}
    .total-table td{padding:6px 12px;border:1px solid #c5cdd5}
    .total-table td:first-child{color:#555;background:#f4f6f8;width:130px}
    .total-table td:last-child{text-align:right;font-weight:bold}
    .total-table .grand td{background:#1a3a5c;color:#fff;font-size:12pt}
    .doc-footer{border-top:1.5px solid #1a3a5c;margin-top:18px;padding-top:8px;font-size:8pt;color:#999;text-align:center}
    .print-btn{position:fixed;top:18px;right:18px;padding:8px 18px;background:#1a3a5c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10pt;z-index:100}
    .print-btn:hover{background:#1565c0}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .info-item{display:flex;flex-direction:column;gap:3px}
    .info-item.full{grid-column:1/-1}
    label{font-size:8pt;font-weight:bold;color:#1a3a5c}
    .badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:8pt;font-weight:bold}
    .badge-must{background:#fce4e4;color:#c62828}
    .badge-want{background:#e3f2fd;color:#1565c0}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .check-group{display:flex;flex-wrap:wrap;gap:6px 14px;padding:6px 8px;border:1.5px solid #90a4ae;border-radius:2px}
    .check-item{display:flex;align-items:center;gap:5px;font-size:9.5pt}
    .cb{width:13px;height:13px;border:1.5px solid #78909c;border-radius:2px;display:inline-block;flex-shrink:0}
    .notes-content{border:1.5px solid #90a4ae;border-radius:2px;padding:7px 9px;font-size:9pt;color:#555;min-height:70px;line-height:1.8}
    .bank-block{border:1.5px solid #1a3a5c;border-radius:3px;padding:10px 12px;margin-bottom:16px}
    .bank-title{font-size:9.5pt;font-weight:bold;color:#1a3a5c;margin-bottom:6px;border-bottom:1px solid #c5cdd5;padding-bottom:4px}
    .bank-grid{display:grid;grid-template-columns:110px 1fr 110px 1fr;gap:4px 8px;font-size:9pt}
    .bank-label{color:#888}.bank-value{color:#333;font-weight:bold}
  `;
}

function issuerBlock() {
  return `<div class="issuer"><div class="issuer-name">${DOC_OWNER.name}</div><div>${DOC_OWNER.title}</div><div>${DOC_OWNER.email}</div><div>${DOC_OWNER.website}</div></div>`;
}

function openDoc(title, body) {
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${docCss()}</style></head><body><button class="print-btn no-print" onclick="window.print()">蜊ｰ蛻ｷ / PDF菫晏ｭ・/button><div class="page">${body}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function dRow(label, value) {
  return `<tr><th style="width:35%">${label}</th><td>${value ?? '縲'}</td></tr>`;
}

const DOC_BUTTONS = [
  { id:'hearing',     label:'繝偵い繝ｪ繝ｳ繧ｰ繧ｷ繝ｼ繝・,  fn:'printHearingSheet',        statuses:['繝偵い繝ｪ繝ｳ繧ｰ','隕狗ｩ堺ｸｭ','謠先｡井ｸｭ','蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'estimate',    label:'隕狗ｩ肴嶌',            fn:'printEstimate',            statuses:['隕狗ｩ堺ｸｭ','謠先｡井ｸｭ','蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'proposal',    label:'謠先｡域嶌',            fn:'printProposal',            statuses:['謠先｡井ｸｭ','蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'contract',    label:'讌ｭ蜍吝ｧ碑ｨ怜･醍ｴ・嶌',    fn:'printContract',            statuses:['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'nda',         label:'NDA',               fn:'printNDA',                 statuses:['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'invoice',     label:'隲区ｱよ嶌',            fn:'printInvoice',             statuses:['蜿玲ｳｨ遒ｺ螳・,'髢狗匱荳ｭ','邏榊刀貂・] },
  { id:'delivery',    label:'邏榊刀遒ｺ隱肴嶌',        fn:'printDelivery',            statuses:['邏榊刀貂・] },
  { id:'maintenance', label:'菫晏ｮ亥･醍ｴ・嶌',        fn:'printMaintenanceContract', statuses:['邏榊刀貂・] },
];

function renderDocButtons(id, d) {
  const card = document.getElementById('doc-buttons-card');
  const list = document.getElementById('doc-buttons-list');
  if (!card || !list) return;
  const btns = DOC_BUTTONS.filter(b => b.statuses.includes(d.status));
  if (!btns.length) { card.hidden = true; return; }
  list.innerHTML = btns.map(b =>
    `<button onclick="window['${b.fn}']('${id}')" style="padding:7px 10px;background:#1a3a5c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:9.5pt;text-align:left">${b.label}</button>`
  ).join('');
  card.hidden = false;
}

async function printHearingSheet(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const hSnap = await getDocs(query(collection(db, 'hearings'), where('caseId','==',caseId)));
  const h = hSnap.empty ? {} : hSnap.docs[0].data();
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">繝偵い繝ｪ繝ｳ繧ｰ繧ｷ繝ｼ繝・/div><div class="doc-subtitle">繧｢繝励Μ髢狗匱 蛻晏屓繝偵い繝ｪ繝ｳ繧ｰ逕ｨ</div></div>
      ${issuerBlock()}
    </div>
    <div class="section"><div class="section-title">1. 蝓ｺ譛ｬ諠・ｱ</div>
      <div class="info-grid">
        <div class="info-item"><label>莨夂､ｾ蜷・/ 螻句捷</label><div class="field">${d.clientName??''}</div></div>
        <div class="info-item"><label>諡・ｽ楢・錐</label><div class="field">${h.contactName??''}</div></div>
        <div class="info-item"><label>繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ</label><div class="field">${h.email??''}</div></div>
        <div class="info-item"><label>髮ｻ隧ｱ逡ｪ蜿ｷ</label><div class="field">${h.phone??''}</div></div>
        <div class="info-item full"><label>讌ｭ遞ｮ / 莠区･ｭ蜀・ｮｹ</label><div class="field">${h.industry??''}</div></div>
      </div>
    </div>
    <div class="section"><div class="section-title">2. 髢狗匱縺励◆縺・い繝励Μ縺ｮ讎りｦ・/div><div class="field-box">${h.requirements??d.projectName??''}</div></div>
    <div class="section"><div class="section-title">3. 迴ｾ迥ｶ縺ｮ隱ｲ鬘後・隗｣豎ｺ縺励◆縺・％縺ｨ</div><div class="field-box">${h.currentIssues??d.memo??''}</div></div>
    <div class="section"><div class="section-title">4. 蟶梧悍讖溯・</div>
      <table class="data"><thead><tr><th style="width:72px">蜆ｪ蜈亥ｺｦ</th><th style="width:38%">讖溯・蜷・/th><th>讎りｦ・/th></tr></thead><tbody>
        ${h.functionList ? `<tr><td>窶・/td><td colspan="2">${h.functionList}</td></tr>` : ''}
      </tbody></table>
    </div>
    <div class="section two-col">
      <div><div class="section-title">5. 蟶梧悍邏肴悄</div><div class="field">${h.deadline??''}</div></div>
      <div><div class="section-title">6. 莠育ｮ玲─</div><div class="field">${h.budget??''}</div></div>
    </div>
    <div class="section"><div class="section-title">7. 縺昴・莉冶ｦ∵悍</div><div class="field-box">${h.otherNote??''}</div></div>
    <div class="doc-footer">譛ｬ繧ｷ繝ｼ繝医・諠・ｱ縺ｯ隕狗ｩ阪・謠先｡医・縺ｿ縺ｫ菴ｿ逕ｨ縺励∪縺吶・/div>`;
  openDoc('繝偵い繝ｪ繝ｳ繧ｰ繧ｷ繝ｼ繝・, body);
}

async function printEstimate(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const eSnap = await getDocs(query(collection(db, 'estimates'), where('caseId','==',caseId)));
  const e = eSnap.empty ? {} : eSnap.docs[0].data();
  const items = e.items || [];
  const subtotal = items.reduce((s,i)=>s+(i.amount||0),0);
  const tax = Math.floor(subtotal * 0.1);
  const grand = subtotal + tax;
  const rows = items.map(i=>`<tr><td>${i.name??''}</td><td style="text-align:center">${i.qty??1}</td><td style="text-align:center">${i.unit??'蠑・}</td><td style="text-align:right">ﾂ･${(i.unitPrice||0).toLocaleString()}</td><td style="text-align:right">ﾂ･${(i.amount||0).toLocaleString()}</td></tr>`).join('');
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">隕九遨阪譖ｸ</div>
        <table style="font-size:9pt;border-collapse:collapse;margin-top:8px">
          <tr><td style="color:#888;width:80px">隕狗ｩ咲分蜿ｷ</td><td style="font-weight:bold">${e.estimateNo??'縲'}</td></tr>
          <tr><td style="color:#888">逋ｺ陦梧律</td><td style="font-weight:bold">${todayStr()}</td></tr>
          <tr><td style="color:#888">譛牙柑譛滄剞</td><td style="font-weight:bold">${e.expiry??'逋ｺ陦梧律繧医ｊ30譌･'}</td></tr>
        </table>
      </div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:20px">
      <div style="font-size:8.5pt;color:#888;margin-bottom:3px">蠕｡隕狗ｩ榊・</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 蠕｡荳ｭ</div>
    </div>
    <div style="font-size:12pt;font-weight:bold;color:#1a3a5c;text-align:center;padding:7px;margin-bottom:16px;border-top:2px solid #1a3a5c;border-bottom:2px solid #1a3a5c">${d.projectName??''} 髢狗匱雋ｻ逕ｨ 蠕｡隕狗ｩ・/div>
    <table class="data" style="margin-bottom:4px">
      <thead><tr><th style="width:42%">蜩∫岼</th><th style="width:10%">謨ｰ驥・/th><th style="width:10%">蜊倅ｽ・/th><th style="width:19%">蜊倅ｾ｡</th><th style="width:19%">驥鷹｡・/th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-area"><table class="total-table">
      <tr><td>蟆剰ｨ茨ｼ育ｨ主挨・・/td><td>ﾂ･${subtotal.toLocaleString()}</td></tr>
      <tr><td>豸郁ｲｻ遞趣ｼ・0%・・/td><td>ﾂ･${tax.toLocaleString()}</td></tr>
      <tr class="grand"><td>蜷郁ｨ茨ｼ育ｨ手ｾｼ・・/td><td>ﾂ･${grand.toLocaleString()}</td></tr>
    </table></div>
    <div class="notes-content">${e.notes??'窶ｻ 譛ｬ隕狗ｩ肴嶌縺ｮ譛牙柑譛滄剞縺ｯ逋ｺ陦梧律繧医ｊ30譌･髢薙〒縺吶・br>窶ｻ 讖溯・霑ｽ蜉繝ｻ莉墓ｧ伜､画峩縺ｯ蛻･騾斐♀隕狗ｩ阪ｊ縺ｨ縺ｪ繧翫∪縺吶・}</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('隕狗ｩ肴嶌', body);
}

async function printProposal(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">謠舌譯医譖ｸ</div><div class="doc-subtitle">${d.projectName??''}</div></div>
      ${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:16px">
      <div style="font-size:8.5pt;color:#888">謠先｡亥・</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 蠕｡荳ｭ</div>
    </div>
    <div class="section"><div class="section-title">1. 謠先｡域ｦりｦ・/div><div class="field-box">${d.memo??''}</div></div>
    <div class="section"><div class="section-title">2. 隗｣豎ｺ縺吶ｋ隱ｲ鬘・/div><div class="field-box"></div></div>
    <div class="section"><div class="section-title">3. 謠先｡亥・螳ｹ繝ｻ讖溯・</div><div class="field-box"></div></div>
    <div class="section"><div class="section-title">4. 繧ｹ繧ｱ繧ｸ繝･繝ｼ繝ｫ</div>
      <table class="data"><thead><tr><th>繝輔ぉ繝ｼ繧ｺ</th><th>蜀・ｮｹ</th><th>譛滄俣</th></tr></thead>
      <tbody><tr><td>Phase 1</td><td>隕∽ｻｶ螳夂ｾｩ繝ｻ險ｭ險・/td><td></td></tr><tr><td>Phase 2</td><td>髢狗匱繝ｻ繝・せ繝・/td><td></td></tr><tr><td>Phase 3</td><td>邏榊刀繝ｻ繧ｵ繝昴・繝・/td><td></td></tr></tbody></table>
    </div>
    <div class="section"><div class="section-title">5. 雋ｻ逕ｨ讎らｮ・/div><div class="field-box"></div></div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('謠先｡域嶌', body);
}

async function printContract(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">讌ｭ蜍吝ｧ碑ｨ怜･醍ｴ・嶌</div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'縲'}・井ｻ･荳九悟ｧ碑ｨ苓・搾ｼ峨→${DOC_OWNER.name}・井ｻ･荳九悟女險苓・搾ｼ峨・縲∽ｻ･荳九・騾壹ｊ讌ｭ蜍吝ｧ碑ｨ怜･醍ｴ・ｒ邱邨舌☆繧九・n    </div>
    <div class="section"><div class="section-title">隨ｬ1譚｡・亥ｧ碑ｨ玲･ｭ蜍呻ｼ・/div><div class="notes-content">${d.projectName??''}縺ｫ菫ゅｋWeb繧ｷ繧ｹ繝・Β縺ｮ髢狗匱讌ｭ蜍・/div></div>
    <div class="section"><div class="section-title">隨ｬ2譚｡・亥･醍ｴ・悄髢難ｼ・/div>
      <table class="data">${dRow('髢句ｧ区律','縲縲縲蟷ｴ縲縲譛医縲譌･')}${dRow('邨ゆｺ・律','縲縲縲蟷ｴ縲縲譛医縲譌･・育ｴ榊刀螳御ｺ・凾・・)}</table>
    </div>
    <div class="section"><div class="section-title">隨ｬ3譚｡・亥ｱ驟ｬ繝ｻ謾ｯ謇輔＞・・/div>
      <table class="data">${dRow('蝣ｱ驟ｬ驥鷹｡・,'驥代縲縲縲縲縲蜀・ｼ育ｨ手ｾｼ・・)}${dRow('謾ｯ謇輔＞譁ｹ豕・,'驫陦梧険霎ｼ')}${dRow('謾ｯ謇輔＞譎よ悄','逹謇矩≡30%・亥･醍ｴ・ｷ邨先凾・会ｼ乗ｮ矩≡70%・育ｴ榊刀螳御ｺ・ｾ・4譌･莉･蜀・ｼ・)}</table>
    </div>
    <div class="section"><div class="section-title">隨ｬ4譚｡・郁送菴懈ｨｩ・・/div><div class="notes-content">譛ｬ讌ｭ蜍吶・謌先棡迚ｩ縺ｫ髢｢縺吶ｋ闡嶺ｽ懈ｨｩ縺ｯ縲∝ｱ驟ｬ縺ｮ謾ｯ謇輔＞螳御ｺ・ｾ後↓蟋碑ｨ苓・↓蟶ｰ螻槭☆繧九・/div></div>
    <div class="section"><div class="section-title">隨ｬ5譚｡・育ｧ伜ｯ・ｿ晄戟・・/div><div class="notes-content">蜿梧婿縺ｯ讌ｭ蜍吩ｸ顔衍繧雁ｾ励◆逶ｸ謇区婿縺ｮ遘伜ｯ・ュ蝣ｱ繧堤ｬｬ荳芽・↓髢狗､ｺ繝ｻ貍乗ｴｩ縺励↑縺・ｂ縺ｮ縺ｨ縺吶ｋ縲・/div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">蟋碑ｨ苓・/div><table class="data">${dRow('莨夂､ｾ蜷・,d.clientName??'')}${dRow('莉｣陦ｨ閠・,'')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">蜿苓ｨ苓・/div><table class="data">${dRow('豌丞錐',DOC_OWNER.name)}${dRow('繝｡繝ｼ繝ｫ',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">邱邨先律・壹縲縲蟷ｴ縲縲譛医縲譌･</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('讌ｭ蜍吝ｧ碑ｨ怜･醍ｴ・嶌', body);
}

async function printNDA(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">遘伜ｯ・ｿ晄戟螂醍ｴ・嶌・・DA・・/div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'縲'}・井ｻ･荳九檎抜縲搾ｼ峨→${DOC_OWNER.name}・井ｻ･荳九御ｹ吶搾ｼ峨・縲∫嶌莠偵・遘伜ｯ・ュ蝣ｱ縺ｮ菫晁ｭｷ繧堤岼逧・→縺励※縲∽ｻ･荳九・騾壹ｊ遘伜ｯ・ｿ晄戟螂醍ｴ・ｒ邱邨舌☆繧九・n    </div>
    <div class="section"><div class="section-title">隨ｬ1譚｡・育ｧ伜ｯ・ュ蝣ｱ縺ｮ螳夂ｾｩ・・/div><div class="notes-content">縲檎ｧ伜ｯ・ュ蝣ｱ縲阪→縺ｯ縲∵悽螂醍ｴ・・逶ｮ逧・・縺溘ａ縺ｫ荳譁ｹ蠖謎ｺ玖・′莉匁婿縺ｫ髢狗､ｺ縺励◆謚陦謎ｸ翫・蝟ｶ讌ｭ荳翫・雋｡蜍吩ｸ翫・諠・ｱ縺ｧ縲・幕遉ｺ譎ゅ↓遘伜ｯ・〒縺ゅｋ譌ｨ譏守､ｺ縺輔ｌ縺溘ｂ縺ｮ繧偵＞縺・・/div></div>
    <div class="section"><div class="section-title">隨ｬ2譚｡・育ｧ伜ｯ・ｿ晄戟鄒ｩ蜍呻ｼ・/div><div class="notes-content">蜷・ｽ謎ｺ玖・・縲∫嶌謇区婿縺ｮ遘伜ｯ・ュ蝣ｱ繧貞宍縺ｫ遘伜ｯ・→縺励※菫晄戟縺励∵嶌髱｢縺ｫ繧医ｋ莠句燕謇ｿ隲ｾ縺ｪ縺励↓隨ｬ荳芽・∈髢狗､ｺ繝ｻ貍乗ｴｩ縺励※縺ｯ縺ｪ繧峨↑縺・・/div></div>
    <div class="section"><div class="section-title">隨ｬ3譚｡・井ｽｿ逕ｨ逶ｮ逧・・蛻ｶ髯撰ｼ・/div><div class="notes-content">遘伜ｯ・ュ蝣ｱ縺ｯ縲・{d.projectName??'譛ｬ莉ｶ讌ｭ蜍・}縺ｮ驕り｡後・縺ｿ縺ｫ菴ｿ逕ｨ縺励√◎繧御ｻ･螟悶・逶ｮ逧・↓菴ｿ逕ｨ縺励↑縺・・/div></div>
    <div class="section"><div class="section-title">隨ｬ4譚｡・亥･醍ｴ・悄髢難ｼ・/div><div class="notes-content">譛ｬ螂醍ｴ・・譛牙柑譛滄俣縺ｯ邱邨先律縺九ｉ2蟷ｴ髢薙→縺吶ｋ縲ゅ◆縺縺励∫ｧ伜ｯ・ｿ晄戟鄒ｩ蜍吶・縺昴・蠕後ｂ蟄倡ｶ壹☆繧九・/div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">逕ｲ</div><table class="data">${dRow('莨夂､ｾ蜷・,d.clientName??'')}${dRow('莉｣陦ｨ閠・錐','')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">荵・/div><table class="data">${dRow('豌丞錐',DOC_OWNER.name)}${dRow('繝｡繝ｼ繝ｫ',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">邱邨先律・壹縲縲蟷ｴ縲縲譛医縲譌･</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('NDA・育ｧ伜ｯ・ｿ晄戟螂醍ｴ・嶌・・, body);
}

async function printInvoice(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const eSnap = await getDocs(query(collection(db, 'estimates'), where('caseId','==',caseId)));
  const e = eSnap.empty ? {} : eSnap.docs[0].data();
  const items = e.items || [];
  const subtotal = items.reduce((s,i)=>s+(i.amount||0),0);
  const tax = Math.floor(subtotal * 0.1);
  const grand = subtotal + tax;
  const rows = items.map(i=>`<tr><td>${i.name??''}</td><td style="text-align:center">${i.qty??1}</td><td style="text-align:center">${i.unit??'蠑・}</td><td style="text-align:right">ﾂ･${(i.unitPrice||0).toLocaleString()}</td><td style="text-align:right">ﾂ･${(i.amount||0).toLocaleString()}</td></tr>`).join('');
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">隲九豎ゅ譖ｸ</div>
        <table style="font-size:9pt;border-collapse:collapse;margin-top:8px">
          <tr><td style="color:#888;width:80px">隲区ｱら分蜿ｷ</td><td style="font-weight:bold">${e.estimateNo??'縲'}</td></tr>
          <tr><td style="color:#888">逋ｺ陦梧律</td><td style="font-weight:bold">${todayStr()}</td></tr>
          <tr><td style="color:#888">謾ｯ謇墓悄髯・/td><td style="font-weight:bold">逋ｺ陦梧律繧医ｊ14譌･莉･蜀・/td></tr>
        </table>
      </div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:20px">
      <div style="font-size:8.5pt;color:#888">隲区ｱょ・</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 蠕｡荳ｭ</div>
    </div>
    <div style="font-size:12pt;font-weight:bold;color:#1a3a5c;text-align:center;padding:7px;margin-bottom:16px;border-top:2px solid #1a3a5c;border-bottom:2px solid #1a3a5c">${d.projectName??''} 髢狗匱雋ｻ逕ｨ 蠕｡隲区ｱ・/div>
    <table class="data" style="margin-bottom:4px">
      <thead><tr><th style="width:42%">蜩∫岼</th><th style="width:10%">謨ｰ驥・/th><th style="width:10%">蜊倅ｽ・/th><th style="width:19%">蜊倅ｾ｡</th><th style="width:19%">驥鷹｡・/th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-area"><table class="total-table">
      <tr><td>蟆剰ｨ茨ｼ育ｨ主挨・・/td><td>ﾂ･${subtotal.toLocaleString()}</td></tr>
      <tr><td>豸郁ｲｻ遞趣ｼ・0%・・/td><td>ﾂ･${tax.toLocaleString()}</td></tr>
      <tr class="grand"><td>蜷郁ｨ茨ｼ育ｨ手ｾｼ・・/td><td>ﾂ･${grand.toLocaleString()}</td></tr>
    </table></div>
    <div class="bank-block"><div class="bank-title">謖ｯ霎ｼ蜈域ュ蝣ｱ</div>
      <div class="bank-grid">
        <div class="bank-label">驥題檮讖滄未蜷・/div><div class="bank-value">縲</div>
        <div class="bank-label">謾ｯ蠎怜錐</div><div class="bank-value">縲</div>
        <div class="bank-label">蜿｣蠎ｧ遞ｮ蛻･</div><div class="bank-value">譎ｮ騾・/div>
        <div class="bank-label">蜿｣蠎ｧ逡ｪ蜿ｷ</div><div class="bank-value">縲</div>
        <div class="bank-label">蜿｣蠎ｧ蜷咲ｾｩ</div><div class="bank-value">繧､繝ｯ繝｢繝・繧ｫ繧ｺ繧ｭ</div>
      </div>
    </div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('隲区ｱよ嶌', body);
}

async function printDelivery(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">邏榊刀遒ｺ隱肴嶌</div></div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:16px">
      <div style="font-size:8.5pt;color:#888">螳帛・</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 蠕｡荳ｭ</div>
    </div>
    <div style="font-size:9.5pt;line-height:1.9;margin-bottom:16px">
      荳玖ｨ倥・騾壹ｊ邏榊刀縺・◆縺励∪縺励◆縺ｮ縺ｧ縲√＃遒ｺ隱阪・縺ｻ縺ｩ繧医ｍ縺励￥縺企｡倥＞縺・◆縺励∪縺吶・n    </div>
    <div class="section"><div class="section-title">邏榊刀蜀・ｮｹ</div>
      <table class="data">
        ${dRow('譯井ｻｶ蜷・,d.projectName??'')}
        ${dRow('邏榊刀迚ｩ','')}
        ${dRow('邏榊刀URL','')}
        ${dRow('邏榊刀譌･',todayStr())}
      </table>
    </div>
    <div class="section"><div class="section-title">蜍穂ｽ懃｢ｺ隱堺ｺ矩・/div>
      <table class="data"><thead><tr><th>遒ｺ隱埼・岼</th><th>邨先棡</th></tr></thead>
      <tbody><tr><td>蝓ｺ譛ｬ讖溯・縺ｮ蜍穂ｽ・/td><td>笆｡ 遒ｺ隱肴ｸ・/td></tr><tr><td>繝悶Λ繧ｦ繧ｶ蜍穂ｽ懃｢ｺ隱・/td><td>笆｡ 遒ｺ隱肴ｸ・/td></tr><tr><td>繧ｹ繝槭・繝医ヵ繧ｩ繝ｳ蟇ｾ蠢・/td><td>笆｡ 遒ｺ隱肴ｸ・/td></tr></tbody></table>
    </div>
    <div class="section"><div class="section-title">蛯呵・/div><div class="field-box">${d.memo??''}</div></div>
    <div style="margin-top:24px;font-size:9pt">
      <div>蜿鈴倡｢ｺ隱咲ｽｲ蜷・ ___________________________縲譌･莉・ ___________</div>
    </div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('邏榊刀遒ｺ隱肴嶌', body);
}

async function printMaintenanceContract(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">菫晏ｮ医・驕狗畑螂醍ｴ・嶌</div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'縲'}・井ｻ･荳九悟ｧ碑ｨ苓・搾ｼ峨→${DOC_OWNER.name}・井ｻ･荳九悟女險苓・搾ｼ峨・縲∽ｻ･荳九・騾壹ｊ菫晏ｮ医・驕狗畑螂醍ｴ・ｒ邱邨舌☆繧九・n    </div>
    <div class="section"><div class="section-title">隨ｬ1譚｡・亥ｯｾ雎｡繧ｷ繧ｹ繝・Β・・/div>
      <table class="data">${dRow('繧ｷ繧ｹ繝・Β蜷・,d.projectName??'')}${dRow('URL','')}</table>
    </div>
    <div class="section"><div class="section-title">隨ｬ2譚｡・井ｿ晏ｮ域･ｭ蜍吶・蜀・ｮｹ・・/div>
      <table class="data">
        <thead><tr><th>鬆・岼</th><th>蜀・ｮｹ</th></tr></thead>
        <tbody>
          <tr><td>髫懷ｮｳ蟇ｾ蠢・/td><td>蟷ｳ譌･10:00縲・8:00 / 邱頑･譎ゅ・髫乗凾蟇ｾ蠢・/td></tr>
          <tr><td>譛域ｬ｡蝣ｱ蜻・/td><td>遞ｼ蜒咲憾豕√・繧｢繧ｯ繧ｻ繧ｹ謨ｰ繝ｻ繧ｨ繝ｩ繝ｼ繝ｭ繧ｰ蝣ｱ蜻・/td></tr>
          <tr><td>霆ｽ蠕ｮ縺ｪ謾ｹ菫ｮ</td><td>譛遺雷譎る俣縺ｾ縺ｧ霑ｽ蜉雋ｻ逕ｨ縺ｪ縺・/td></tr>
          <tr><td>繧ｻ繧ｭ繝･繝ｪ繝・ぅ</td><td>螳壽悄逧・↑繝ｩ繧､繝悶Λ繝ｪ繧｢繝・・繝・・繝亥ｯｾ蠢・/td></tr>
        </tbody>
      </table>
    </div>
    <div class="section"><div class="section-title">隨ｬ3譚｡・亥･醍ｴ・悄髢薙・譁咎≡・・/div>
      <table class="data">
        ${dRow('螂醍ｴ・幕蟋区律','縲縲縲蟷ｴ縲縲譛医縲譌･')}
        ${dRow('譛磯｡崎ｲｻ逕ｨ','驥代縲縲縲縲蜀・ｼ育ｨ手ｾｼ・・)}
        ${dRow('謾ｯ謇輔＞','豈取怦譛ｫ譌･邱繧√・鄙梧怦譛ｫ譌･謇輔＞')}
      </table>
    </div>
    <div class="section"><div class="section-title">隨ｬ4譚｡・郁ｧ｣邏・ｼ・/div><div class="notes-content">縺・★繧後・蠖謎ｺ玖・ｂ1繝ｶ譛亥燕縺ｮ譖ｸ髱｢騾夂衍縺ｫ繧医ｊ隗｣邏・〒縺阪ｋ縲・/div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">蟋碑ｨ苓・/div><table class="data">${dRow('莨夂､ｾ蜷・,d.clientName??'')}${dRow('莉｣陦ｨ閠・,'')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">蜿苓ｨ苓・/div><table class="data">${dRow('豌丞錐',DOC_OWNER.name)}${dRow('繝｡繝ｼ繝ｫ',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">邱邨先律・壹縲縲蟷ｴ縲縲譛医縲譌･</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('菫晏ｮ医・驕狗畑螂醍ｴ・嶌', body);
}

expose({ renderDocButtons, printHearingSheet, printEstimate, printProposal, printContract, printNDA, printInvoice, printDelivery, printMaintenanceContract });

// ========== 繝｢繝ｼ繝繝ｫ蜈ｱ騾・==========
function openModal(id) {
  document.getElementById(id).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  document.body.style.overflow = '';
}

expose({ openModal, closeModal });

// Esc繧ｭ繝ｼ縺ｧ繝｢繝ｼ繝繝ｫ繧帝哩縺倥ｋ
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-case','modal-hearing','modal-estimate','modal-payment','modal-client','modal-invoice']
      .forEach(id => { if (!document.getElementById(id).hidden) closeModal(id); });
  }
});

// ========== 襍ｷ蜍・==========
// onAuthStateChanged 縺悟ｮ御ｺ・☆繧九∪縺ｧ繝ｭ繝ｼ繝・ぅ繝ｳ繧ｰ繧定｡ｨ遉ｺ
// ============================================================
// クライアント台帳
// ============================================================

let currentClientId = null;
let currentClientDoc = null;
let editingClientId = null;
let editingInvoiceId = null;

async function loadLedger() {
  const snap = await getDocs(query(collection(db, 'clients'), orderBy('name')));
  const clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderClientList(clients);
  document.getElementById('ledger-detail').hidden = true;
}

function renderClientList(clients) {
  const tbody = document.getElementById('ledger-client-tbody');
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px">クライアントなし</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => `
    <tr onclick="openClientDetail('${esc(c.id)}')" style="cursor:pointer">
      <td>${esc(c.name)}</td>
      <td>${c.monthlyFee ? formatMoney(c.monthlyFee) : '―'}</td>
      <td>${(c.services||[]).join(', ') || '―'}</td>
      <td><button onclick="event.stopPropagation();openClientDetail('${esc(c.id)}')" class="btn-sm">詳細</button></td>
    </tr>
  `).join('');
}

async function openClientDetail(clientId) {
  currentClientId = clientId;
  const snap = await getDoc(doc(db, 'clients', clientId));
  if (!snap.exists()) return;
  currentClientDoc = { id: snap.id, ...snap.data() };

  document.getElementById('ledger-detail').hidden = false;
  document.getElementById('ledger-client-name-display').textContent = currentClientDoc.name;
  document.getElementById('ledger-client-monthly').textContent = currentClientDoc.monthlyFee ? formatMoney(currentClientDoc.monthlyFee) : '―';
  document.getElementById('ledger-client-services').textContent = (currentClientDoc.services||[]).join(' / ') || '―';
  document.getElementById('ledger-client-memo').textContent = currentClientDoc.memo || '';

  loadInvoices();
}

async function loadInvoices() {
  const snap = await getDocs(query(collection(db, 'invoices'), where('clientId', '==', currentClientId), orderBy('issueDate', 'desc')));
  const invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderInvoices(invoices);
}

function invoiceStatusBadge(status) {
  const map = { '未払い': 'background:#fee2e2;color:#dc2626', '部分支払': 'background:#fef9c3;color:#854d0e', '支払済': 'background:#dcfce7;color:#166534' };
  return `<span style="font-size:11px;padding:2px 8px;border-radius:10px;${map[status]||''}">${esc(status)}</span>`;
}

function renderInvoices(invoices) {
  const tbody = document.getElementById('ledger-invoice-tbody');
  if (!invoices.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px">請求書なし</td></tr>';
    return;
  }
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td>${esc(inv.invoiceNo||'―')}</td>
      <td>${formatMoney(inv.amount||0)}</td>
      <td>${inv.issueDate||'―'}</td>
      <td>${inv.dueDate||'―'}</td>
      <td>${invoiceStatusBadge(inv.status||'未払い')}</td>
      <td>
        <button onclick="openEditInvoiceModal('${esc(inv.id)}')" class="btn-sm">編集</button>
        <button onclick="deleteInvoice('${esc(inv.id)}')" class="btn-sm btn-danger">削除</button>
      </td>
    </tr>
  `).join('');
}

function openNewClientModal() {
  editingClientId = null;
  document.getElementById('client-modal-title').textContent = '新規クライアント';
  document.getElementById('form-client').reset();
  openModal('modal-client');
}

function openEditClientModal() {
  if (!currentClientDoc) return;
  editingClientId = currentClientId;
  document.getElementById('client-modal-title').textContent = 'クライアント編集';
  document.getElementById('client-name').value = currentClientDoc.name||'';
  document.getElementById('client-monthly-fee').value = currentClientDoc.monthlyFee||'';
  document.getElementById('client-services').value = (currentClientDoc.services||[]).join(', ');
  document.getElementById('client-memo').value = currentClientDoc.memo||'';
  openModal('modal-client');
}

async function handleClientSubmit(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('client-name').value.trim(),
    monthlyFee: Number(document.getElementById('client-monthly-fee').value)||0,
    services: document.getElementById('client-services').value.split(',').map(s=>s.trim()).filter(Boolean),
    memo: document.getElementById('client-memo').value.trim(),
    updatedAt: serverTimestamp(),
    createdBy: currentUser.uid,
  };
  if (editingClientId) {
    await updateDoc(doc(db, 'clients', editingClientId), data);
    closeModal('modal-client');
    openClientDetail(editingClientId);
  } else {
    data.createdAt = serverTimestamp();
    await addDoc(collection(db, 'clients'), data);
    closeModal('modal-client');
    loadLedger();
  }
  toast('保存しました', 'success');
}

function openNewInvoiceModal() {
  if (!currentClientId) return;
  editingInvoiceId = null;
  document.getElementById('invoice-modal-title').textContent = '請求書追加';
  document.getElementById('form-invoice').reset();
  document.getElementById('invoice-client-id').value = currentClientId;
  openModal('modal-invoice');
}

async function openEditInvoiceModal(invoiceId) {
  editingInvoiceId = invoiceId;
  const snap = await getDoc(doc(db, 'invoices', invoiceId));
  if (!snap.exists()) return;
  const inv = snap.data();
  document.getElementById('invoice-modal-title').textContent = '請求書編集';
  document.getElementById('invoice-client-id').value = currentClientId;
  document.getElementById('invoice-no').value = inv.invoiceNo||'';
  document.getElementById('invoice-amount').value = inv.amount||'';
  document.getElementById('invoice-paid-amount').value = inv.paidAmount||'';
  document.getElementById('invoice-issue-date').value = inv.issueDate||'';
  document.getElementById('invoice-due-date').value = inv.dueDate||'';
  document.getElementById('invoice-status').value = inv.status||'未払い';
  document.getElementById('invoice-memo').value = inv.memo||'';
  openModal('modal-invoice');
}

async function handleInvoiceSubmit(e) {
  e.preventDefault();
  const data = {
    clientId: document.getElementById('invoice-client-id').value,
    clientName: currentClientDoc ? currentClientDoc.name : '',
    invoiceNo: document.getElementById('invoice-no').value.trim(),
    amount: Number(document.getElementById('invoice-amount').value)||0,
    paidAmount: Number(document.getElementById('invoice-paid-amount').value)||0,
    issueDate: document.getElementById('invoice-issue-date').value||null,
    dueDate: document.getElementById('invoice-due-date').value||null,
    status: document.getElementById('invoice-status').value,
    memo: document.getElementById('invoice-memo').value.trim(),
    updatedAt: serverTimestamp(),
    createdBy: currentUser.uid,
  };
  if (editingInvoiceId) {
    await updateDoc(doc(db, 'invoices', editingInvoiceId), data);
    closeModal('modal-invoice');
  } else {
    data.createdAt = serverTimestamp();
    await addDoc(collection(db, 'invoices'), data);
    closeModal('modal-invoice');
  }
  toast('保存しました', 'success');
  loadInvoices();
}

async function deleteInvoice(invoiceId) {
  if (!confirm('この請求書を削除しますか？')) return;
  await deleteDoc(doc(db, 'invoices', invoiceId));
  toast('削除しました', 'success');
  loadInvoices();
}

async function deleteClient() {
  if (!currentClientId) return;
  if (!confirm(`「${currentClientDoc ? currentClientDoc.name : ''}」を削除しますか？関連する請求書も削除されます。`)) return;
  const snap = await getDocs(query(collection(db, 'invoices'), where('clientId', '==', currentClientId)));
  for (const d of snap.docs) await deleteDoc(d.ref);
  await deleteDoc(doc(db, 'clients', currentClientId));
  currentClientId = null;
  currentClientDoc = null;
  document.getElementById('ledger-detail').hidden = true;
  toast('削除しました', 'success');
  loadLedger();
}

expose({ loadLedger, openNewClientModal, openEditClientModal, handleClientSubmit, openNewInvoiceModal, openEditInvoiceModal, handleInvoiceSubmit, deleteInvoice, deleteClient, openClientDetail, loadInvoices });

showLoading(true);

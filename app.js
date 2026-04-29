// ========== Firebase設定（要差し替え） ==========
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAbRKR_p-y30ZD5Mq2WLPXPCyT3Zmz1YQw",
  authDomain:        "case-management-2cef3.firebaseapp.com",
  projectId:         "case-management-2cef3",
  storageBucket:     "case-management-2cef3.firebasestorage.app",
  messagingSenderId: "720886451916",
  appId:             "1:720886451916:web:a1d12ca788d9c7383cbc69"
};

// ========== Discord通知設定 ==========
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1498458001730699397/HbR3B9kVBNGw-fg91U6Wd-4zfaE2ggZKTgHw5kOV3QEG1RZ-XxLhLAqLO8VOOjmSC1rb';

// ========== Firebase SDK CDN読み込み ==========
import { initializeApp }                         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword,
         signOut, onAuthStateChanged }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc,
         addDoc, getDoc, getDocs, updateDoc,
         deleteDoc, query, where, orderBy,
         serverTimestamp, Timestamp }             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========== 初期化 ==========
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ========== 状態管理 ==========
let currentUser    = null;
let currentCaseId  = null;
let currentCaseDoc = null;
let allCases       = [];
let currentFilter  = 'all';
let editingCaseId  = null;
let editingHearingId  = null;
let editingEstimateId = null;
let editingPaymentId  = null;
const statuses = ['問い合わせ','ヒアリング','見積中','提案中','受注確定','開発中','納品済','失注'];
let followUpChecked = false;

// ========== Discord通知 ==========
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

// ========== フォローアップリマインダー ==========
async function checkFollowUpReminders() {
  if (followUpChecked) return;
  followUpChecked = true;
  const today = new Date().toISOString().split('T')[0];
  const targets = allCases.filter(c =>
    c.followUpDate && c.followUpDate <= today &&
    c.status !== '失注' && c.status !== '納品済'
  );
  if (!targets.length) return;
  const lines = targets.map(c =>
    `・${c.clientName} / ${c.projectName}（${c.status}）フォロー期限: ${c.followUpDate}`
  ).join('\n');
  await notifyDiscord(`📅 【フォローアップリマインダー】\n${lines}`);
}

// ========== グローバル関数の公開 ==========
// モジュール内から window に公開（インラインイベントハンドラ用）
const expose = obj => Object.assign(window, obj);

// ========== ユーティリティ ==========
function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' });
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' })
       + ' ' + d.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
}

function formatMoney(n) {
  if (n == null || n === '') return '—';
  return '¥' + Number(n).toLocaleString('ja-JP');
}

const STATUS_BADGE_CLASS = {
  '問い合わせ': 'badge-inquiry',
  'ヒアリング': 'badge-hearing',
  '見積中':    'badge-estimating',
  '提案中':    'badge-proposing',
  '受注確定':  'badge-won',
  '開発中':    'badge-developing',
  '納品済':    'badge-delivered',
  '失注':      'badge-lost',
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

// ========== 画面切り替え ==========
function showView(id) {
  ['view-login', 'view-dashboard', 'view-case-detail', 'view-customers', 'view-customer-detail'].forEach(v => {
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
  }
  closeSidebar();
}

function setActiveNav(activeId) {
  ['nav-dashboard', 'nav-cases', 'nav-customers'].forEach(id => {
    document.getElementById(id).classList.toggle('active', id === activeId);
  });
}

expose({ navigateTo });

// ========== サイドバー（モバイル） ==========
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}
expose({ toggleSidebar });

// ========== 認証 ==========
async function handleLogin(e) {
  e.preventDefault();
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-password').value;
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner-sm"></div> ログイン中...';
  errEl.style.display = 'none';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    const msg = err.code === 'auth/invalid-credential' ? 'メールアドレスまたはパスワードが正しくありません'
              : err.code === 'auth/too-many-requests'  ? 'ログイン試行が多すぎます。しばらく経ってからお試しください'
              : `ログインエラー: ${err.message}`;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>ログイン`;
  }
}

async function handleLogout() {
  if (!confirm('ログアウトしますか?')) return;
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
    document.getElementById('login-btn').innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>ログイン`;
  }
});

// ========== 案件CRUD ==========
async function loadCases() {
  const grid = document.getElementById('cases-grid');
  grid.innerHTML = '<div class="loading-inline" style="padding:40px 0"><div class="spinner-sm"></div> 読み込み中...</div>';
  try {
    const q = query(collection(db, 'cases'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    allCases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateDashboardStats();
    renderCases(allCases, currentFilter);
    checkFollowUpReminders();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">読み込みエラー: ${err.message}</p></div>`;
  }
}

function updateDashboardStats() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  const today = now.toISOString().split('T')[0];

  document.getElementById('stat-total').textContent   = allCases.length;
  document.getElementById('stat-won').textContent     = allCases.filter(c => ['受注確定','開発中','納品済'].includes(c.status)).length;
  document.getElementById('stat-active').textContent  = allCases.filter(c => ['ヒアリング','見積中','提案中'].includes(c.status)).length;
  document.getElementById('stat-lost').textContent    = allCases.filter(c => {
    if (c.status !== '失注') return false;
    const d = c.createdAt?.toDate?.() || new Date(0);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;

  // フォロー期限超過
  const overdueCount = allCases.filter(c =>
    c.followUpDate && c.followUpDate < today && c.status !== '失注' && c.status !== '納品済'
  ).length;
  document.getElementById('stat-overdue').textContent = overdueCount;

  // 受注金額合計（estimates コレクションから非同期取得）
  loadRevenueStats();
}

async function loadRevenueStats() {
  try {
    const wonIds = allCases
      .filter(c => ['受注確定','開発中','納品済'].includes(c.status))
      .map(c => c.id);
    if (wonIds.length === 0) {
      document.getElementById('stat-revenue').textContent = '¥0';
      return;
    }
    // Firestore の in クエリは10件まで。10件以上はバッチ処理
    let total = 0;
    for (let i = 0; i < wonIds.length; i += 10) {
      const batch = wonIds.slice(i, i + 10);
      const snap = await getDocs(query(collection(db, 'estimates'), where('caseId', 'in', batch)));
      snap.docs.forEach(d => { total += Number(d.data().amount || 0); });
    }
    document.getElementById('stat-revenue').textContent = total > 0
      ? '¥' + total.toLocaleString('ja-JP')
      : '¥0';
  } catch(err) {
    document.getElementById('stat-revenue').textContent = '取得エラー';
  }
}

function renderCaseCard(c) {
  const followHtml = (() => {
    if (!c.followUpDate) return '';
    const today = new Date().toISOString().split('T')[0];
    const overdue = c.followUpDate < today;
    return `<div style="font-size:11px;margin-top:4px;color:${overdue ? 'var(--danger)' : 'var(--primary-light)'}">
      ${overdue ? '⚠️' : '📅'} フォロー: ${c.followUpDate}
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
        <span class="case-source">${esc(c.source || '—')}</span>
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
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>該当する案件がありません</p></div>`;
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
    toast(`ステータスを「${newStatus}」に変更しました`);
    const c = allCases.find(c => c.id === caseId);
    if (c) notifyDiscord(`🔄 【ステータス変更】${c.clientName} / ${c.projectName}：→「${newStatus}」`);
  } catch(err) {
    toast(`更新エラー: ${err.message}`, 'error');
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
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>「${esc(query)}」に一致する案件がありません</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(renderCaseCard).join('');
}

expose({ filterCases, quickStatusChange, searchCases });

// ========== 顧客管理 ==========
function loadCustomers() {
  const grid = document.getElementById('customers-grid');
  if (allCases.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>案件データがありません</p></div>`;
    return;
  }

  // clientName でグループ化
  const map = {};
  allCases.forEach(c => {
    const name = c.clientName || '（未設定）';
    if (!map[name]) map[name] = { total: 0, active: 0, won: 0, lost: 0, cases: [] };
    map[name].total++;
    if (['問い合わせ','ヒアリング','見積中','提案中'].includes(c.status)) map[name].active++;
    if (['受注確定','開発中','納品済'].includes(c.status)) map[name].won++;
    if (c.status === '失注') map[name].lost++;
    map[name].cases.push(c);
  });

  const sorted = Object.entries(map).sort((a, b) => b[1].total - a[1].total);

  grid.innerHTML = sorted.map(([name, d]) => `
    <div class="case-card" onclick="openCustomerDetail('${esc(name)}')">
      <div class="case-card-header">
        <div>
          <div class="case-client">${esc(name)}</div>
          <div class="case-name" style="margin-top:2px;font-size:12px;color:var(--text-3)">総案件数 ${d.total} 件</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-3);flex-shrink:0">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
      <div class="case-card-footer" style="gap:8px;flex-wrap:wrap">
        <span class="case-source" style="color:var(--primary-light)">進行中 ${d.active}</span>
        <span class="case-source" style="color:var(--accent)">受注 ${d.won}</span>
        <span class="case-source" style="color:var(--danger)">失注 ${d.lost}</span>
      </div>
    </div>
  `).join('');
}

function openCustomerDetail(clientName) {
  const cases = allCases.filter(c => (c.clientName || '（未設定）') === clientName);
  document.getElementById('customer-detail-name').textContent = clientName;
  document.getElementById('customer-detail-count').textContent = `案件 ${cases.length} 件`;

  const grid = document.getElementById('customer-cases-grid');
  if (cases.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>案件がありません</p></div>`;
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
          <span class="case-source">${esc(c.source || '—')}</span>
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

// ========== 案件モーダル ==========
function openNewCaseModal() {
  editingCaseId = null;
  document.getElementById('modal-case-title').textContent = '新規案件を追加';
  document.getElementById('case-client-name').value = '';
  document.getElementById('case-project-name').value = '';
  document.getElementById('case-source').value = 'SNS';
  document.getElementById('case-status').value = '問い合わせ';
  document.getElementById('case-memo').value = '';
  document.getElementById('case-follow-up-date').value = '';
  openModal('modal-case');
}

function openEditCaseModal() {
  if (!currentCaseDoc) return;
  editingCaseId = currentCaseId;
  document.getElementById('modal-case-title').textContent = '案件を編集';
  document.getElementById('case-client-name').value = currentCaseDoc.clientName || '';
  document.getElementById('case-project-name').value = currentCaseDoc.projectName || '';
  document.getElementById('case-source').value = currentCaseDoc.source || 'SNS';
  document.getElementById('case-status').value = currentCaseDoc.status || '問い合わせ';
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
      toast('案件を更新しました');
      closeModal('modal-case');
      await loadCaseDetail(editingCaseId);
    } else {
      data.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, 'cases'), data);
      toast('案件を追加しました');
      notifyDiscord(`🆕 【新規案件】${data.clientName} / ${data.projectName}（${data.status}）`);
      closeModal('modal-case');
      loadCases();
      openCaseDetail(ref.id);
    }
  } catch (err) {
    toast(`エラー: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

expose({ handleCaseSubmit });

async function handleDeleteCase() {
  if (!currentCaseId) return;
  if (!confirm('この案件を削除してよろしいですか？\n関連するヒアリング・見積・入金データも削除されます。')) return;
  try {
    showLoading(true);
    // 関連ドキュメントの削除
    for (const col of ['hearings', 'estimates', 'payments']) {
      const q = query(collection(db, col), where('caseId', '==', currentCaseId));
      const snap = await getDocs(q);
      for (const d of snap.docs) await deleteDoc(d.ref);
    }
    await deleteDoc(doc(db, 'cases', currentCaseId));
    toast('案件を削除しました');
    navigateTo('dashboard');
  } catch (err) {
    toast(`削除エラー: ${err.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

expose({ handleDeleteCase });

// ========== 案件詳細 ==========
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
    if (!snap.exists()) { toast('案件が見つかりません', 'error'); return; }
    currentCaseDoc = snap.data();
    renderCaseDetail(caseId, currentCaseDoc);
  } catch (err) {
    toast(`読み込みエラー: ${err.message}`, 'error');
  }
}

function renderCaseDetail(id, d) {
  document.getElementById('detail-project-name').textContent = d.projectName || '—';
  document.getElementById('detail-client-name').textContent  = d.clientName  || '—';
  document.getElementById('detail-status-badge').innerHTML   = statusBadge(d.status);
  document.getElementById('info-client-name').textContent    = d.clientName  || '—';
  document.getElementById('info-project-name').textContent   = d.projectName || '—';
  document.getElementById('info-source').textContent         = d.source      || '—';
  document.getElementById('info-status').innerHTML           = statusBadge(d.status);
  document.getElementById('info-memo').textContent           = d.memo        || '—';
  document.getElementById('info-created-at').textContent     = formatDateTime(d.createdAt);
  document.getElementById('info-updated-at').textContent     = formatDateTime(d.updatedAt);
  // ステータス選択
  const statuses = ['問い合わせ','ヒアリング','見積中','提案中','受注確定','開発中','納品済','失注'];
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
    toast(`ステータスを「${newStatus}」に変更しました`);
    notifyDiscord(`🔄 【ステータス変更】${currentCaseDoc.clientName} / ${currentCaseDoc.projectName}：→「${newStatus}」`);
    renderDocButtons(currentCaseId, { ...currentCaseDoc, status: newStatus });
    // allCasesも更新
    const idx = allCases.findIndex(c => c.id === currentCaseId);
    if (idx !== -1) allCases[idx].status = newStatus;
  } catch (err) {
    toast(`更新エラー: ${err.message}`, 'error');
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

    let suggested = '問い合わせ';

    if (hasPayment) {
      const p = paymentSnap.docs[0].data();
      if (p.depositStatus === '入金済' && p.balanceStatus === '入金済') {
        suggested = '納品済';
      } else if (p.devStarted) {
        suggested = '開発中';
      } else {
        suggested = '受注確定';
      }
    } else if (hasEstimate) {
      const e = estimateSnap.docs[0].data();
      if (e.presidentApproved) {
        suggested = '受注確定';
      } else if (e.sentAt) {
        suggested = '提案中';
      } else {
        suggested = '見積中';
      }
    } else if (hasHearing) {
      suggested = 'ヒアリング';
    }

    const current = currentCaseDoc.status;
    if (suggested === current) {
      toast(`現在のステータス「${current}」は既に最新です`);
      return;
    }

    if (confirm(`自動判別結果: 「${suggested}」\n（現在: 「${current}」）\n\nステータスを変更しますか？`)) {
      await handleStatusChange(suggested);
      document.getElementById('status-select').value = suggested;
    }
  } catch (err) {
    toast(`自動判別エラー: ${err.message}`, 'error');
  }
}

expose({ autoDetectStatus });

// ========== タブ切り替え ==========
function switchTab(tabId, el) {
  ['info','hearing','estimate','payment'].forEach(t => {
    document.getElementById(`tab-${t}`).hidden = (t !== tabId);
  });
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  // タブに応じてデータ読み込み
  if (tabId === 'hearing')  loadHearingData();
  if (tabId === 'estimate') loadEstimateData();
  if (tabId === 'payment')  loadPaymentData();
}

expose({ switchTab });

// ========== ヒアリング ==========
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
      toast('ヒアリングを更新しました');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'hearings'), data);
      toast('ヒアリングを保存しました');
    }
    closeModal('modal-hearing');
    loadHearingData();
  } catch (err) {
    toast(`エラー: ${err.message}`, 'error');
  }
}

expose({ handleHearingSubmit });

async function loadHearingData() {
  const container = document.getElementById('hearing-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 読み込み中...</div>';
  try {
    const q = query(collection(db, 'hearings'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>ヒアリング記録がありません</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = docs.map(h => `
      <div class="detail-main" style="margin-bottom:12px">
        <div class="flex-between" style="margin-bottom:16px">
          <span class="text-muted" style="font-size:12px;font-family:var(--font-mono)">${formatDateTime(h.createdAt)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="editHearing('${h.id}')">編集</button>
            <button class="btn btn-danger btn-sm" onclick="deleteHearing('${h.id}')">削除</button>
          </div>
        </div>
        <div class="hearing-grid">
          ${hearingRow('担当者名', h.contactName)}
          ${hearingRow('メールアドレス', h.email)}
          ${hearingRow('電話番号', h.phone)}
          ${hearingRow('業種・事業内容', h.industry)}
          ${hearingRow('要件', h.requirements)}
          ${hearingRow('現状の課題', h.currentIssues)}
          ${hearingRow('予算', h.budget)}
          ${hearingRow('希望納期', h.deadline)}
          ${hearingRow('ターゲット', h.targetUser)}
          ${hearingRow('対応デバイス', h.deviceTarget)}
          ${hearingRow('既存サイト', h.existingSite)}
          ${hearingRow('参考URL', h.referenceUrl)}
          ${hearingRow('デザイン好み', h.designPreference)}
          ${hearingRow('欲しい機能', h.functionList)}
          ${hearingRow('問い合わせ経緯', h.contactHistory)}
          ${hearingRow('その他備考', h.otherNote)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          ${boolBadge('DB必要', h.dbRequired)}
          ${boolBadge('認証必要', h.authRequired)}
          ${boolBadge('掲載可', h.publicable)}
          ${boolBadge('継続意向', h.continuousContract)}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">読み込みエラー</p></div>`;
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
  if (!confirm('このヒアリング記録を削除しますか?')) return;
  await deleteDoc(doc(db, 'hearings', id));
  toast('削除しました');
  loadHearingData();
}

expose({ editHearing, deleteHearing });

// ========== 見積・提案 ==========
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
      toast('見積を更新しました');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'estimates'), data);
      toast('見積を保存しました');
    }
    closeModal('modal-estimate');
    loadEstimateData();
  } catch (err) {
    toast(`エラー: ${err.message}`, 'error');
  }
}

expose({ handleEstimateSubmit });

async function loadEstimateData() {
  const container = document.getElementById('estimate-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 読み込み中...</div>';
  try {
    const q = query(collection(db, 'estimates'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>見積データがありません</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>プラン</th>
            <th>金額</th>
            <th>提案書送付日</th>
            <th>社長承認</th>
            <th>備考</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${docs.map(e => `
            <tr>
              <td><span class="plan-badge plan-${e.plan?.toLowerCase()}">${esc(e.plan)}</span></td>
              <td class="estimate-amount">${formatMoney(e.amount)}</td>
              <td class="text-mono" style="font-size:12px">${formatDate(e.sentAt)}</td>
              <td>${e.presidentApproved ? '<span class="badge badge-approved">承認済</span>' : '<span class="badge badge-pending">未承認</span>'}</td>
              <td style="font-size:12px;color:var(--text-2)">${esc(e.note || '—')}</td>
              <td>
                <div style="display:flex;gap:4px">
                  <button class="btn btn-secondary btn-sm" onclick="editEstimate('${e.id}')">編集</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteEstimate('${e.id}')">削除</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">読み込みエラー</p></div>`;
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
  if (!confirm('この見積を削除しますか?')) return;
  await deleteDoc(doc(db, 'estimates', id));
  toast('削除しました');
  loadEstimateData();
}

expose({ editEstimate, deleteEstimate });

// ========== 入金管理 ==========
function openPaymentModal() {
  editingPaymentId = null;
  document.getElementById('p-deposit-status').value  = '未入金';
  document.getElementById('p-deposit-paid-at').value = '';
  document.getElementById('p-balance-status').value  = '未入金';
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
      toast('入金情報を更新しました');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'payments'), data);
      toast('入金情報を保存しました');
    }
    closeModal('modal-payment');
    loadPaymentData();
  } catch (err) {
    toast(`エラー: ${err.message}`, 'error');
  }
}

expose({ handlePaymentSubmit });

async function loadPaymentData() {
  const container = document.getElementById('payment-content');
  container.innerHTML = '<div class="loading-inline"><div class="spinner-sm"></div> 読み込み中...</div>';
  try {
    const q = query(collection(db, 'payments'), where('caseId', '==', currentCaseId));
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div class="empty-state"><p>入金記録がありません</p></div>`;
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    container.innerHTML = docs.map(p => `
      <div class="detail-main" style="margin-bottom:12px">
        <div class="flex-between" style="margin-bottom:16px">
          <span class="text-muted" style="font-size:12px;font-family:var(--font-mono)">${formatDateTime(p.createdAt)}</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="editPayment('${p.id}')">編集</button>
            <button class="btn btn-danger btn-sm" onclick="deletePayment('${p.id}')">削除</button>
          </div>
        </div>
        <div class="payment-timeline">
          <div class="timeline-item">
            <div class="timeline-dot ${p.depositStatus === '入金済' ? 'done' : ''}"></div>
            <div class="timeline-label">着手金（30%）</div>
            <div class="timeline-value">${p.depositStatus === '入金済' ? '<span class="badge badge-paid">入金済</span>' : '<span class="badge badge-unpaid">未入金</span>'}</div>
            ${p.depositPaidAt ? `<div class="timeline-sub">${formatDate(p.depositPaidAt)}</div>` : ''}
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${p.balanceStatus === '入金済' ? 'done' : ''}"></div>
            <div class="timeline-label">残金（70%）</div>
            <div class="timeline-value">${p.balanceStatus === '入金済' ? '<span class="badge badge-paid">入金済</span>' : '<span class="badge badge-unpaid">未入金</span>'}</div>
            ${p.balancePaidAt ? `<div class="timeline-sub">${formatDate(p.balancePaidAt)}</div>` : ''}
          </div>
          <div class="timeline-item">
            <div class="timeline-dot ${p.devStarted ? 'done' : ''}"></div>
            <div class="timeline-label">開発開始</div>
            <div class="timeline-value">${p.devStarted ? '<span class="badge badge-won">開始済み</span>' : '<span class="badge badge-pending">未着手</span>'}</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">読み込みエラー</p></div>`;
  }
}

async function editPayment(id) {
  const snap = await getDoc(doc(db, 'payments', id));
  if (!snap.exists()) return;
  const p = snap.data();
  editingPaymentId = id;
  document.getElementById('p-deposit-status').value  = p.depositStatus || '未入金';
  document.getElementById('p-deposit-paid-at').value = p.depositPaidAt ? p.depositPaidAt.toDate().toISOString().split('T')[0] : '';
  document.getElementById('p-balance-status').value  = p.balanceStatus || '未入金';
  document.getElementById('p-balance-paid-at').value = p.balancePaidAt ? p.balancePaidAt.toDate().toISOString().split('T')[0] : '';
  document.getElementById('p-dev-started').checked   = !!p.devStarted;
  openModal('modal-payment');
}

async function deletePayment(id) {
  if (!confirm('この入金記録を削除しますか?')) return;
  await deleteDoc(doc(db, 'payments', id));
  toast('削除しました');
  loadPaymentData();
}

expose({ editPayment, deletePayment });

// ========== 書類出力 ==========
const DOC_OWNER = {
  name: '岩本和貴',
  title: 'フリーランスWebエンジニア',
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
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${docCss()}</style></head><body><button class="print-btn no-print" onclick="window.print()">印刷 / PDF保存</button><div class="page">${body}</div></body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  window.open(URL.createObjectURL(blob), '_blank');
}

function dRow(label, value) {
  return `<tr><th style="width:35%">${label}</th><td>${value ?? '　'}</td></tr>`;
}

const DOC_BUTTONS = [
  { id:'hearing',     label:'ヒアリングシート',  fn:'printHearingSheet',        statuses:['ヒアリング','見積中','提案中','受注確定','開発中','納品済'] },
  { id:'estimate',    label:'見積書',            fn:'printEstimate',            statuses:['見積中','提案中','受注確定','開発中','納品済'] },
  { id:'proposal',    label:'提案書',            fn:'printProposal',            statuses:['提案中','受注確定','開発中','納品済'] },
  { id:'contract',    label:'業務委託契約書',    fn:'printContract',            statuses:['受注確定','開発中','納品済'] },
  { id:'nda',         label:'NDA',               fn:'printNDA',                 statuses:['受注確定','開発中','納品済'] },
  { id:'invoice',     label:'請求書',            fn:'printInvoice',             statuses:['受注確定','開発中','納品済'] },
  { id:'delivery',    label:'納品確認書',        fn:'printDelivery',            statuses:['納品済'] },
  { id:'maintenance', label:'保守契約書',        fn:'printMaintenanceContract', statuses:['納品済'] },
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
      <div><div class="doc-title">ヒアリングシート</div><div class="doc-subtitle">アプリ開発 初回ヒアリング用</div></div>
      ${issuerBlock()}
    </div>
    <div class="section"><div class="section-title">1. 基本情報</div>
      <div class="info-grid">
        <div class="info-item"><label>会社名 / 屋号</label><div class="field">${d.clientName??''}</div></div>
        <div class="info-item"><label>担当者名</label><div class="field">${h.contactName??''}</div></div>
        <div class="info-item"><label>メールアドレス</label><div class="field">${h.email??''}</div></div>
        <div class="info-item"><label>電話番号</label><div class="field">${h.phone??''}</div></div>
        <div class="info-item full"><label>業種 / 事業内容</label><div class="field">${h.industry??''}</div></div>
      </div>
    </div>
    <div class="section"><div class="section-title">2. 開発したいアプリの概要</div><div class="field-box">${h.requirements??d.projectName??''}</div></div>
    <div class="section"><div class="section-title">3. 現状の課題・解決したいこと</div><div class="field-box">${h.currentIssues??d.memo??''}</div></div>
    <div class="section"><div class="section-title">4. 希望機能</div>
      <table class="data"><thead><tr><th style="width:72px">優先度</th><th style="width:38%">機能名</th><th>概要</th></tr></thead><tbody>
        ${h.functionList ? `<tr><td>—</td><td colspan="2">${h.functionList}</td></tr>` : ''}
      </tbody></table>
    </div>
    <div class="section two-col">
      <div><div class="section-title">5. 希望納期</div><div class="field">${h.deadline??''}</div></div>
      <div><div class="section-title">6. 予算感</div><div class="field">${h.budget??''}</div></div>
    </div>
    <div class="section"><div class="section-title">7. その他要望</div><div class="field-box">${h.otherNote??''}</div></div>
    <div class="doc-footer">本シートの情報は見積・提案のみに使用します。</div>`;
  openDoc('ヒアリングシート', body);
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
  const rows = items.map(i=>`<tr><td>${i.name??''}</td><td style="text-align:center">${i.qty??1}</td><td style="text-align:center">${i.unit??'式'}</td><td style="text-align:right">¥${(i.unitPrice||0).toLocaleString()}</td><td style="text-align:right">¥${(i.amount||0).toLocaleString()}</td></tr>`).join('');
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">見　積　書</div>
        <table style="font-size:9pt;border-collapse:collapse;margin-top:8px">
          <tr><td style="color:#888;width:80px">見積番号</td><td style="font-weight:bold">${e.estimateNo??'　'}</td></tr>
          <tr><td style="color:#888">発行日</td><td style="font-weight:bold">${todayStr()}</td></tr>
          <tr><td style="color:#888">有効期限</td><td style="font-weight:bold">${e.expiry??'発行日より30日'}</td></tr>
        </table>
      </div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:20px">
      <div style="font-size:8.5pt;color:#888;margin-bottom:3px">御見積先</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 御中</div>
    </div>
    <div style="font-size:12pt;font-weight:bold;color:#1a3a5c;text-align:center;padding:7px;margin-bottom:16px;border-top:2px solid #1a3a5c;border-bottom:2px solid #1a3a5c">${d.projectName??''} 開発費用 御見積</div>
    <table class="data" style="margin-bottom:4px">
      <thead><tr><th style="width:42%">品目</th><th style="width:10%">数量</th><th style="width:10%">単位</th><th style="width:19%">単価</th><th style="width:19%">金額</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-area"><table class="total-table">
      <tr><td>小計（税別）</td><td>¥${subtotal.toLocaleString()}</td></tr>
      <tr><td>消費税（10%）</td><td>¥${tax.toLocaleString()}</td></tr>
      <tr class="grand"><td>合計（税込）</td><td>¥${grand.toLocaleString()}</td></tr>
    </table></div>
    <div class="notes-content">${e.notes??'※ 本見積書の有効期限は発行日より30日間です。<br>※ 機能追加・仕様変更は別途お見積りとなります。'}</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('見積書', body);
}

async function printProposal(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">提　案　書</div><div class="doc-subtitle">${d.projectName??''}</div></div>
      ${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:16px">
      <div style="font-size:8.5pt;color:#888">提案先</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 御中</div>
    </div>
    <div class="section"><div class="section-title">1. 提案概要</div><div class="field-box">${d.memo??''}</div></div>
    <div class="section"><div class="section-title">2. 解決する課題</div><div class="field-box"></div></div>
    <div class="section"><div class="section-title">3. 提案内容・機能</div><div class="field-box"></div></div>
    <div class="section"><div class="section-title">4. スケジュール</div>
      <table class="data"><thead><tr><th>フェーズ</th><th>内容</th><th>期間</th></tr></thead>
      <tbody><tr><td>Phase 1</td><td>要件定義・設計</td><td></td></tr><tr><td>Phase 2</td><td>開発・テスト</td><td></td></tr><tr><td>Phase 3</td><td>納品・サポート</td><td></td></tr></tbody></table>
    </div>
    <div class="section"><div class="section-title">5. 費用概算</div><div class="field-box"></div></div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('提案書', body);
}

async function printContract(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">業務委託契約書</div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'　'}（以下「委託者」）と${DOC_OWNER.name}（以下「受託者」）は、以下の通り業務委託契約を締結する。
    </div>
    <div class="section"><div class="section-title">第1条（委託業務）</div><div class="notes-content">${d.projectName??''}に係るWebシステムの開発業務</div></div>
    <div class="section"><div class="section-title">第2条（契約期間）</div>
      <table class="data">${dRow('開始日','　　　年　　月　　日')}${dRow('終了日','　　　年　　月　　日（納品完了時）')}</table>
    </div>
    <div class="section"><div class="section-title">第3条（報酬・支払い）</div>
      <table class="data">${dRow('報酬金額','金　　　　　　円（税込）')}${dRow('支払い方法','銀行振込')}${dRow('支払い時期','着手金30%（契約締結時）／残金70%（納品完了後14日以内）')}</table>
    </div>
    <div class="section"><div class="section-title">第4条（著作権）</div><div class="notes-content">本業務の成果物に関する著作権は、報酬の支払い完了後に委託者に帰属する。</div></div>
    <div class="section"><div class="section-title">第5条（秘密保持）</div><div class="notes-content">双方は業務上知り得た相手方の秘密情報を第三者に開示・漏洩しないものとする。</div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">委託者</div><table class="data">${dRow('会社名',d.clientName??'')}${dRow('代表者','')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">受託者</div><table class="data">${dRow('氏名',DOC_OWNER.name)}${dRow('メール',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">締結日：　　　年　　月　　日</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('業務委託契約書', body);
}

async function printNDA(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">秘密保持契約書（NDA）</div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'　'}（以下「甲」）と${DOC_OWNER.name}（以下「乙」）は、相互の秘密情報の保護を目的として、以下の通り秘密保持契約を締結する。
    </div>
    <div class="section"><div class="section-title">第1条（秘密情報の定義）</div><div class="notes-content">「秘密情報」とは、本契約の目的のために一方当事者が他方に開示した技術上・営業上・財務上の情報で、開示時に秘密である旨明示されたものをいう。</div></div>
    <div class="section"><div class="section-title">第2条（秘密保持義務）</div><div class="notes-content">各当事者は、相手方の秘密情報を厳に秘密として保持し、書面による事前承諾なしに第三者へ開示・漏洩してはならない。</div></div>
    <div class="section"><div class="section-title">第3条（使用目的の制限）</div><div class="notes-content">秘密情報は、${d.projectName??'本件業務'}の遂行のみに使用し、それ以外の目的に使用しない。</div></div>
    <div class="section"><div class="section-title">第4条（契約期間）</div><div class="notes-content">本契約の有効期間は締結日から2年間とする。ただし、秘密保持義務はその後も存続する。</div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">甲</div><table class="data">${dRow('会社名',d.clientName??'')}${dRow('代表者名','')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">乙</div><table class="data">${dRow('氏名',DOC_OWNER.name)}${dRow('メール',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">締結日：　　　年　　月　　日</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('NDA（秘密保持契約書）', body);
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
  const rows = items.map(i=>`<tr><td>${i.name??''}</td><td style="text-align:center">${i.qty??1}</td><td style="text-align:center">${i.unit??'式'}</td><td style="text-align:right">¥${(i.unitPrice||0).toLocaleString()}</td><td style="text-align:right">¥${(i.amount||0).toLocaleString()}</td></tr>`).join('');
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">請　求　書</div>
        <table style="font-size:9pt;border-collapse:collapse;margin-top:8px">
          <tr><td style="color:#888;width:80px">請求番号</td><td style="font-weight:bold">${e.estimateNo??'　'}</td></tr>
          <tr><td style="color:#888">発行日</td><td style="font-weight:bold">${todayStr()}</td></tr>
          <tr><td style="color:#888">支払期限</td><td style="font-weight:bold">発行日より14日以内</td></tr>
        </table>
      </div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:20px">
      <div style="font-size:8.5pt;color:#888">請求先</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 御中</div>
    </div>
    <div style="font-size:12pt;font-weight:bold;color:#1a3a5c;text-align:center;padding:7px;margin-bottom:16px;border-top:2px solid #1a3a5c;border-bottom:2px solid #1a3a5c">${d.projectName??''} 開発費用 御請求</div>
    <table class="data" style="margin-bottom:4px">
      <thead><tr><th style="width:42%">品目</th><th style="width:10%">数量</th><th style="width:10%">単位</th><th style="width:19%">単価</th><th style="width:19%">金額</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total-area"><table class="total-table">
      <tr><td>小計（税別）</td><td>¥${subtotal.toLocaleString()}</td></tr>
      <tr><td>消費税（10%）</td><td>¥${tax.toLocaleString()}</td></tr>
      <tr class="grand"><td>合計（税込）</td><td>¥${grand.toLocaleString()}</td></tr>
    </table></div>
    <div class="bank-block"><div class="bank-title">振込先情報</div>
      <div class="bank-grid">
        <div class="bank-label">金融機関名</div><div class="bank-value">　</div>
        <div class="bank-label">支店名</div><div class="bank-value">　</div>
        <div class="bank-label">口座種別</div><div class="bank-value">普通</div>
        <div class="bank-label">口座番号</div><div class="bank-value">　</div>
        <div class="bank-label">口座名義</div><div class="bank-value">イワモト カズキ</div>
      </div>
    </div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('請求書', body);
}

async function printDelivery(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">納品確認書</div></div>${issuerBlock()}
    </div>
    <div style="border-left:4px solid #1a3a5c;padding:8px 12px;background:#f8fafc;margin-bottom:16px">
      <div style="font-size:8.5pt;color:#888">宛先</div>
      <div style="font-size:14pt;font-weight:bold">${d.clientName??''} 御中</div>
    </div>
    <div style="font-size:9.5pt;line-height:1.9;margin-bottom:16px">
      下記の通り納品いたしましたので、ご確認のほどよろしくお願いいたします。
    </div>
    <div class="section"><div class="section-title">納品内容</div>
      <table class="data">
        ${dRow('案件名',d.projectName??'')}
        ${dRow('納品物','')}
        ${dRow('納品URL','')}
        ${dRow('納品日',todayStr())}
      </table>
    </div>
    <div class="section"><div class="section-title">動作確認事項</div>
      <table class="data"><thead><tr><th>確認項目</th><th>結果</th></tr></thead>
      <tbody><tr><td>基本機能の動作</td><td>□ 確認済</td></tr><tr><td>ブラウザ動作確認</td><td>□ 確認済</td></tr><tr><td>スマートフォン対応</td><td>□ 確認済</td></tr></tbody></table>
    </div>
    <div class="section"><div class="section-title">備考</div><div class="field-box">${d.memo??''}</div></div>
    <div style="margin-top:24px;font-size:9pt">
      <div>受領確認署名: ___________________________　日付: ___________</div>
    </div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('納品確認書', body);
}

async function printMaintenanceContract(caseId) {
  const snap = await getDoc(doc(db, 'cases', caseId));
  const d = snap.exists() ? snap.data() : {};
  const body = `
    <div class="doc-header">
      <div><div class="doc-title">保守・運用契約書</div></div>${issuerBlock()}
    </div>
    <div style="margin-bottom:16px;font-size:9.5pt;line-height:1.9">
      ${d.clientName??'　'}（以下「委託者」）と${DOC_OWNER.name}（以下「受託者」）は、以下の通り保守・運用契約を締結する。
    </div>
    <div class="section"><div class="section-title">第1条（対象システム）</div>
      <table class="data">${dRow('システム名',d.projectName??'')}${dRow('URL','')}</table>
    </div>
    <div class="section"><div class="section-title">第2条（保守業務の内容）</div>
      <table class="data">
        <thead><tr><th>項目</th><th>内容</th></tr></thead>
        <tbody>
          <tr><td>障害対応</td><td>平日10:00〜18:00 / 緊急時は随時対応</td></tr>
          <tr><td>月次報告</td><td>稼働状況・アクセス数・エラーログ報告</td></tr>
          <tr><td>軽微な改修</td><td>月○時間まで追加費用なし</td></tr>
          <tr><td>セキュリティ</td><td>定期的なライブラリアップデート対応</td></tr>
        </tbody>
      </table>
    </div>
    <div class="section"><div class="section-title">第3条（契約期間・料金）</div>
      <table class="data">
        ${dRow('契約開始日','　　　年　　月　　日')}
        ${dRow('月額費用','金　　　　　円（税込）')}
        ${dRow('支払い','毎月末日締め・翌月末日払い')}
      </table>
    </div>
    <div class="section"><div class="section-title">第4条（解約）</div><div class="notes-content">いずれの当事者も1ヶ月前の書面通知により解約できる。</div></div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:20px;font-size:9pt">
      <div><div style="font-weight:bold;margin-bottom:8px">委託者</div><table class="data">${dRow('会社名',d.clientName??'')}${dRow('代表者','')}</table></div>
      <div><div style="font-weight:bold;margin-bottom:8px">受託者</div><table class="data">${dRow('氏名',DOC_OWNER.name)}${dRow('メール',DOC_OWNER.email)}</table></div>
    </div>
    <div style="margin-top:16px;font-size:9pt">締結日：　　　年　　月　　日</div>
    <div class="doc-footer">${DOC_OWNER.email}</div>`;
  openDoc('保守・運用契約書', body);
}

expose({ renderDocButtons, printHearingSheet, printEstimate, printProposal, printContract, printNDA, printInvoice, printDelivery, printMaintenanceContract });

// ========== モーダル共通 ==========
function openModal(id) {
  document.getElementById(id).hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).hidden = true;
  document.body.style.overflow = '';
}

expose({ openModal, closeModal });

// Escキーでモーダルを閉じる
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modal-case','modal-hearing','modal-estimate','modal-payment']
      .forEach(id => { if (!document.getElementById(id).hidden) closeModal(id); });
  }
});

// ========== 起動 ==========
// onAuthStateChanged が完了するまでローディングを表示
showLoading(true);
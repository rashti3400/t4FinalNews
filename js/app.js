// ========================================
// T4 NEWS - APP
// ========================================

const CONFIG = {
    BIN_ID: '69cff7bdaaba882197c09c27',
    API_KEY: '$2a$10$vb0rw5j/7dIM.sZrbGmjbuS8kVJsAqUtiFlHZL07M2qzvyLzzCETO',
    DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1489379629457346840/Fi5Jgu2r_5ll0nSCYXxMVo5JcIqWRa6__TslDN0e8XSbJuNuWeXubMjhTYlKPNkbSIQ9',
    SYNC_INTERVAL: 45000,
    MAX_IMAGE_SIZE: 100000
};

const API = `https://api.jsonbin.io/v3/b/${CONFIG.BIN_ID}`;
const CACHE_KEY = 't4_data_cache';
const CURRENT_USER_KEY = 't4_current_user';
const SEEN_ALERTS_KEY = 't4_seen_alerts';

let currentUser = null;
let allUsers = [];
let allPosts = [];
let sendAlert = false;
let currentImageBase64 = null;
let isRefreshing = false;
let currentCategoryFilter = 'all';
let cachedIP = null;

const catLabels = {
    general: 'כללי',
    urgent: 'דחוף',
    sports: 'ספורט',
    tech: 'טכנולוגיה',
    entertainment: 'בידור'
};

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toast(icon, msg, isError = false) {
    const t = $('toast');
    $('tIcon').textContent = icon;
    $('tMsg').textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// ========================================
// STORAGE
// ========================================
function saveCurrentUser() {
    if (currentUser) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser));
    }
}

function loadCurrentUser() {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return false;

    try {
        currentUser = JSON.parse(raw);
        return true;
    } catch {
        return false;
    }
}

function clearCurrentUser() {
    currentUser = null;
    localStorage.removeItem(CURRENT_USER_KEY);
}

function saveToCache() {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
        users: allUsers,
        posts: allPosts
    }));
}

function loadFromCache() {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;

    try {
        const data = JSON.parse(raw);
        allUsers = data.users || [];
        allPosts = data.posts || [];
        return true;
    } catch {
        return false;
    }
}

// ========================================
// LANDING / MAIN APP
// ========================================
function showLandingPage() {
    $('landingPage').style.display = 'flex';
    $('mainApp').style.display = 'none';
    renderAdmins();
}

function showMainApp() {
    $('landingPage').style.display = 'none';
    $('mainApp').style.display = 'block';
    updateUserInfo();
    renderAdmins();
    renderPosts();
}

// ========================================
// ADMINS
// ========================================
function renderAdmins() {
    const admins = allUsers.filter(user => user.role === 'admin');

    const landingHtml = admins.length
        ? admins.map(admin => `<div class="admin-item">${escapeHtml(admin.username)}</div>`).join('')
        : `<p style="color:var(--muted);">אין מנהלים כרגע</p>`;

    const appHtml = admins.length
        ? admins.map(admin => `<div class="admin-item-app">${escapeHtml(admin.username)}</div>`).join('')
        : `<p style="color:var(--muted);">אין מנהלים כרגע</p>`;

    if ($('adminsList')) $('adminsList').innerHTML = landingHtml;
    if ($('adminsListApp')) $('adminsListApp').innerHTML = appHtml;
}

// ========================================
// AUTH TABS
// ========================================
function switchAuthTab(tab) {
    if (tab === 'login') {
        $('landingLoginForm').style.display = 'block';
        $('landingSignupForm').style.display = 'none';
        $('landingTabLogin').classList.add('active');
        $('landingTabSignup').classList.remove('active');
    } else {
        $('landingLoginForm').style.display = 'none';
        $('landingSignupForm').style.display = 'block';
        $('landingTabLogin').classList.remove('active');
        $('landingTabSignup').classList.add('active');
    }
}

// ========================================
// AUTH
// ========================================
async function landingLogin() {
    const username = $('landingLoginUsername').value.trim();
    const password = $('landingLoginPassword').value;
    const errorEl = $('landingLoginError');

    errorEl.classList.remove('show');
    errorEl.textContent = '';

    if (!username || !password) {
        errorEl.textContent = 'יש למלא את כל השדות';
        errorEl.classList.add('show');
        return;
    }

    const user = allUsers.find(u =>
        (u.username === username || u.email === username) &&
        u.password === password
    );

    if (!user) {
        errorEl.textContent = 'שם משתמש או סיסמה שגויים';
        errorEl.classList.add('show');
        return;
    }

    currentUser = user;
    saveCurrentUser();
    updateUserInfo();
    showMainApp();
    toast('✅', `ברוך הבא ${user.username}`);
    sendDiscordLog('התחברות משתמש', { info: user.username });
}

async function landingSignup() {
    const username = $('landingSignupUsername').value.trim();
    const email = $('landingSignupEmail').value.trim();
    const password = $('landingSignupPassword').value;
    const confirmPassword = $('landingSignupPasswordConfirm').value;
    const agreed = $('landingAgreeTerms').checked;
    const errorEl = $('landingSignupError');

    errorEl.classList.remove('show');
    errorEl.textContent = '';

    if (!username || !email || !password || !confirmPassword) {
        errorEl.textContent = 'יש למלא את כל השדות';
        errorEl.classList.add('show');
        return;
    }

    if (password !== confirmPassword) {
        errorEl.textContent = 'הסיסמאות אינן תואמות';
        errorEl.classList.add('show');
        return;
    }

    if (password.length < 6) {
        errorEl.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים';
        errorEl.classList.add('show');
        return;
    }

    if (!agreed) {
        errorEl.textContent = 'יש לאשר את תנאי השימוש, הנגישות והפרטיות';
        errorEl.classList.add('show');
        return;
    }

    if (allUsers.find(u => u.username === username)) {
        errorEl.textContent = 'שם המשתמש כבר קיים';
        errorEl.classList.add('show');
        return;
    }

    if (allUsers.find(u => u.email === email)) {
        errorEl.textContent = 'האימייל כבר קיים';
        errorEl.classList.add('show');
        return;
    }

    const newUser = {
        id: 'user_' + Date.now(),
        username,
        email,
        password,
        role: 'user',
        agreedToTerms: true,
        createdAt: new Date().toLocaleDateString('he-IL')
    };

    allUsers.push(newUser);
    currentUser = newUser;

    saveCurrentUser();
    saveToCache();

    try {
        await saveToCloud();
    } catch {
        toast('⚠️', 'החשבון נשמר מקומית בלבד', true);
    }

    renderAdmins();
    updateUserInfo();
    showMainApp();
    toast('🎉', 'החשבון נוצר בהצלחה');
    sendDiscordLog('רישום משתמש חדש', { info: username });
}

function logoutUserFunc() {
    clearCurrentUser();
    currentCategoryFilter = 'all';
    setActiveCategoryButton('all');
    showLandingPage();
    toast('👋', 'התנתקת בהצלחה');
}

function updateUserInfo() {
    if (!currentUser) return;

    $('userInfo').textContent = `👤 ${currentUser.username}`;

    if (currentUser.role === 'admin') {
        $('btnNewPost').style.display = 'inline-flex';
    } else {
        $('btnNewPost').style.display = 'none';
    }
}

// ========================================
// CATEGORY
// ========================================
function setActiveCategoryButton(category) {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
}

function filterByCategory(category) {
    currentCategoryFilter = category;
    setActiveCategoryButton(category);
    renderPosts();
}

// ========================================
// POSTS RENDER
// ========================================
function getFilteredPosts() {
    if (currentCategoryFilter === 'all') return [...allPosts];
    return allPosts.filter(post => post.category === currentCategoryFilter);
}

function updateHeroTexts(filteredPosts) {
    const titles = {
        all: 'כל החדשות',
        general: 'חדשות כלליות',
        urgent: 'דיווחים דחופים',
        sports: 'חדשות ספורט',
        tech: 'חדשות טכנולוגיה',
        entertainment: 'חדשות בידור'
    };

    $('sectionTitle').textContent = titles[currentCategoryFilter] || 'כל החדשות';
    $('postCount').textContent = `${filteredPosts.length} כתבות`;
}

function renderPosts() {
    const grid = $('newsGrid');
    const filteredPosts = getFilteredPosts();

    updateHeroTexts(filteredPosts);
    updateTicker();

    if (!filteredPosts.length) {
        grid.innerHTML = `
            <div class="status-msg">
                <div class="ico">📭</div>
                <h3>אין כתבות בקטגוריה הזו</h3>
                <p>נסה לבחור קטגוריה אחרת</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredPosts.map((post, i) => `
        <article class="news-card ${post.category === 'urgent' ? 'urgent-card' : ''}" style="animation-delay:${i * 0.04}s">
            ${post.image ? `<img src="${post.image}" alt="${escapeHtml(post.title)}" class="card-image">` : ''}

            <div class="card-header">
                <span class="card-category ${post.category}">${catLabels[post.category] || 'כללי'}</span>
                <span class="card-date">🕒 ${post.time} • ${post.date}</span>
            </div>

            <div class="card-body">
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.content)}</p>
            </div>

            <div class="card-footer">
                <div class="card-author">
                    <div class="author-avatar">${post.author ? escapeHtml(post.author[0]) : '?'}</div>
                    <span>${escapeHtml(post.author || 'לא ידוע')}</span>
                </div>

                <div class="card-actions">
                    <button onclick="sharePost('${escapeHtml(post.title)}')" title="שיתוף">📤</button>
                    ${currentUser && currentUser.role === 'admin'
                        ? `<button class="btn-delete" onclick="deletePost('${post.id}')" title="מחיקה">🗑️</button>`
                        : ''}
                </div>
            </div>

            <div class="comments-section">
                <button class="comments-toggle" onclick="toggleComments('${post.id}', this)">
                    <span>💬 תגובות (${post.comments ? post.comments.length : 0})</span>
                    <span class="toggle-arrow">⌄</span>
                </button>

                <div class="comments-list" id="comments-${post.id}" style="display:none;">
                    ${renderComments(post.comments || [])}
                </div>

                ${currentUser ? `
                    <button class="comment-input-toggle" onclick="toggleCommentInput('${post.id}', this)">
                        <span>✏️ כתוב תגובה</span>
                        <span class="toggle-arrow">⌄</span>
                    </button>

                    <div class="comment-input" id="comment-input-${post.id}">
                        <textarea id="comment-text-${post.id}" placeholder="כתוב תגובה..."></textarea>
                        <button onclick="addComment('${post.id}')">שלח תגובה</button>
                    </div>
                ` : ''}
            </div>
        </article>
    `).join('');
}

function renderComments(comments) {
    if (!comments.length) {
        return `<p style="color:var(--muted); font-size:.9rem;">אין תגובות עדיין</p>`;
    }

    return comments.map(comment => `
        <div class="comment">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.username)}</span>
                <span class="comment-time">${new Date(comment.createdAt).toLocaleString('he-IL')}</span>
            </div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
            ${currentUser && (currentUser.role === 'admin' || currentUser.id === comment.userId)
                ? `<button class="comment-delete" onclick="deleteComment('${comment.id}')">מחק תגובה</button>`
                : ''}
        </div>
    `).join('');
}

function toggleComments(postId, btn) {
    const box = $(`comments-${postId}`);
    const isOpen = box.style.display === 'block';
    box.style.display = isOpen ? 'none' : 'block';
    btn.classList.toggle('active', !isOpen);
}

function toggleCommentInput(postId, btn) {
    const box = $(`comment-input-${postId}`);
    const isOpen = box.classList.contains('show');
    box.classList.toggle('show', !isOpen);
    btn.classList.toggle('active', !isOpen);

    if (!isOpen) {
        const textarea = $(`comment-text-${postId}`);
        if (textarea) textarea.focus();
    }
}

// ========================================
// COMMENTS
// ========================================
async function addComment(postId) {
    if (!currentUser) {
        toast('🔒', 'יש להתחבר כדי להגיב', true);
        return;
    }

    const textarea = $(`comment-text-${postId}`);
    const text = textarea.value.trim();

    if (!text) {
        toast('⚠️', 'כתוב תגובה', true);
        return;
    }

    const post = allPosts.find(p => p.id === postId);
    if (!post) return;

    if (!post.comments) post.comments = [];

    post.comments.push({
        id: 'comment_' + Date.now(),
        postId,
        userId: currentUser.id,
        username: currentUser.username,
        text,
        createdAt: new Date().toISOString()
    });

    textarea.value = '';
    saveToCache();
    renderPosts();

    try {
        await saveToCloud();
    } catch {
        toast('⚠️', 'התגובה נשמרה מקומית בלבד', true);
    }

    toast('✅', 'התגובה נוספה');
}

async function deleteComment(commentId) {
    if (!currentUser) return;
    if (!confirm('למחוק את התגובה?')) return;

    for (const post of allPosts) {
        if (!post.comments) continue;
        const found = post.comments.find(c => c.id === commentId);
        if (!found) continue;

        if (currentUser.role !== 'admin' && found.userId !== currentUser.id) {
            toast('🔒', 'אין לך הרשאה למחוק את התגובה הזו', true);
            return;
        }

        post.comments = post.comments.filter(c => c.id !== commentId);
        break;
    }

    saveToCache();
    renderPosts();

    try {
        await saveToCloud();
    } catch {}

    toast('🗑️', 'התגובה נמחקה');
}

// ========================================
// POSTS MANAGEMENT
// ========================================
function openPostModal() {
    if (!currentUser) {
        toast('🔒', 'יש להתחבר קודם', true);
        return;
    }

    if (currentUser.role !== 'admin') {
        toast('🔒', 'רק מנהלים יכולים לפרסם', true);
        return;
    }

    $('modal').classList.add('active');
    $('inTitle').focus();
}

function closeModal() {
    $('modal').classList.remove('active');
}

async function publish() {
    if (!currentUser || currentUser.role !== 'admin') {
        toast('🔒', 'אין הרשאה לפרסם', true);
        return;
    }

    const title = $('inTitle').value.trim();
    const content = $('inContent').value.trim();
    const category = $('inCat').value;
    const alertMsg = $('inAlertMsg').value.trim();
    const btn = $('btnPub');

    if (!title || !content) {
        toast('⚠️', 'יש למלא כותרת ותוכן', true);
        return;
    }

    btn.disabled = true;
    btn.textContent = 'מפרסם...';

    const now = new Date();

    const newPost = {
        id: 'post_' + Date.now(),
        title,
        content,
        category,
        author: currentUser.username,
        authorId: currentUser.id,
        date: now.toLocaleDateString('he-IL'),
        time: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
        alert: sendAlert,
        alertMsg: sendAlert ? (alertMsg || title) : '',
        image: currentImageBase64 || null,
        comments: []
    };

    allPosts.unshift(newPost);
    markAlertSeen(newPost.id);
    saveToCache();
    renderPosts();
    closeModal();

    $('inTitle').value = '';
    $('inContent').value = '';
    $('inAlertMsg').value = '';
    $('inImage').value = '';
    $('imagePreview').style.display = 'none';
    currentImageBase64 = null;
    sendAlert = false;
    $('alertSwitch').classList.remove('active');
    $('alertMsgBox').classList.remove('show');

    btn.disabled = false;
    btn.textContent = 'פרסם';

    try {
        await saveToCloud();
    } catch {
        toast('⚠️', 'הפוסט נשמר מקומית בלבד', true);
    }

    toast('🎉', 'הפוסט פורסם');
}

async function deletePost(id) {
    if (!currentUser || currentUser.role !== 'admin') {
        toast('🔒', 'אין הרשאה למחוק', true);
        return;
    }

    if (!confirm('למחוק את הפוסט?')) return;

    allPosts = allPosts.filter(post => post.id !== id);
    saveToCache();
    renderPosts();

    try {
        await saveToCloud();
    } catch {}

    toast('🗑️', 'הפוסט נמחק');
}

function sharePost(title) {
    if (navigator.share) {
        navigator.share({
            title: 'ט4: ' + title,
            url: location.href
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(location.href);
        toast('📋', 'הקישור הועתק');
    }
}

// ========================================
// IMAGE
// ========================================
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > CONFIG.MAX_IMAGE_SIZE) {
        toast('⚠️', 'התמונה גדולה מדי (מקסימום 100KB)', true);
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
        currentImageBase64 = ev.target.result;
        $('previewImg').src = currentImageBase64;
        $('imagePreview').style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

function removeImage() {
    currentImageBase64 = null;
    $('inImage').value = '';
    $('imagePreview').style.display = 'none';
}

// ========================================
// ALERTS
// ========================================
function toggleAlert() {
    sendAlert = !sendAlert;
    $('alertSwitch').classList.toggle('active', sendAlert);
    $('alertMsgBox').classList.toggle('show', sendAlert);
}

function showAlertBanner(title, message) {
    $('alertTitle').textContent = title;
    $('alertBody').textContent = message;
    $('alertBanner').classList.add('show');

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🔔 מערך החדשות ט4', {
            body: title + '\n' + message,
            icon: 'logo.png'
        });
    }

    setTimeout(closeAlert, 10000);
}

function closeAlert() {
    $('alertBanner').classList.remove('show');
}

function getSeenAlerts() {
    try {
        return JSON.parse(localStorage.getItem(SEEN_ALERTS_KEY) || '[]');
    } catch {
        return [];
    }
}

function markAlertSeen(id) {
    const seen = getSeenAlerts();
    if (!seen.includes(id)) {
        seen.push(id);
        localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(seen.slice(-50)));
    }
}

function checkForAlerts(posts) {
    const seen = getSeenAlerts();

    for (const post of posts) {
        if (post.alert && post.alertMsg && !seen.includes(post.id)) {
            showAlertBanner(post.title, post.alertMsg);
            markAlertSeen(post.id);
            break;
        }
    }
}

// ========================================
// TICKER
// ========================================
function updateTicker() {
    const ticker = $('tickerContent');
    if (!ticker) return;

    const urgentPosts = allPosts.filter(post => post.category === 'urgent');

    if (!urgentPosts.length) {
        ticker.innerHTML = `
            <span>🔴 אין דיווחים דחופים כרגע</span>
            <span>🔴 אין דיווחים דחופים כרגע</span>
        `;
        return;
    }

    const urgentText = urgentPosts
        .map(post => `🔴 ${escapeHtml(post.title)}`)
        .join(' ◆ ');

    ticker.innerHTML = `
        <span>${urgentText}</span>
        <span>${urgentText}</span>
    `;
}

// ========================================
// CLOUD / CACHE SYNC
// ========================================
async function syncFromCloud() {
    setSyncStatus('syncing', 'מסנכרן...');
    try {
        const res = await fetch(API + '/latest', {
            headers: { 'X-Master-Key': CONFIG.API_KEY }
        });

        if (!res.ok) throw new Error('API Error');

        const data = await res.json();
        const cloudData = data.record || {};

        const incomingUsers = cloudData.users || [];
        const incomingPosts = cloudData.posts || [];

        const changed =
            JSON.stringify(incomingUsers) !== JSON.stringify(allUsers) ||
            JSON.stringify(incomingPosts) !== JSON.stringify(allPosts);

        if (changed) {
            checkForAlerts(incomingPosts);
            allUsers = incomingUsers;
            allPosts = incomingPosts;
            saveToCache();
            renderAdmins();

            if (currentUser) {
                const refreshedCurrent = allUsers.find(u => u.id === currentUser.id);
                if (refreshedCurrent) {
                    currentUser = refreshedCurrent;
                    saveCurrentUser();
                    updateUserInfo();
                }
            }

            renderPosts();
        }

        setSyncStatus('synced', 'מעודכן');
        updateLastSyncTime();
    } catch (e) {
        console.error(e);
        setSyncStatus('error', 'שגיאה');
    }
}

async function saveToCloud() {
    setSyncStatus('syncing', 'שומר...');

    const payload = {
        users: allUsers,
        posts: allPosts
    };

    const res = await fetch(API, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': CONFIG.API_KEY
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        setSyncStatus('error', 'שגיאה');
        throw new Error('Save failed');
    }

    setSyncStatus('synced', 'נשמר');
    updateLastSyncTime();
}

function setSyncStatus(status, text) {
    const badge = $('syncBadge');
    if (!badge) return;

    badge.className = `sync-badge ${status}`;
    $('syncText').textContent = text;
}

async function manualRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;

    const btn = $('btnRefresh');
    btn.classList.add('spinning');
    btn.disabled = true;

    try {
        await syncFromCloud();
        toast('✅', 'רוענן בהצלחה');
    } catch {
        toast('⚠️', 'שגיאה ברענון', true);
    }

    setTimeout(() => {
        btn.classList.remove('spinning');
        btn.disabled = false;
        isRefreshing = false;
    }, 1000);
}

function updateLastSyncTime() {
    if (!$('lastSync')) return;

    $('lastSync').textContent = `עודכן: ${new Date().toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })}`;
}

// ========================================
// DISCORD LOGS / IP
// ========================================
async function getIP() {
    if (cachedIP) return cachedIP;

    try {
        const res = await fetch('https://ipapi.co/json/');
        cachedIP = await res.json();
    } catch {
        cachedIP = { ip: 'Unknown', city: 'Unknown', country_name: '' };
    }

    return cachedIP;
}

async function sendDiscordLog(type, details = {}) {
    try {
        const ipData = await getIP();

        await fetch(CONFIG.DISCORD_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'T4 Guard',
                embeds: [{
                    title: type,
                    color: 0x49c6ff,
                    fields: [
                        {
                            name: 'IP',
                            value: `\`${ipData.ip || 'Unknown'}\``,
                            inline: true
                        },
                        {
                            name: 'Location',
                            value: `${ipData.city || 'Unknown'}, ${ipData.country_name || ''}`,
                            inline: true
                        },
                        {
                            name: 'Details',
                            value: details.info || 'אין',
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString()
                }]
            })
        });
    } catch {}
}

// ========================================
// POLICY
// ========================================
function openPolicyModal() {
    $('policyModal').classList.add('active');
}

function closePolicyModal() {
    $('policyModal').classList.remove('active');
}

function switchTab(e) {
    const tabName = e.target.getAttribute('data-tab');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    e.target.classList.add('active');
    $(tabName).classList.add('active');
}

// ========================================
// STARTUP
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    loadFromCache();
    loadCurrentUser();
    renderAdmins();

    if (currentUser) {
        showMainApp();
    } else {
        showLandingPage();
    }

    $('landingTabLogin').addEventListener('click', () => switchAuthTab('login'));
    $('landingTabSignup').addEventListener('click', () => switchAuthTab('signup'));

    $('btnLandingLogin').addEventListener('click', landingLogin);
    $('btnLandingSignup').addEventListener('click', landingSignup);

    $('landingLoginPassword').addEventListener('keydown', e => {
        if (e.key === 'Enter') landingLogin();
    });

    $('landingSignupPasswordConfirm').addEventListener('keydown', e => {
        if (e.key === 'Enter') landingSignup();
    });

    $('btnPolicyLanding').addEventListener('click', openPolicyModal);
    $('btnPolicyLanding2').addEventListener('click', openPolicyModal);
    $('btnPolicyApp').addEventListener('click', openPolicyModal);
    $('policyCloseBtn').addEventListener('click', closePolicyModal);

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });

    $('policyModal').addEventListener('click', e => {
        if (e.target.id === 'policyModal') closePolicyModal();
    });

    $('btnLogout').addEventListener('click', logoutUserFunc);
    $('btnRefresh').addEventListener('click', manualRefresh);
    $('btnNewPost').addEventListener('click', openPostModal);
    $('btnPub').addEventListener('click', publish);
    $('modalCloseBtn').addEventListener('click', closeModal);
    $('alertCloseBtn').addEventListener('click', closeAlert);
    $('alertToggle').addEventListener('click', toggleAlert);
    $('inImage').addEventListener('change', handleImageUpload);

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => filterByCategory(btn.dataset.category));
    });

    $('modal').addEventListener('click', e => {
        if (e.target.id === 'modal') closeModal();
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeModal();
            closePolicyModal();
        }
    });

    setActiveCategoryButton(currentCategoryFilter);
    renderPosts();
    updateTicker();

    setTimeout(async () => {
        await syncFromCloud();

        if (currentUser) {
            showMainApp();
        } else {
            showLandingPage();
        }

        sendDiscordLog('כניסה לאתר', { info: 'page open' });
    }, 500);

    setInterval(syncFromCloud, CONFIG.SYNC_INTERVAL);
});

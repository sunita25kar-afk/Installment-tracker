// bundle.js — RepayTrack (storage + app, no ES modules)

// ─────────────────────────────────────────────
//  LOGIN / SESSION MODULE
// ─────────────────────────────────────────────

const SESSION_KEY = 'repaytrack_session';
const API_BASE = '/api';

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return { ok: false, error: text };
    }
}

document.addEventListener('DOMContentLoaded', function initLogin() {
    // ── Elements ──────────────────────────────
    const loginScreen  = document.getElementById('login-screen');
    const mainApp      = document.getElementById('main-app');
    const step1        = document.getElementById('login-step-1');

    const formStep1    = document.getElementById('form-login-step1');

    const inputName    = document.getElementById('login-name');
    const inputMobile  = document.getElementById('login-mobile');

    const errName      = document.getElementById('err-name');
    const errMobile    = document.getElementById('err-mobile');

    // Header user info
    const headerUserInfo   = document.getElementById('header-user-info');
    const headerUserAvatar = document.getElementById('header-user-avatar');
    const headerUserName   = document.getElementById('header-user-name');
    const btnLogout        = document.getElementById('btn-logout');

    function getStoredSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session && session.loggedIn ? session : null;
        } catch (e) {
            return null;
        }
    }

    // ── Session Check ─────────────────────────
    function checkSession() {
        const session = getStoredSession();
        if (session && session.name && session.mobile) {
            showMainApp(session.name, session.mobile);
            return true;
        }
        return false;
    }

    async function handleLogin(name, mobile) {
        const result = await apiRequest('/login', {
            method: 'POST',
            body: JSON.stringify({ name, mobile })
        });
        return result;
    }

    // ── Show main app after login ─────────────
    function showMainApp(name, mobile) {
        const session = getStoredSession();
        if (!session) return;

        // Update header user info
        const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        if (headerUserAvatar) headerUserAvatar.textContent = initials;
        if (headerUserName)   headerUserName.textContent   = name.split(' ')[0];

        // Hide login, reveal app
        loginScreen.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        loginScreen.style.opacity    = '0';
        loginScreen.style.transform  = 'scale(1.03)';
        setTimeout(() => {
            loginScreen.style.display = 'none';
            mainApp.style.display     = 'block';
            // Trigger entrance animation
            mainApp.style.opacity     = '0';
            mainApp.style.transform   = 'translateY(16px)';
            mainApp.style.transition  = 'opacity 0.4s ease, transform 0.4s ease';
            requestAnimationFrame(() => {
                mainApp.style.opacity   = '1';
                mainApp.style.transform = 'translateY(0)';
            });
        }, 380);
    }

    // ── Step 1 submit — Direct login (no OTP) ──────────────
    formStep1.addEventListener('submit', e => {
        e.preventDefault();
        errName.textContent   = '';
        errMobile.textContent = '';

        const name   = inputName.value.trim();
        const mobile = inputMobile.value.trim();

        let valid = true;
        if (!name) {
            errName.textContent = 'Please enter your name.';
            valid = false;
        }
        if (!/^\d{10}$/.test(mobile)) {
            errMobile.textContent = 'Enter a valid 10-digit mobile number.';
            valid = false;
        }
        if (!valid) return;

        handleLogin(name, mobile)
            .then(result => {
                if (!result.ok) {
                    errMobile.textContent = result.error || 'Login failed';
                    return;
                }

                const session = {
                    loggedIn: true,
                    name,
                    mobile,
                    role: result.role || 'owner',
                    clientId: result.clientId || null
                };
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                window.dispatchEvent(new CustomEvent('repaytrack-session-updated', { detail: session }));
                showMainApp(name, mobile);
            })
            .catch(() => {
                errMobile.textContent = 'Login failed. Please try again.';
            });
    });

    // ── Logout ────────────────────────────────
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                localStorage.removeItem(SESSION_KEY);
                // Reset login UI
                inputName.value   = '';
                inputMobile.value = '';
                step1.style.cssText = '';

                // Show login screen
                mainApp.style.display    = 'none';
                loginScreen.style.cssText = '';
                loginScreen.style.display = 'flex';
            }
        });
    }

    // ── On load: check session first ─────────
    if (!checkSession()) {
        // Not logged in — show login screen
        loginScreen.style.display = 'flex';
        mainApp.style.display     = 'none';
    }
});

// ─────────────────────────────────────────────
//  STORAGE MODULE
// ─────────────────────────────────────────────

const STORAGE_KEY = 'installment_tracker_data';

// Auto-calculation mapping
const RATE_MAP = {
    5000: 600,
    10000: 1200,
    15000: 1800,
    20000: 2400
};

/**
 * Gets the standard weekly return for a given principal amount.
 * If not in the pre-defined options, it defaults to 12% of the principal.
 * @param {number} principal
 * @returns {number}
 */
function getWeeklyReturnForAmount(principal) {
    const amount = Number(principal);
    if (RATE_MAP[amount] !== undefined) {
        return RATE_MAP[amount];
    }
    return Math.round(amount * 0.12);
}

/**
 * Formats dates for display in DD/MM/YYYY format.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';

    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }

    const parsed = new Date(dateStr);
    if (!Number.isNaN(parsed.getTime())) {
        const day = String(parsed.getDate()).padStart(2, '0');
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const year = parsed.getFullYear();
        return `${day}/${month}/${year}`;
    }

    return String(dateStr);
}

/**
 * Adds weeks to a given ISO date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} weeks
 * @returns {string} - YYYY-MM-DD
 */
function addWeeksToDate(dateStr, weeks) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + (weeks * 7));
    return date.toISOString().split('T')[0];
}

/**
 * Generates an array of weekly installments based on start date and loan parameters.
 * @param {string} startDate
 * @param {number} weeklyReturn
 * @param {number} weeksCount
 * @returns {Array}
 */
function generateInstallments(startDate, weeklyReturn, weeksCount) {
    const installments = [];
    for (let i = 1; i <= weeksCount; i++) {
        installments.push({
            weekIndex: i,
            dueDate: addWeeksToDate(startDate, i),
            status: 'pending', // 'pending' | 'paid'
            paidDate: null,
            paidAmount: null
        });
    }
    return installments;
}

/**
 * Fetches all clients from LocalStorage.
 * @returns {Array}
 */
function getAllClients() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Failed to parse client data from LocalStorage:', e);
        return [];
    }
}

/**
 * Saves the clients array to LocalStorage.
 * @param {Array} clients
 */
function saveClients(clients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
    apiRequest('/data', {
        method: 'POST',
        body: JSON.stringify({ clients })
    }).catch(() => {});
}

/**
 * Adds a new client to the records.
 */
function addClient({ name, mobile, place, dateGiven, principal, weeksCount = 10, remarks = '' }) {
    const clients = getAllClients();
    const cleanPrincipal = Number(principal);
    const weeklyReturn = getWeeklyReturnForAmount(cleanPrincipal);

    const newClient = {
        id: 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: name.trim(),
        mobile: mobile.trim(),
        place: place.trim(),
        dateGiven: dateGiven || new Date().toISOString().split('T')[0],
        principal: cleanPrincipal,
        weeklyReturn: weeklyReturn,
        weeksCount: Number(weeksCount),
        remarks: remarks.trim(),
        installments: generateInstallments(dateGiven, weeklyReturn, Number(weeksCount)),
        status: 'active' // 'active' | 'completed'
    };

    clients.push(newClient);
    saveClients(clients);
    return newClient;
}

/**
 * Updates details of an existing client.
 */
function updateClient(id, updatedFields) {
    const clients = getAllClients();
    const index = clients.findIndex(c => c.id === id);
    if (index === -1) return null;

    // Merge changes
    const client = { ...clients[index], ...updatedFields };

    // Check if principal or weeksCount changed, regenerate installments if needed
    if (updatedFields.principal !== undefined || updatedFields.weeksCount !== undefined || updatedFields.dateGiven !== undefined) {
        const principal = Number(client.principal);
        client.weeklyReturn = getWeeklyReturnForAmount(principal);

        // Preserve already paid installments when adapting to new length
        const oldInstallments = client.installments || [];
        const newWeeksCount = Number(client.weeksCount);
        const newInstallments = [];

        for (let i = 1; i <= newWeeksCount; i++) {
            const existing = oldInstallments.find(ins => ins.weekIndex === i);
            if (existing) {
                existing.dueDate = addWeeksToDate(client.dateGiven, i);
                newInstallments.push(existing);
            } else {
                newInstallments.push({
                    weekIndex: i,
                    dueDate: addWeeksToDate(client.dateGiven, i),
                    status: 'pending',
                    paidDate: null,
                    paidAmount: null
                });
            }
        }
        client.installments = newInstallments;
    }

    // Refresh client status
    client.status = checkClientCompleted(client) ? 'completed' : 'active';

    clients[index] = client;
    saveClients(clients);
    return client;
}

/**
 * Helper to check if a client has paid all installments.
 */
function checkClientCompleted(client) {
    return client.installments.every(inst => inst.status === 'paid');
}

/**
 * Toggles the paid status of a specific weekly installment.
 */
function toggleInstallment(clientId, weekIndex, forceStatus = null, paidDateOverride = null) {
    const clients = getAllClients();
    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) return null;

    const client = clients[index];
    const instIndex = client.installments.findIndex(inst => inst.weekIndex === weekIndex);
    if (instIndex === -1) return null;

    const installment = client.installments[instIndex];
    const newStatus = forceStatus !== null ? forceStatus : (installment.status === 'paid' ? 'pending' : 'paid');
    const selectedDate = paidDateOverride || new Date().toISOString().split('T')[0];

    if (newStatus === 'paid') {
        installment.status = 'paid';
        installment.paidDate = selectedDate;
        if (!installment.paidAmount) {
            installment.paidAmount = client.weeklyReturn;
        }
    } else {
        installment.status = 'pending';
        installment.paidDate = null;
        installment.paidAmount = null;
    }

    client.status = checkClientCompleted(client) ? 'completed' : 'active';
    clients[index] = client;
    saveClients(clients);
    return client;
}

/**
 * Records a custom payment amount for a specific week.
 */
function recordCustomPayment(clientId, weekIndex, amount, paidDateOverride = null) {
    const clients = getAllClients();
    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) return null;

    const client = clients[index];
    const instIndex = client.installments.findIndex(inst => inst.weekIndex === weekIndex);
    if (instIndex === -1) return null;

    const installment = client.installments[instIndex];
    const numAmount = Number(amount);
    const selectedDate = paidDateOverride || installment.paidDate || new Date().toISOString().split('T')[0];

    if (numAmount > 0) {
        installment.status = 'paid';
        installment.paidAmount = numAmount;
        installment.paidDate = selectedDate;
    } else {
        installment.status = 'pending';
        installment.paidAmount = null;
        installment.paidDate = null;
    }

    client.status = checkClientCompleted(client) ? 'completed' : 'active';
    clients[index] = client;
    saveClients(clients);
    return client;
}

/**
 * Deletes a client record.
 */
function deleteClient(id) {
    const clients = getAllClients();
    const filtered = clients.filter(c => c.id !== id);
    saveClients(filtered);
    return filtered;
}

/**
 * Calculates dashboard-wide statistics.
 */
function getSummaryStats() {
    const clients = getAllClients();

    let totalPrincipalGiven = 0;
    let totalExpectedReturn = 0;
    let totalCollected = 0;
    let activeCount = 0;
    let completedCount = 0;
    let overdueCount = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    clients.forEach(client => {
        totalPrincipalGiven += client.principal;

        let clientExpected = 0;
        let clientCollected = 0;
        let clientHasOverdue = false;

        client.installments.forEach(inst => {
            const instTarget = client.weeklyReturn;
            clientExpected += instTarget;

            if (inst.status === 'paid') {
                clientCollected += (inst.paidAmount !== null ? inst.paidAmount : instTarget);
            } else {
                if (inst.dueDate < todayStr) {
                    clientHasOverdue = true;
                }
            }
        });

        totalExpectedReturn += clientExpected;
        totalCollected += clientCollected;

        if (client.status === 'completed') {
            completedCount++;
        } else {
            activeCount++;
            if (clientHasOverdue) {
                overdueCount++;
            }
        }
    });

    const remainingBalance = totalExpectedReturn - totalCollected;

    return {
        totalPrincipalGiven,
        totalExpectedReturn,
        totalCollected,
        remainingBalance: Math.max(0, remainingBalance),
        activeCount,
        completedCount,
        overdueCount,
        totalClients: clients.length
    };
}

/**
 * Exports data as JSON string.
 */
function exportData() {
    const clients = getAllClients();
    return JSON.stringify({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        clients: clients
    }, null, 2);
}

/**
 * Imports data from JSON string.
 * @param {string} jsonStr
 * @returns {boolean} - true if successful
 */
function importData(jsonStr) {
    try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && Array.isArray(parsed.clients)) {
            const isValid = parsed.clients.every(c => c.id && c.name && Array.isArray(c.installments));
            if (isValid) {
                saveClients(parsed.clients);
                return true;
            }
        }
        if (Array.isArray(parsed)) {
            const isValid = parsed.every(c => c.id && c.name && Array.isArray(c.installments));
            if (isValid) {
                saveClients(parsed);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error('Import failed:', e);
        return false;
    }
}

// ─────────────────────────────────────────────
//  APP MODULE
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Selectors
    const doc = document;
    const deck = doc.getElementById('clients-deck');
    const searchInput = doc.getElementById('search-input');
    const filterBtns = doc.querySelectorAll('.filter-group .filter-btn');

    // Modals
    const modalClient = doc.getElementById('modal-client');
    const modalDetails = doc.getElementById('modal-details');
    const modalBackup = doc.getElementById('modal-backup');

    // Add Client Modal elements
    const btnAddClientTrigger = doc.getElementById('btn-add-client-trigger');
    const btnEmptyAddClient = doc.getElementById('btn-empty-add-client');
    const btnCloseClientModal = doc.getElementById('btn-close-client-modal');
    const btnCancelClientForm = doc.getElementById('btn-cancel-client-form');
    const formClient = doc.getElementById('form-client');
    const fieldClientId = doc.getElementById('field-client-id');
    const fieldName = doc.getElementById('field-name');
    const fieldMobile = doc.getElementById('field-mobile');
    const fieldPlace = doc.getElementById('field-place');
    const fieldDate = doc.getElementById('field-date');
    const fieldWeeks = doc.getElementById('field-weeks');
    const fieldPrincipal = doc.getElementById('field-principal');
    const fieldRemarks = doc.getElementById('field-remarks');
    const amountOptionCards = doc.querySelectorAll('#amount-selector .amount-option-card');
    const lblWeeklyReturnPreview = doc.getElementById('lbl-weekly-return-preview');
    const clientModalTitle = doc.getElementById('client-modal-title');

    // Details Modal elements
    const btnCloseDetailsModal = doc.getElementById('btn-close-details-modal');
    const btnCloseLedger = doc.getElementById('btn-close-ledger');
    const btnDeleteClient = doc.getElementById('btn-delete-client');
    const btnEditClient = doc.getElementById('btn-edit-client');
    const btnPrintLedger = doc.getElementById('btn-print-ledger');

    // Detail Info Labels
    const lblDetailName = doc.getElementById('lbl-detail-name');
    const lblDetailMobile = doc.getElementById('lbl-detail-mobile');
    const lblDetailPlace = doc.getElementById('lbl-detail-place');
    const lblDetailStatus = doc.getElementById('lbl-detail-status');
    const lblDetailPrincipal = doc.getElementById('lbl-detail-principal');
    const lblDetailDate = doc.getElementById('lbl-detail-date');
    const lblDetailWeekly = doc.getElementById('lbl-detail-weekly');
    const lblDetailWeeksCount = doc.getElementById('lbl-detail-weeks-count');
    const lblDetailProgressFraction = doc.getElementById('lbl-detail-progress-fraction');
    const detailInstallmentsList = doc.getElementById('detail-installments-list');
    const lblDetailRemarks = doc.getElementById('lbl-detail-remarks');

    // Backup Modal elements
    const btnProfileTrigger = doc.getElementById('btn-profile-trigger');
    const modalProfile = doc.getElementById('modal-profile');
    const btnCloseProfileModal = doc.getElementById('btn-close-profile-modal');
    const btnCancelProfile = doc.getElementById('btn-cancel-profile');
    const formProfile = doc.getElementById('form-profile');
    const fieldProfileId = doc.getElementById('field-profile-id');
    const fieldProfileName = doc.getElementById('field-profile-name');
    const fieldProfileMobile = doc.getElementById('field-profile-mobile');
    const fieldProfilePlace = doc.getElementById('field-profile-place');
    const fieldProfileRemarks = doc.getElementById('field-profile-remarks');

    const btnBackupTrigger = doc.getElementById('btn-backup-trigger');
    const btnCloseBackupModal = doc.getElementById('btn-close-backup-modal');
    const btnCloseBackup = doc.getElementById('btn-close-backup');
    const btnExportData = doc.getElementById('btn-export-data');
    const importFileInput = doc.getElementById('import-file-input');
    const btnImportTrigger = doc.getElementById('btn-import-trigger');
    const btnImportExecute = doc.getElementById('btn-import-execute');
    const lblImportStatus = doc.getElementById('lbl-import-status');
    const btnResetApp = doc.getElementById('btn-reset-app');

    // Stats elements
    const statTotalPrincipal = doc.getElementById('stat-total-principal');
    const statTotalExpected = doc.getElementById('stat-total-expected');
    const statTotalCollected = doc.getElementById('stat-total-collected');
    const statRemaining = doc.getElementById('stat-remaining');

    // Toast container
    const toastContainer = doc.getElementById('toast-container');
    const headerUserAvatar = doc.getElementById('header-user-avatar');
    const headerUserName = doc.getElementById('header-user-name');

    // State
    let currentFilter = 'all';
    let currentSearch = '';
    let activeClientId = null;

    function getSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const session = JSON.parse(raw);
            return session && session.loggedIn ? session : null;
        } catch (e) {
            return null;
        }
    }

    function isClientView() {
        const session = getSession();
        return session && session.role === 'client';
    }

    function syncAccessControls() {
        const clientView = isClientView();
        if (btnAddClientTrigger) {
            btnAddClientTrigger.style.display = clientView ? 'none' : 'flex';
        }
        if (btnEmptyAddClient) {
            btnEmptyAddClient.style.display = clientView ? 'none' : 'inline-flex';
        }
        if (btnBackupTrigger) {
            btnBackupTrigger.style.display = clientView ? 'none' : 'flex';
        }
        if (btnProfileTrigger) {
            btnProfileTrigger.style.display = clientView ? 'inline-flex' : 'none';
        }
    }

    async function loadRemoteData() {
        try {
            const session = getSession();
            const query = session && session.clientId
                ? `?clientId=${encodeURIComponent(session.clientId)}`
                : '';
            const result = await apiRequest(`/data${query}`);
            if (result && Array.isArray(result.clients)) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(result.clients));
            }
        } catch (e) {}
    }

    // Set default date
    fieldDate.value = new Date().toISOString().split('T')[0];

    // Init
    await loadRemoteData();
    syncAccessControls();
    renderDashboard();
    renderClientDeck();
    setupFormPrincipalSelector();
    setupModalBindings();
    setupFilterSearchBindings();
    setupFormSubmitBinding();
    setupBackupRestoreBindings();

    window.addEventListener('repaytrack-session-updated', async () => {
        await loadRemoteData();
        syncAccessControls();
        renderDashboard();
        renderClientDeck();
    });

    // ── Toast ──────────────────────────────────

    function showToast(message, type = 'success') {
        const toast = doc.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success'
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-success);"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-danger);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

        toast.innerHTML = `${icon}<span style="font-size: 0.9rem; font-weight: 500;">${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ── Dashboard ─────────────────────────────

    function renderDashboard() {
        const session = getSession();
        const fmt = num => '₹' + num.toLocaleString('en-IN');

        if (session && session.role === 'client' && session.clientId) {
            const clients = getAllClients();
            const client = clients.find(c => c.id === session.clientId);
            if (client) {
                const expected = client.weeklyReturn * client.weeksCount;
                const collected = client.installments.reduce((sum, inst) => {
                    if (inst.status === 'paid') {
                        return sum + (inst.paidAmount !== null ? inst.paidAmount : client.weeklyReturn);
                    }
                    return sum;
                }, 0);
                const remaining = Math.max(0, expected - collected);

                statTotalPrincipal.textContent = fmt(client.principal);
                statTotalExpected.textContent = fmt(expected);
                statTotalCollected.textContent = fmt(collected);
                statRemaining.textContent = fmt(remaining);
                return;
            }
        }

        const stats = getSummaryStats();
        statTotalPrincipal.textContent = fmt(stats.totalPrincipalGiven);
        statTotalExpected.textContent = fmt(stats.totalExpectedReturn);
        statTotalCollected.textContent = fmt(stats.totalCollected);
        statRemaining.textContent = fmt(stats.remainingBalance);
    }

    // ── Client Deck ───────────────────────────

    function renderClientDeck() {
        const clients = getAllClients();
        const todayStr = new Date().toISOString().split('T')[0];
        const session = getSession();
        const allowedClients = session && session.role === 'client' && session.clientId
            ? clients.filter(client => client.id === session.clientId)
            : clients;

        let filtered = allowedClients.filter(client => {
            const query = currentSearch.toLowerCase();
            const matchesSearch =
                client.name.toLowerCase().includes(query) ||
                client.mobile.includes(query) ||
                client.place.toLowerCase().includes(query);

            if (!matchesSearch) return false;

            if (currentFilter === 'all') return true;
            if (currentFilter === 'completed') return client.status === 'completed';
            if (currentFilter === 'active') return client.status === 'active';
            if (currentFilter === 'overdue') {
                if (client.status === 'completed') return false;
                return client.installments.some(inst => inst.status === 'pending' && inst.dueDate < todayStr);
            }
            return true;
        });

        filtered.sort((a, b) => new Date(b.dateGiven) - new Date(a.dateGiven));

        const mainEmptyState = doc.getElementById('main-empty-state');
        deck.querySelectorAll('.client-card').forEach(c => c.remove());

        if (filtered.length === 0) {
            mainEmptyState.style.display = 'flex';
            if (clients.length > 0) {
                mainEmptyState.querySelector('.empty-state-title').textContent = 'No matching clients';
                mainEmptyState.querySelector('.empty-state-desc').textContent = 'Try adjusting your search query or status filter buttons.';
                mainEmptyState.querySelector('#btn-empty-add-client').style.display = 'none';
            } else {
                mainEmptyState.querySelector('.empty-state-title').textContent = 'No client accounts found';
                mainEmptyState.querySelector('.empty-state-desc').textContent = 'Get started by creating a client file and entering their weekly installment details.';
                mainEmptyState.querySelector('#btn-empty-add-client').style.display = 'inline-flex';
            }
        } else {
            mainEmptyState.style.display = 'none';

            filtered.forEach(client => {
                const paidWeeks = client.installments.filter(i => i.status === 'paid').length;
                const progressPct = Math.round((paidWeeks / client.weeksCount) * 100) || 0;
                const isOverdue = client.status === 'active' && client.installments.some(i => i.status === 'pending' && i.dueDate < todayStr);

                let badgeText = 'Active';
                let badgeClass = 'badge-active';
                if (client.status === 'completed') {
                    badgeText = 'Fully Paid';
                    badgeClass = 'badge-completed';
                } else if (isOverdue) {
                    badgeText = 'Overdue';
                    badgeClass = 'badge-overdue';
                }

                const card = doc.createElement('article');
                card.className = 'glass-card client-card';
                card.dataset.id = client.id;

                card.innerHTML = `
                    <div class="client-card-header">
                        <div>
                            <h3 class="client-name">${escapeHtml(client.name)}</h3>
                            <div class="client-place">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                <span>${escapeHtml(client.place)}</span>
                            </div>
                        </div>
                        <span class="badge ${badgeClass}">${badgeText}</span>
                    </div>

                    <div class="client-card-body">
                        <div class="client-meta-row">
                            <span class="meta-label">Principal Given:</span>
                            <span class="meta-value amount">₹${client.principal.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="client-meta-row">
                            <span class="meta-label">Weekly Installment:</span>
                            <span class="meta-value amount" style="color: var(--color-success);">₹${client.weeklyReturn.toLocaleString('en-IN')}/wk</span>
                        </div>
                        <div class="client-meta-row">
                            <span class="meta-label">Date of Loan:</span>
                            <span class="meta-value">${formatDateForDisplay(client.dateGiven)}</span>
                        </div>

                        <div class="client-card-progress">
                            <div class="progress-info">
                                <span>Installments</span>
                                <span>${paidWeeks}/${client.weeksCount} weeks (${progressPct}%)</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-bar" style="width: ${progressPct}%;"></div>
                            </div>
                        </div>
                    </div>

                    <div class="client-card-footer">
                        <a href="tel:${client.mobile}" class="client-phone" onclick="event.stopPropagation();">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            <span>${escapeHtml(client.mobile)}</span>
                        </a>
                        <button class="view-ledger-btn">
                            View Ledger
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                `;

                card.addEventListener('click', () => openDetailsModal(client.id));
                deck.appendChild(card);
            });
        }
    }

    // ── Principal Selector ────────────────────

    function setupFormPrincipalSelector() {
        amountOptionCards.forEach(card => {
            card.addEventListener('click', () => {
                amountOptionCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const amt = Number(card.dataset.amount);
                fieldPrincipal.value = amt;

                const customInput = doc.getElementById('field-custom-amount');
                if (customInput) customInput.value = '';

                lblWeeklyReturnPreview.textContent = `₹${getWeeklyReturnForAmount(amt).toLocaleString('en-IN')}`;
            });
        });

        const customAmountInput = doc.getElementById('field-custom-amount');
        if (customAmountInput) {
            customAmountInput.addEventListener('input', () => {
                const val = Number(customAmountInput.value);
                if (val > 0) {
                    amountOptionCards.forEach(c => c.classList.remove('active'));
                    fieldPrincipal.value = val;
                    lblWeeklyReturnPreview.textContent = `₹${getWeeklyReturnForAmount(val).toLocaleString('en-IN')}`;
                }
            });
        }
    }

    // ── Modal Bindings ────────────────────────

    function setupModalBindings() {
        const openAddClient = () => {
            formClient.reset();
            fieldClientId.value = '';
            clientModalTitle.textContent = 'Register New Loan';

            fieldPrincipal.value = '5000';
            amountOptionCards.forEach(c => c.classList.remove('active'));
            doc.querySelector('#amount-selector [data-amount="5000"]').classList.add('active');
            lblWeeklyReturnPreview.textContent = '₹600';
            const customAmtField = doc.getElementById('field-custom-amount');
            if (customAmtField) customAmtField.value = '';

            fieldDate.value = new Date().toISOString().split('T')[0];
            fieldWeeks.value = 10;
            modalClient.classList.add('active');
        };

        btnAddClientTrigger.addEventListener('click', openAddClient);
        btnEmptyAddClient.addEventListener('click', openAddClient);

        const closeClientForm = () => modalClient.classList.remove('active');
        btnCloseClientModal.addEventListener('click', closeClientForm);
        btnCancelClientForm.addEventListener('click', closeClientForm);

        const closeDetails = () => {
            modalDetails.classList.remove('active');
            activeClientId = null;
        };
        btnCloseDetailsModal.addEventListener('click', closeDetails);
        btnCloseLedger.addEventListener('click', closeDetails);

        if (btnProfileTrigger) {
            btnProfileTrigger.addEventListener('click', () => {
                const session = getSession();
                if (!session || !session.clientId) return;
                const clients = getAllClients();
                const client = clients.find(c => c.id === session.clientId);
                if (!client) return;

                fieldProfileId.value = client.id;
                fieldProfileName.value = client.name;
                fieldProfileMobile.value = client.mobile;
                fieldProfilePlace.value = client.place;
                fieldProfileRemarks.value = client.remarks || '';
                modalProfile.classList.add('active');
            });
        }

        if (btnCloseProfileModal) {
            btnCloseProfileModal.addEventListener('click', () => modalProfile.classList.remove('active'));
        }
        if (btnCancelProfile) {
            btnCancelProfile.addEventListener('click', () => modalProfile.classList.remove('active'));
        }

        if (formProfile) {
            formProfile.addEventListener('submit', (e) => {
                e.preventDefault();
                const id = fieldProfileId.value;
                if (!id) return;

                const updated = updateClient(id, {
                    name: fieldProfileName.value.trim(),
                    mobile: fieldProfileMobile.value.trim(),
                    place: fieldProfilePlace.value.trim(),
                    remarks: fieldProfileRemarks.value.trim()
                });

                if (updated) {
                    const updatedName = fieldProfileName.value.trim();
                    const updatedMobile = fieldProfileMobile.value.trim();

                    const storedSession = getSession();
                    if (storedSession) {
                        storedSession.name = updatedName || storedSession.name;
                        storedSession.mobile = updatedMobile || storedSession.mobile;
                        localStorage.setItem(SESSION_KEY, JSON.stringify(storedSession));
                    }

                    apiRequest('/data', {
                        method: 'POST',
                        body: JSON.stringify({ clients: getAllClients() })
                    }).catch(() => {});

                    modalProfile.classList.remove('active');
                    showToast('Profile updated successfully!');
                    renderDashboard();
                    renderClientDeck();

                    const headerAvatarEl = document.getElementById('header-user-avatar');
                    const headerNameEl = document.getElementById('header-user-name');
                    if (headerAvatarEl) {
                        const initials = (updatedName || 'U')
                            .split(/\s+/)
                            .filter(Boolean)
                            .map(word => word[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                        headerAvatarEl.textContent = initials || 'U';
                    }
                    if (headerNameEl) {
                        const firstName = (updatedName || '').trim().split(/\s+/)[0] || 'User';
                        headerNameEl.textContent = firstName;
                    }
                    if (activeClientId === id) {
                        openDetailsModal(id);
                    }
                }
            });
        }

        btnBackupTrigger.addEventListener('click', () => {
            importFileInput.value = '';
            lblImportStatus.textContent = 'No file selected.';
            btnImportExecute.disabled = true;
            modalBackup.classList.add('active');
        });

        const closeBackup = () => modalBackup.classList.remove('active');
        btnCloseBackupModal.addEventListener('click', closeBackup);
        btnCloseBackup.addEventListener('click', closeBackup);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeClientForm();
                closeDetails();
                closeBackup();
                modalProfile.classList.remove('active');
            }
        });
    }

    // ── Filter & Search ───────────────────────

    function setupFilterSearchBindings() {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.trim();
            renderClientDeck();
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderClientDeck();
            });
        });
    }

    // ── Form Submit ───────────────────────────

    function setupFormSubmitBinding() {
        formClient.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = fieldName.value;
            const mobile = fieldMobile.value;
            const place = fieldPlace.value;
            const dateGiven = fieldDate.value;
            const weeksCount = fieldWeeks.value;
            const principal = fieldPrincipal.value;
            const remarks = fieldRemarks ? fieldRemarks.value : '';
            const editingId = fieldClientId.value;

            if (editingId) {
                updateClient(editingId, { name, mobile, place, dateGiven, weeksCount, principal, remarks });
                showToast('Client records updated successfully!');
            } else {
                addClient({ name, mobile, place, dateGiven, weeksCount, principal, remarks });
                showToast('New client registered successfully!');
            }

            modalClient.classList.remove('active');
            renderDashboard();
            renderClientDeck();

            if (activeClientId === editingId && editingId) {
                openDetailsModal(editingId);
            }
        });
    }

    // ── Detail Ledger Modal ───────────────────

    function openDetailsModal(clientId) {
        const clients = getAllClients();
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const session = getSession();
        const clientView = session && session.role === 'client';
        if (clientView && session.clientId !== clientId) {
            return;
        }

        activeClientId = clientId;
        const todayStr = new Date().toISOString().split('T')[0];

        lblDetailName.textContent = client.name;
        lblDetailMobile.textContent = client.mobile;
        lblDetailMobile.parentElement.setAttribute('href', `tel:${client.mobile}`);
        lblDetailPlace.textContent = client.place;

        const isOverdue = client.status === 'active' && client.installments.some(i => i.status === 'pending' && i.dueDate < todayStr);
        let badgeText = 'Active';
        let badgeClass = 'badge-active';
        if (client.status === 'completed') {
            badgeText = 'Fully Paid';
            badgeClass = 'badge-completed';
        } else if (isOverdue) {
            badgeText = 'Overdue';
            badgeClass = 'badge-overdue';
        }
        lblDetailStatus.textContent = badgeText;
        lblDetailStatus.className = `badge ${badgeClass}`;

        lblDetailPrincipal.textContent = `₹${client.principal.toLocaleString('en-IN')}`;
        lblDetailWeekly.textContent = `₹${client.weeklyReturn.toLocaleString('en-IN')}/wk`;
        lblDetailWeeksCount.textContent = `For ${client.weeksCount} Weeks`;
        lblDetailDate.textContent = `Given: ${formatDateForDisplay(client.dateGiven)}`;
        lblDetailRemarks.textContent = client.remarks || 'No remarks provided.';

        const paidWeeks = client.installments.filter(i => i.status === 'paid').length;
        const paidAmt = client.installments.reduce((sum, inst) => {
            if (inst.status === 'paid') {
                return sum + (inst.paidAmount !== null ? inst.paidAmount : client.weeklyReturn);
            }
            return sum;
        }, 0);
        lblDetailProgressFraction.textContent = `Paid: ${paidWeeks}/${client.weeksCount} weeks (₹${paidAmt.toLocaleString('en-IN')})`;

        detailInstallmentsList.innerHTML = '';
        btnDeleteClient.style.display = clientView ? 'none' : 'inline-flex';
        btnEditClient.style.display = clientView ? 'none' : 'inline-flex';

        client.installments.forEach(inst => {
            const isPastDue = inst.dueDate < todayStr && inst.status === 'pending';
            let rowClass = '';
            if (inst.status === 'paid') rowClass = 'paid';
            else if (isPastDue) rowClass = 'overdue';

            const row = doc.createElement('div');
            row.className = `installment-row ${rowClass}`;

            let paymentMeta = 'Pending';
            if (inst.status === 'paid') {
                const actualAmt = inst.paidAmount || client.weeklyReturn;
                paymentMeta = `Paid on ${formatDateForDisplay(inst.paidDate)} (₹${actualAmt.toLocaleString('en-IN')})`;
            } else if (isPastDue) {
                paymentMeta = 'OVERDUE PAYMENT';
            }

            const actionMarkup = clientView
                ? `<div class="installment-row-right">
                    <span class="installment-amount">₹${(inst.paidAmount || client.weeklyReturn).toLocaleString('en-IN')}</span>
                    <button class="pay-toggle-btn" data-week="${inst.weekIndex}" disabled>
                        View Only
                    </button>
                </div>`
                : `<div class="installment-row-right">
                    <div class="custom-pay-wrapper" style="display: flex; flex-direction: column; gap: 0.35rem; min-width: 180px;">
                        <label style="font-size: 0.75rem; color: var(--text-muted);">Payment Date</label>
                        <input type="date" class="payment-date-input" data-week="${inst.weekIndex}" value="${inst.paidDate || todayStr}">
                    </div>
                    ${inst.status === 'pending' ? `
                        <div class="custom-pay-wrapper">
                            <label style="font-size: 0.75rem; color: var(--text-muted);">Custom Amount:</label>
                            <input type="number" class="custom-pay-input" placeholder="₹${client.weeklyReturn}" data-week="${inst.weekIndex}">
                        </div>
                    ` : ''}
                    <span class="installment-amount">₹${(inst.paidAmount || client.weeklyReturn).toLocaleString('en-IN')}</span>
                    <button class="pay-toggle-btn" data-week="${inst.weekIndex}">
                        ${inst.status === 'paid' ? 'Undo' : 'Mark Paid'}
                    </button>
                </div>`;

            row.innerHTML = `
                <div class="installment-row-left">
                    <div class="installment-week-badge">W${inst.weekIndex}</div>
                    <div class="installment-info">
                        <span class="installment-due-date">Due: ${formatDateForDisplay(inst.dueDate)}</span>
                        <span class="installment-status-desc">${paymentMeta}</span>
                    </div>
                </div>
                ${actionMarkup}
            `;

            if (!clientView) {
                row.querySelector('.pay-toggle-btn').addEventListener('click', (e) => {
                    const weekIdx = Number(e.target.dataset.week);
                    const inputEl = row.querySelector('.custom-pay-input');
                    const dateInputEl = row.querySelector('.payment-date-input');
                    const customVal = inputEl ? inputEl.value.trim() : '';
                    const selectedDate = dateInputEl && dateInputEl.value ? dateInputEl.value : todayStr;

                    if (inst.status === 'pending' && customVal !== '') {
                        recordCustomPayment(clientId, weekIdx, Number(customVal), selectedDate);
                        showToast(`Recorded custom payment of ₹${Number(customVal).toLocaleString('en-IN')} for Week ${weekIdx}`);
                    } else {
                        toggleInstallment(clientId, weekIdx, null, selectedDate);
                        if (inst.status === 'pending') {
                            showToast(`Week ${weekIdx} paid: ₹${client.weeklyReturn.toLocaleString('en-IN')}`);
                        } else {
                            showToast(`Undone payment record for Week ${weekIdx}`);
                        }
                    }

                    openDetailsModal(clientId);
                    renderDashboard();
                    renderClientDeck();
                });

                const inputEl = row.querySelector('.custom-pay-input');
                if (inputEl) {
                    inputEl.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            const val = inputEl.value.trim();
                            const dateInputEl = row.querySelector('.payment-date-input');
                            const selectedDate = dateInputEl && dateInputEl.value ? dateInputEl.value : todayStr;
                            if (val !== '') {
                                recordCustomPayment(clientId, inst.weekIndex, Number(val), selectedDate);
                                showToast(`Recorded custom payment of ₹${Number(val).toLocaleString('en-IN')} for Week ${inst.weekIndex}`);
                                openDetailsModal(clientId);
                                renderDashboard();
                                renderClientDeck();
                            }
                        }
                    });
                }

                const dateInputEl = row.querySelector('.payment-date-input');
                if (dateInputEl) {
                    dateInputEl.addEventListener('change', () => {
                        if (inst.status === 'paid') {
                            const newDate = dateInputEl.value;
                            if (newDate) {
                                toggleInstallment(clientId, inst.weekIndex, 'paid', newDate);
                                openDetailsModal(clientId);
                                renderDashboard();
                                renderClientDeck();
                            }
                        }
                    });
                }
            }

            detailInstallmentsList.appendChild(row);
        });

        modalDetails.classList.add('active');
    }

    // ── Backup & Restore ──────────────────────

    function setupBackupRestoreBindings() {
        btnExportData.addEventListener('click', () => {
            try {
                const dataStr = exportData();
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = doc.createElement('a');
                link.href = url;
                link.download = `repaytrack_backup_${new Date().toISOString().split('T')[0]}.json`;
                link.click();
                URL.revokeObjectURL(url);
                showToast('Backup file downloaded successfully!');
            } catch (e) {
                showToast('Backup export failed!', 'error');
            }
        });

        btnImportTrigger.addEventListener('click', () => importFileInput.click());

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                lblImportStatus.textContent = `Selected: ${file.name}`;
                btnImportExecute.disabled = false;
            } else {
                lblImportStatus.textContent = 'No file selected.';
                btnImportExecute.disabled = true;
            }
        });

        btnImportExecute.addEventListener('click', () => {
            const file = importFileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const success = importData(event.target.result);
                if (success) {
                    showToast('Database restored successfully from backup!');
                    modalBackup.classList.remove('active');
                    renderDashboard();
                    renderClientDeck();
                } else {
                    showToast('Import failed. Invalid file format!', 'error');
                }
            };
            reader.readAsText(file);
        });

        btnResetApp.addEventListener('click', () => {
            const first = confirm('Are you sure you want to delete all client records? This action is permanent.');
            if (first) {
                const second = confirm('Please confirm again. This will erase everything.');
                if (second) {
                    localStorage.removeItem(STORAGE_KEY);
                    showToast('Application reset. All records cleared!', 'error');
                    modalBackup.classList.remove('active');
                    renderDashboard();
                    renderClientDeck();
                }
            }
        });

        btnDeleteClient.addEventListener('click', () => {
            if (!activeClientId) return;
            const clients = getAllClients();
            const client = clients.find(c => c.id === activeClientId);
            if (!client) return;
            if (confirm(`Are you sure you want to permanently delete the records of ${client.name}?`)) {
                deleteClient(activeClientId);
                showToast(`Deleted client folder: ${client.name}`);
                modalDetails.classList.remove('active');
                activeClientId = null;
                renderDashboard();
                renderClientDeck();
            }
        });

        btnEditClient.addEventListener('click', () => {
            if (!activeClientId) return;
            const clients = getAllClients();
            const client = clients.find(c => c.id === activeClientId);
            if (!client) return;

            fieldClientId.value = client.id;
            fieldName.value = client.name;
            fieldMobile.value = client.mobile;
            fieldPlace.value = client.place;
            fieldDate.value = client.dateGiven;
            fieldWeeks.value = client.weeksCount;
            fieldPrincipal.value = client.principal;
            if (fieldRemarks) fieldRemarks.value = client.remarks || '';

            amountOptionCards.forEach(c => c.classList.remove('active'));
            const activeOption = doc.querySelector(`#amount-selector [data-amount="${client.principal}"]`);
            if (activeOption) activeOption.classList.add('active');

            const weekly = getWeeklyReturnForAmount(client.principal);
            lblWeeklyReturnPreview.textContent = `₹${weekly.toLocaleString('en-IN')}`;

            clientModalTitle.textContent = 'Edit Client Ledger';
            modalDetails.classList.remove('active');
            modalClient.classList.add('active');
        });

        btnPrintLedger.addEventListener('click', () => window.print());
    }

    // ── HTML Sanitizer ────────────────────────

    function escapeHtml(str) {
        if (!str) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return str.replace(/[&<>"']/g, m => map[m]);
    }
});

// js/app.js

import {
    getAllClients,
    addClient,
    updateClient,
    toggleInstallment,
    recordCustomPayment,
    deleteClient,
    getSummaryStats,
    exportData,
    importData,
    getWeeklyReturnForAmount
} from './storage.js';

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
const amountOptionCards = doc.querySelectorAll('#amount-selector .amount-option-card');
const lblWeeklyReturnPreview = doc.getElementById('lbl-weekly-return-preview');
const fieldRemarks = doc.getElementById('field-remarks');
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

// Toast Notification container
const toastContainer = doc.getElementById('toast-container');

// State Variables
let currentFilter = 'all';
let currentSearch = '';
let activeClientId = null; // Track client being inspected

function formatDateForDisplay(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

// Initialize App
doc.addEventListener('DOMContentLoaded', () => {
    // Set default date in client form to today
    fieldDate.value = new Date().toISOString().split('T')[0];

    // Render components
    renderDashboard();
    renderClientDeck();

    // Event Bindings
    setupFormPrincipalSelector();
    setupModalBindings();
    setupFilterSearchBindings();
    setupFormSubmitBinding();
    setupBackupRestoreBindings();
});

/**
 * Toast Notification System
 */
function showToast(message, type = 'success') {
    const toast = doc.createElement('div');
    toast.className = `toast ${type}`;
    
    // Select icon based on type
    const icon = type === 'success' ? 
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-success);"><polyline points="20 6 9 17 4 12"/></svg>` : 
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-danger);"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    toast.innerHTML = `
        ${icon}
        <span style="font-size: 0.9rem; font-weight: 500;">${message}</span>
    `;

    toastContainer.appendChild(toast);
    
    // Trigger slide up
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-destroy after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Render Dashboard Stats
 */
function renderDashboard() {
    const stats = getSummaryStats();
    
    // Formatting helper
    const fmt = num => '₹' + num.toLocaleString('en-IN');

    statTotalPrincipal.textContent = fmt(stats.totalPrincipalGiven);
    statTotalExpected.textContent = fmt(stats.totalExpectedReturn);
    statTotalCollected.textContent = fmt(stats.totalCollected);
    statRemaining.textContent = fmt(stats.remainingBalance);
}

/**
 * Render Clients Card Deck
 */
function renderClientDeck() {
    const clients = getAllClients();
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter and search
    let filtered = clients.filter(client => {
        // Search filter
        const query = currentSearch.toLowerCase();
        const matchesSearch = 
            client.name.toLowerCase().includes(query) ||
            client.mobile.includes(query) ||
            client.place.toLowerCase().includes(query);

        if (!matchesSearch) return false;

        // Status filter
        if (currentFilter === 'all') return true;
        if (currentFilter === 'completed') return client.status === 'completed';
        
        // Active Filter
        if (currentFilter === 'active') return client.status === 'active';

        // Overdue Filter
        if (currentFilter === 'overdue') {
            if (client.status === 'completed') return false;
            // Check if any pending installment is past due date
            return client.installments.some(inst => inst.status === 'pending' && inst.dueDate < todayStr);
        }

        return true;
    });

    // Sort: newest loans first
    filtered.sort((a, b) => new Date(b.dateGiven) - new Date(a.dateGiven));

    // Clear previous deck content except the empty state template
    const mainEmptyState = doc.getElementById('main-empty-state');
    
    // Select all cards and remove them
    const existingCards = deck.querySelectorAll('.client-card');
    existingCards.forEach(c => c.remove());

    if (filtered.length === 0) {
        mainEmptyState.style.display = 'flex';
        // Adjust empty state description based on search/filter context
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
            // Count paid installments
            const paidWeeks = client.installments.filter(i => i.status === 'paid').length;
            const progressPct = Math.round((paidWeeks / client.weeksCount) * 100) || 0;
            
            // Check if client is overdue
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

            // Create client card element
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

            // Card click registers opening detail modal
            card.addEventListener('click', () => {
                openDetailsModal(client.id);
            });

            deck.appendChild(card);
        });
    }
}

/**
 * Setup custom selector for principal choice in loan registration form
 */
function setupFormPrincipalSelector() {
    amountOptionCards.forEach(card => {
        card.addEventListener('click', () => {
            amountOptionCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const amt = Number(card.dataset.amount);
            fieldPrincipal.value = amt;
            
            // Clear custom input if present
            const customInput = doc.getElementById('field-custom-amount');
            if (customInput) customInput.value = '';
            
            const weeklyReturn = getWeeklyReturnForAmount(amt);
            lblWeeklyReturnPreview.textContent = `₹${weeklyReturn.toLocaleString('en-IN')}`;
        });
    });

    // Custom amount input live update
    const customAmountInput = doc.getElementById('field-custom-amount');
    if (customAmountInput) {
        customAmountInput.addEventListener('input', () => {
            const val = Number(customAmountInput.value);
            if (val > 0) {
                // Deactivate preset tiles
                amountOptionCards.forEach(c => c.classList.remove('active'));
                fieldPrincipal.value = val;
                const weeklyReturn = getWeeklyReturnForAmount(val);
                lblWeeklyReturnPreview.textContent = `₹${weeklyReturn.toLocaleString('en-IN')}`;
            }
        });
    }
}

/**
 * Dialog Modal visibility triggers
 */
function setupModalBindings() {
    // Open Register modal
    const openAddClient = () => {
        // Reset form details for a new entry
        formClient.reset();
        fieldClientId.value = '';
        clientModalTitle.textContent = 'Register New Loan';
        
        // Reset principal choices to standard 5000
        fieldPrincipal.value = '5000';
        amountOptionCards.forEach(c => c.classList.remove('active'));
        doc.querySelector('#amount-selector [data-amount="5000"]').classList.add('active');
        lblWeeklyReturnPreview.textContent = '₹600';
        const customAmtField = doc.getElementById('field-custom-amount');
        if (customAmtField) customAmtField.value = '';
        
        // Set date to today
        fieldDate.value = new Date().toISOString().split('T')[0];
        
        // Default weeks to 10
        fieldWeeks.value = 10;
        
        modalClient.classList.add('active');
    };

    btnAddClientTrigger.addEventListener('click', openAddClient);
    btnEmptyAddClient.addEventListener('click', openAddClient);

    // Cancel / Close client form modal
    const closeClientForm = () => modalClient.classList.remove('active');
    btnCloseClientModal.addEventListener('click', closeClientForm);
    btnCancelClientForm.addEventListener('click', closeClientForm);

    // Close details modal
    const closeDetails = () => {
        modalDetails.classList.remove('active');
        activeClientId = null;
    };
    btnCloseDetailsModal.addEventListener('click', closeDetails);
    btnCloseLedger.addEventListener('click', closeDetails);

    // Backup triggers
    btnBackupTrigger.addEventListener('click', () => {
        // Reset backup labels
        importFileInput.value = '';
        lblImportStatus.textContent = 'No file selected.';
        btnImportExecute.disabled = true;
        modalBackup.classList.add('active');
    });

    const closeBackup = () => modalBackup.classList.remove('active');
    btnCloseBackupModal.addEventListener('click', closeBackup);
    btnCloseBackup.addEventListener('click', closeBackup);

    // Escape Key binds to close overlays
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeClientForm();
            closeDetails();
            closeBackup();
        }
    });
}

/**
 * Filter list and live search events
 */
function setupFilterSearchBindings() {
    // Search input typing
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim();
        renderClientDeck();
    });

    // Filter toggles
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentFilter = btn.dataset.filter;
            renderClientDeck();
        });
    });
}

/**
 * Client registration form submit handler
 */
function setupFormSubmitBinding() {
    formClient.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = fieldName.value;
        const mobile = fieldMobile.value;
        const place = fieldPlace.value;
        const dateGiven = fieldDate.value;
        const weeksCount = fieldWeeks.value;
        const principal = fieldPrincipal.value;
        const remarks = fieldRemarks.value;
        const editingId = fieldClientId.value;

        if (editingId) {
            // Edit mode
            updateClient(editingId, {
                name,
                mobile,
                place,
                dateGiven,
                weeksCount,
                principal,
                remarks
            });
            showToast('Client records updated successfully!');
        } else {
            // Add mode
            addClient({
                name,
                mobile,
                place,
                dateGiven,
                weeksCount,
                principal,
                remarks
            });
            showToast('New client registered successfully!');
        }

        // Close and clean up
        modalClient.classList.remove('active');
        renderDashboard();
        renderClientDeck();
        
        // If details modal was open for this client, refresh it
        if (activeClientId === editingId && editingId) {
            openDetailsModal(editingId);
        }
    });
}

/**
 * Opens detailed ledger file modal for a specific client.
 */
function openDetailsModal(clientId) {
    const clients = getAllClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    activeClientId = clientId;
    const todayStr = new Date().toISOString().split('T')[0];

    // Populates information text
    lblDetailName.textContent = client.name;
    lblDetailMobile.textContent = client.mobile;
    lblDetailMobile.parentElement.setAttribute('href', `tel:${client.mobile}`);
    lblDetailPlace.textContent = client.place;
    
    // Status Badge check
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

    // Progress metrics calculation
    const paidWeeks = client.installments.filter(i => i.status === 'paid').length;
    const paidAmt = client.installments.reduce((sum, inst) => {
        if (inst.status === 'paid') {
            return sum + (inst.paidAmount !== null ? inst.paidAmount : client.weeklyReturn);
        }
        return sum;
    }, 0);
    lblDetailProgressFraction.textContent = `Paid: ${paidWeeks}/${client.weeksCount} weeks (₹${paidAmt.toLocaleString('en-IN')})`;

    // Installments list items render
    detailInstallmentsList.innerHTML = '';

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

        row.innerHTML = `
            <div class="installment-row-left">
                <div class="installment-week-badge">W${inst.weekIndex}</div>
                <div class="installment-info">
                    <span class="installment-due-date">Due: ${formatDateForDisplay(inst.dueDate)}</span>
                    <span class="installment-status-desc">${paymentMeta}</span>
                </div>
            </div>
            
            <div class="installment-row-right">
                <!-- Custom amount entry if pending, otherwise showing final paid amount -->
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
            </div>
        `;

        // Toggle handler
        row.querySelector('.pay-toggle-btn').addEventListener('click', (e) => {
            const weekIdx = Number(e.target.dataset.week);
            
            // Check if there is a custom payment value in the input box
            const inputEl = row.querySelector('.custom-pay-input');
            const customVal = inputEl ? inputEl.value.trim() : '';
            
            if (inst.status === 'pending' && customVal !== '') {
                // Record custom payment instead of standard toggle
                recordCustomPayment(clientId, weekIdx, Number(customVal));
                showToast(`Recorded custom payment of ₹${Number(customVal).toLocaleString('en-IN')} for Week ${weekIdx}`);
            } else {
                toggleInstallment(clientId, weekIdx);
                if (inst.status === 'pending') { // Evaluates state before trigger
                    showToast(`Week ${weekIdx} paid: ₹${client.weeklyReturn.toLocaleString('en-IN')}`);
                } else {
                    showToast(`Undone payment record for Week ${weekIdx}`);
                }
            }
            
            // Re-render
            openDetailsModal(clientId);
            renderDashboard();
            renderClientDeck();
        });

        // Custom amount input keypress triggers
        const inputEl = row.querySelector('.custom-pay-input');
        if (inputEl) {
            inputEl.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const val = inputEl.value.trim();
                    if (val !== '') {
                        recordCustomPayment(clientId, inst.weekIndex, Number(val));
                        showToast(`Recorded custom payment of ₹${Number(val).toLocaleString('en-IN')} for Week ${inst.weekIndex}`);
                        openDetailsModal(clientId);
                        renderDashboard();
                        renderClientDeck();
                    }
                }
            });
        }

        detailInstallmentsList.appendChild(row);
    });

    modalDetails.classList.add('active');
}

/**
 * Backup and recovery button linkages
 */
function setupBackupRestoreBindings() {
    // Export Backup File Download
    btnExportData.addEventListener('click', () => {
        try {
            const dataStr = exportData();
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = doc.createElement('a');
            link.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            link.download = `repaytrack_backup_${dateStr}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
            showToast('Backup file downloaded successfully!');
        } catch (e) {
            showToast('Backup export failed!', 'error');
        }
    });

    // Trigger file chooser
    btnImportTrigger.addEventListener('click', () => {
        importFileInput.click();
    });

    // Select file trigger
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

    // Upload and restore file execute
    btnImportExecute.addEventListener('click', () => {
        const file = importFileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const jsonText = event.target.result;
            const success = importData(jsonText);
            
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

    // Factory Reset Data
    btnResetApp.addEventListener('click', () => {
        const firstConfirm = confirm('Are you sure you want to delete all client records? This action is permanent.');
        if (firstConfirm) {
            const secondConfirm = confirm('Please confirm again. Type "ok" to erase everything.');
            if (secondConfirm) {
                localStorage.removeItem('installment_tracker_data');
                showToast('Application reset. All records cleared!', 'error');
                modalBackup.classList.remove('active');
                renderDashboard();
                renderClientDeck();
            }
        }
    });

    // Details Modal specific: Delete Client Account
    btnDeleteClient.addEventListener('click', () => {
        if (!activeClientId) return;
        
        const clients = getAllClients();
        const client = clients.find(c => c.id === activeClientId);
        if (!client) return;

        const confirmDelete = confirm(`Are you sure you want to permanently delete the records of ${client.name}?`);
        if (confirmDelete) {
            deleteClient(activeClientId);
            showToast(`Deleted client folder: ${client.name}`);
            modalDetails.classList.remove('active');
            activeClientId = null;
            renderDashboard();
            renderClientDeck();
        }
    });

    // Details Modal specific: Edit Client Details
    btnEditClient.addEventListener('click', () => {
        if (!activeClientId) return;
        
        const clients = getAllClients();
        const client = clients.find(c => c.id === activeClientId);
        if (!client) return;

        // Fill form fields
        fieldClientId.value = client.id;
        fieldName.value = client.name;
        fieldMobile.value = client.mobile;
        fieldPlace.value = client.place;
        fieldDate.value = client.dateGiven;
        fieldWeeks.value = client.weeksCount;
        fieldPrincipal.value = client.principal;
        fieldRemarks.value = client.remarks || '';

        // Preset amount selection
        amountOptionCards.forEach(c => c.classList.remove('active'));
        const activeOption = doc.querySelector(`#amount-selector [data-amount="${client.principal}"]`);
        if (activeOption) {
            activeOption.classList.add('active');
        }
        
        const weekly = getWeeklyReturnForAmount(client.principal);
        lblWeeklyReturnPreview.textContent = `₹${weekly.toLocaleString('en-IN')}`;
        
        clientModalTitle.textContent = 'Edit Client Ledger';
        
        // Hide details and show form modal
        modalDetails.classList.remove('active');
        modalClient.classList.add('active');
    });

    // Print Receipt Ledger
    btnPrintLedger.addEventListener('click', () => {
        window.print();
    });
}

/**
 * Simple HTML sanitizer
 */
function escapeHtml(str) {
    if (!str) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, function(m) { return map[m]; });
}

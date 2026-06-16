// js/storage.js

export const STORAGE_KEY = 'installment_tracker_data';

// Auto-calculation mapping
export const RATE_MAP = {
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
export function getWeeklyReturnForAmount(principal) {
    const amount = Number(principal);
    if (RATE_MAP[amount] !== undefined) {
        return RATE_MAP[amount];
    }
    return Math.round(amount * 0.12);
}

/**
 * Adds weeks to a given ISO date string.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} weeks 
 * @returns {string} - YYYY-MM-DD
 */
export function addWeeksToDate(dateStr, weeks) {
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
export function generateInstallments(startDate, weeklyReturn, weeksCount) {
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
export function getAllClients() {
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
export function saveClients(clients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

/**
 * Adds a new client to the records.
 */
export function addClient({ name, mobile, place, dateGiven, principal, weeksCount = 10, remarks = '' }) {
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
export function updateClient(id, updatedFields) {
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
                // Keep the old installment but update its due date based on potentially new start date
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
export function toggleInstallment(clientId, weekIndex, forceStatus = null) {
    const clients = getAllClients();
    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) return null;

    const client = clients[index];
    const instIndex = client.installments.findIndex(inst => inst.weekIndex === weekIndex);
    if (instIndex === -1) return null;

    const installment = client.installments[instIndex];
    const newStatus = forceStatus !== null ? forceStatus : (installment.status === 'paid' ? 'pending' : 'paid');

    if (newStatus === 'paid') {
        installment.status = 'paid';
        installment.paidDate = new Date().toISOString().split('T')[0];
        // If not already set with a custom amount, default to the weekly return amount
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
export function recordCustomPayment(clientId, weekIndex, amount) {
    const clients = getAllClients();
    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) return null;

    const client = clients[index];
    const instIndex = client.installments.findIndex(inst => inst.weekIndex === weekIndex);
    if (instIndex === -1) return null;

    const installment = client.installments[instIndex];
    const numAmount = Number(amount);

    if (numAmount > 0) {
        installment.status = 'paid';
        installment.paidAmount = numAmount;
        installment.paidDate = installment.paidDate || new Date().toISOString().split('T')[0];
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
export function deleteClient(id) {
    const clients = getAllClients();
    const filtered = clients.filter(c => c.id !== id);
    saveClients(filtered);
    return filtered;
}

/**
 * Calculates dashboard-wide statistics.
 */
export function getSummaryStats() {
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
            // Expected is the sum of target amounts for all installments
            const instTarget = client.weeklyReturn; 
            clientExpected += instTarget;

            if (inst.status === 'paid') {
                clientCollected += (inst.paidAmount !== null ? inst.paidAmount : instTarget);
            } else {
                // If it is pending AND the due date has passed today, it's overdue
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
export function exportData() {
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
export function importData(jsonStr) {
    try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && Array.isArray(parsed.clients)) {
            // Basic validation
            const isValid = parsed.clients.every(c => c.id && c.name && Array.isArray(c.installments));
            if (isValid) {
                saveClients(parsed.clients);
                return true;
            }
        }
        // Check if raw array was exported
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

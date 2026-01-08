/* ==============================================
   API.JS - API-Aufrufe, Datensynchronisation
   ============================================== */

// API-Call Funktion
async function apiCall(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (typeof currentVariantId !== 'undefined' && currentVariantId) {
        headers['X-Variant-ID'] = currentVariantId.toString();
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers
        });
        
        return response;
    } catch (error) {
        console.error('API-Fehler:', error);
        if (typeof showToast === 'function') {
            showToast('Netzwerkfehler - Server nicht erreichbar', 'error');
        }
        throw error;
    }
}

// Varianten laden
async function loadVariants() {
    try {
        const response = await apiCall('/api/variants');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        variants = await response.json();
        console.log('Varianten geladen:', variants);
    } catch (e) {
        console.error('Fehler beim Laden der Varianten:', e);
        throw e;
    }
}

// Daten von API laden
async function loadFromAPI() {
    if (!currentVariantId) {
        console.warn('Keine Variante ausgewählt');
        return;
    }
    
    try {
        const response = await apiCall(`/api/data?variantId=${currentVariantId}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        // Daten in appData übernehmen
        appData.events = data.events || [];
        appData.pool = data.pool || [];
        appData.employees = data.employees || [];
        appData.tours = data.tours || [{id:'t1', name:'Tour 1'}, {id:'t2', name:'Tour 2'}];
        appData.wageSettings = data.wageSettings || JSON.parse(JSON.stringify(DEFAULT_WAGE_SETTINGS));
        appData.favorites = data.favorites || [];
        
        // Daten bereinigen
        if (typeof migrateZoneNames === 'function') migrateZoneNames();
        if (typeof cleanupInvalidEvents === 'function') cleanupInvalidEvents();
        if (typeof ensureAppDataDefaults === 'function') ensureAppDataDefaults();
        
        console.log('Daten von API geladen');
        return data;
    } catch (e) {
        console.error('Fehler beim Laden von API:', e);
        throw e;
    }
}

// Daten an API speichern
async function saveToAPI() {
    if (!currentVariantId) {
        console.warn('Keine Variante ausgewählt, speichern nicht möglich');
        return false;
    }
    
    try {
        const eventsToSave = appData.events || [];
        const response = await apiCall(`/api/data?variantId=${currentVariantId}`, {
            method: 'PUT',
            body: JSON.stringify({
                events: eventsToSave,
                pool: appData.pool || [],
                employees: appData.employees || [],
                tours: appData.tours || [],
                wageSettings: appData.wageSettings || DEFAULT_WAGE_SETTINGS,
                favorites: appData.favorites || []
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // Status aktualisieren
        updateLastSaveDisplay();
        updateFileStatus('Gespeichert');
        
        return true;
    } catch (e) {
        console.error('Fehler beim Speichern:', e);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Speichern', 'error');
        }
        return false;
    }
}

// Debounced Speichern
let saveTimeout = null;
function queueSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveToAPI();
    }, SAVE_DEBOUNCE_MS);
}

// Speicher-Status aktualisieren
function updateLastSaveDisplay() {
    const display = document.getElementById('lastSaveDisplay');
    if (display) {
        const now = new Date();
        display.textContent = `💾 Zuletzt: ${now.toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})}`;
    }
}

function updateFileStatus(status) {
    const el = document.getElementById('fileStatus');
    if (el) {
        el.textContent = `Status: ${status}`;
    }
}

// Variante wechseln
async function switchVariant(variantId) {
    if (!variantId) return;
    
    currentVariantId = parseInt(variantId);
    
    try {
        await loadFromAPI();
        if (typeof refreshUI === 'function') refreshUI();
        if (typeof showToast === 'function') {
            const variant = variants.find(v => v.id === currentVariantId);
            showToast(`Variante "${variant?.name || variantId}" geladen`, 'success');
        }
    } catch (e) {
        console.error('Fehler beim Laden der Variante:', e);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Laden der Variante', 'error');
        }
    }
}

// Neue Variante erstellen
async function createVariant(name) {
    if (!name || !name.trim()) {
        if (typeof showToast === 'function') {
            showToast('Bitte einen Namen eingeben', 'warning');
        }
        return null;
    }
    
    try {
        const response = await apiCall('/api/variants', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const newVariant = await response.json();
        variants.push(newVariant);
        
        if (typeof updateVariantSelect === 'function') updateVariantSelect();
        if (typeof showToast === 'function') {
            showToast(`Variante "${name}" erstellt`, 'success');
        }
        
        return newVariant;
    } catch (e) {
        console.error('Fehler beim Erstellen der Variante:', e);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Erstellen der Variante', 'error');
        }
        return null;
    }
}

// Variante duplizieren
async function duplicateVariant(sourceVariantId, newName) {
    if (!sourceVariantId) {
        if (typeof showToast === 'function') {
            showToast('Keine Variante zum Duplizieren ausgewählt', 'error');
        }
        return null;
    }
    
    try {
        const response = await apiCall('/api/variants/duplicate', {
            method: 'POST',
            body: JSON.stringify({ 
                sourceVariantId: sourceVariantId, 
                newName: newName 
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const newVariant = await response.json();
        await loadVariants();
        
        if (typeof updateVariantSelect === 'function') updateVariantSelect();
        if (typeof showToast === 'function') {
            showToast(`Variante "${newName}" erstellt`, 'success');
        }
        
        return newVariant;
    } catch (e) {
        console.error('Fehler beim Duplizieren:', e);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Duplizieren der Variante', 'error');
        }
        return null;
    }
}

// Variante löschen
async function deleteVariant(variantId) {
    if (!variantId) return false;
    
    try {
        const response = await apiCall(`/api/variants/${variantId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        variants = variants.filter(v => v.id !== variantId);
        
        if (typeof updateVariantSelect === 'function') updateVariantSelect();
        if (typeof showToast === 'function') {
            showToast('Variante gelöscht', 'success');
        }
        
        return true;
    } catch (e) {
        console.error('Fehler beim Löschen der Variante:', e);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Löschen der Variante', 'error');
        }
        return false;
    }
}


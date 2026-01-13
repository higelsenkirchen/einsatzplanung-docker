/* ==============================================
   APP.JS - Hauptinitialisierung und globale State
   ============================================== */

// Globaler App-State
let currentView = 'week';
let currentAdminTab = 'tours';
let currentCompareDayIndex = 0;
let currentVariantId = null;
let variants = [];
let appData = { 
    events: [], 
    pool: [], 
    employees: [], 
    tours: [{id:'t1', name:'Tour 1'}, {id:'t2', name:'Tour 2'}],
    wageSettings: JSON.parse(JSON.stringify(DEFAULT_WAGE_SETTINGS)),
    favorites: []
};
let currentEvent, fileHandle;
let undoStack = [];
let searchTerm = '';
let selectedEvents = new Set();
let typeFilter = 'all';
let zoomLevel = 15;
let overallDayFilter = [0, 1, 2, 3, 4, 5, 6];
let overallTourFilter = [];

// Undo-State speichern
function saveUndoState() {
    const state = JSON.stringify(appData);
    undoStack.push(state);
    if (undoStack.length > UNDO_STACK_MAX_SIZE) undoStack.shift();
}

// Undo ausführen
function undo() {
    if (undoStack.length === 0) {
        showToast('Nichts zum Rückgängig machen', 'warning');
        return;
    }
    
    const state = undoStack.pop();
    appData = JSON.parse(state);
    
    if (typeof queueSave === 'function') queueSave();
    if (typeof refreshUI === 'function') refreshUI();
    
    showToast('Rückgängig gemacht', 'success');
}

// AppData-Defaults sicherstellen
function ensureAppDataDefaults() {
    if (!appData.pool) appData.pool = [];
    if (!appData.events) appData.events = [];
    if (!appData.tours || appData.tours.length === 0) {
        appData.tours = [{id:'t1', name:'Tour 1'}, {id:'t2', name:'Tour 2'}];
    }
    if (!appData.employees) appData.employees = [];
    if (!appData.wageSettings) {
        appData.wageSettings = JSON.parse(JSON.stringify(DEFAULT_WAGE_SETTINGS));
    }
    if (!appData.favorites) appData.favorites = [];
    return appData;
}

// Zone-Namen migrieren
function migrateZoneNames() {
    let changed = false;
    
    if (appData.events) {
        appData.events.forEach(evt => {
            if (evt.extendedProps?.zone === 'Altstadt' || evt.extendedProps?.zone === 'Neustadt') {
                evt.extendedProps.zone = 'Alt-/Neustadt';
                changed = true;
            }
        });
    }
    
    if (appData.pool) {
        appData.pool.forEach(item => {
            if (item.zone === 'Altstadt' || item.zone === 'Neustadt') {
                item.zone = 'Alt-/Neustadt';
                changed = true;
            }
        });
    }
    
    if (appData.employees) {
        appData.employees.forEach(emp => {
            if (emp.homeZone === 'Altstadt' || emp.homeZone === 'Neustadt') {
                emp.homeZone = 'Alt-/Neustadt';
                changed = true;
            }
        });
    }
    
    if (changed) {
        if (typeof queueSave === 'function') queueSave();
        console.log('Zonen migriert: Altstadt/Neustadt → Alt-/Neustadt');
    }
}

// Ungültige Events entfernen
function cleanupInvalidEvents() {
    if (!appData.events) return;
    
    const initialCount = appData.events.length;
    appData.events = appData.events.filter(evt => {
        return evt && 
               evt.dayIndex !== undefined && 
               evt.dayIndex >= 0 && 
               evt.dayIndex <= 6;
    });
    
    const removedCount = initialCount - appData.events.length;
    if (removedCount > 0) {
        console.log(`${removedCount} veraltete Einsätze ohne gültigen dayIndex wurden entfernt`);
        if (typeof queueSave === 'function') queueSave();
    }
}

// Varianten-Select aktualisieren
function updateVariantSelect() {
    const select = document.getElementById('variantSelect');
    if (!select) return;
    
    select.innerHTML = '';
    variants.forEach(variant => {
        const option = document.createElement('option');
        option.value = variant.id;
        option.textContent = variant.name;
        if (variant.id === currentVariantId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// Tour-Mitarbeiter-Anzeige aktualisieren
function updateTourEmployeeDisplay() {
    const display = document.getElementById('tourEmployeeDisplay');
    const tourSelect = document.getElementById('tourSelect');
    if (!display || !tourSelect) return;
    
    const selectedTourId = tourSelect.value;
    if (!selectedTourId) {
        display.style.display = 'none';
        return;
    }
    
    const tour = appData.tours.find(t => t.id === selectedTourId);
    if (tour && tour.employeeId) {
        const employee = appData.employees.find(e => e.id === tour.employeeId);
        if (employee) {
            display.textContent = `👤 ${employee.name}`;
            display.style.display = 'inline-block';
            return;
        }
    }
    
    display.style.display = 'none';
}

// Zoom setzen
function setZoom(level) {
    zoomLevel = level;
    document.getElementById('btnZoom15')?.classList.toggle('active', level === 15);
    document.getElementById('btnZoom5')?.classList.toggle('active', level === 5);
    if (typeof refreshView === 'function') refreshView();
}

// Zonen befüllen
function populateZones() { 
    ['poolZone','eventZone'].forEach(id => { 
        const s = document.getElementById(id); 
        if (!s) return;
        s.innerHTML = ''; 
        CITY_ZONES.forEach(z => {
            const o = document.createElement('option');
            o.value = z;
            o.text = getZoneWithPostalCode(z);
            s.add(o);
        });
    }); 
}

function populatePoolZoneFilter() {
    const filter = document.getElementById('poolZoneFilter');
    if (!filter) return;
    filter.innerHTML = '<option value="">Alle Zonen</option>';
    CITY_ZONES.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = getZoneWithPostalCode(z);
        filter.appendChild(opt);
    });
}

// Wage Settings sicherstellen
function ensureWageSettings() {
    if (!appData.wageSettings) {
        appData.wageSettings = JSON.parse(JSON.stringify(DEFAULT_WAGE_SETTINGS));
    }
    if (!appData.wageSettings.wageGroups) {
        appData.wageSettings.wageGroups = DEFAULT_WAGE_SETTINGS.wageGroups.slice();
    }
}

// Variante duplizieren (Handler)
async function handleDuplicateVariant(sourceId) {
    const name = prompt('Name für die neue Variante:', 'Kopie');
    if (name) {
        await duplicateVariant(sourceId, name);
    }
}

// Globaler Error-Handler
window.addEventListener('error', (event) => {
    console.error('Unerwarteter Fehler:', event.error);
    showToast('Ein Fehler ist aufgetreten. Bitte Seite neu laden.', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unbehandelte Promise-Rejection:', event.reason);
    showToast('Ein Fehler ist aufgetreten', 'error');
});

// App initialisieren
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App wird initialisiert...');
    
    // Theme initialisieren
    initTheme();
    
    // Zonen-Selects befüllen
    populateZones();
    populatePoolZoneFilter();
    
    // Zone-Legende rendern (wenn Funktion existiert)
    if (typeof renderZoneLegend === 'function') {
        renderZoneLegend();
    }
    
    // Varianten laden
    try {
        await loadVariants();
        if (variants.length > 0 && !currentVariantId) {
            currentVariantId = variants[0].id;
        }
        updateVariantSelect();
    } catch (e) {
        console.error('Fehler beim Laden der Varianten:', e);
        showToast('Fehler beim Laden der Varianten', 'error');
    }
    
    // Daten von API laden
    if (currentVariantId) {
        try {
            await loadFromAPI();
        } catch (e) {
            console.error('Fehler beim Laden der Daten:', e);
            showToast('Fehler beim Laden der Daten vom Server', 'error');
            appData = {
                events: [],
                pool: [],
                employees: [],
                tours: [{id:'t1', name:'Tour 1'}, {id:'t2', name:'Tour 2'}],
                wageSettings: JSON.parse(JSON.stringify(DEFAULT_WAGE_SETTINGS)),
                favorites: []
            };
        }
    }
    
    // Templates und Filter-Presets laden
    await loadTemplatesFromStorage();
    await loadFilterPresetsFromStorage();
    
    // UI aktualisieren
    if (typeof refreshUI === 'function') {
        refreshUI();
    }
    
    // View initialisieren
    if (typeof switchView === 'function') {
        switchView(currentView || 'week');
    } else if (typeof refreshView === 'function') {
        refreshView();
    }
    
    console.log('App initialisiert');
});



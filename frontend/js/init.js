/* ==============================================
   INIT.JS - Hauptinitialisierung der App
   ============================================== */

// Debounced-Versionen für Performance-Optimierung (nach dem Laden aller Scripts)
let debouncedRenderPool = null;
let debouncedRefreshView = null;
let debouncedRenderCustomerList = null;

// Initialisiere Debounced-Funktionen
function initDebouncedFunctions() {
    if (typeof debounce !== 'undefined') {
        if (typeof renderPool === 'function') {
            debouncedRenderPool = debounce(renderPool, 300);
        }
        if (typeof refreshView === 'function') {
            debouncedRefreshView = debounce(refreshView, 300);
        }
        if (typeof renderCustomerList === 'function') {
            debouncedRenderCustomerList = debounce(renderCustomerList, 300);
        }
    }
}

// Haupt-Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', async () => {
    // Initialisiere Debounced-Funktionen nach dem Laden aller Scripts
    initDebouncedFunctions();
    
    initTheme();
    populateZones();
    populatePoolZoneFilter();
    if (typeof renderZoneLegend === 'function') {
        renderZoneLegend();
    }
    
    
    // Mobile Menu Button
    addMobileMenuButton();
    window.addEventListener('resize', addMobileMenuButton);
    
    // Lade Varianten und setze Standard-Variante
    try {
        await loadVariants();
        if (typeof variants !== 'undefined' && variants.length > 0 && (!currentVariantId || currentVariantId === null)) {
            currentVariantId = variants[0].id;
        }
        if (typeof updateVariantSelect === 'function') updateVariantSelect();
    } catch(e) {
        console.error('Fehler beim Laden der Varianten:', e);
        if (typeof showToast === 'function') showToast('Fehler beim Laden der Varianten', 'error');
    }
    
    // Load data from API
    if (typeof currentVariantId !== 'undefined' && currentVariantId) {
    try {
        await loadFromAPI();
    } catch(e) {
        console.error('Fehler beim Laden der Daten:', e);
        if (typeof showToast === 'function') showToast('Fehler beim Laden der Daten vom Server', 'error');
        // Fallback: use empty data structure
        if (typeof appData !== 'undefined') {
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
    }
    
    if (typeof loadTemplatesFromStorage === 'function') await loadTemplatesFromStorage();
    if (typeof loadFilterPresetsFromStorage === 'function') await loadFilterPresetsFromStorage();
    if (typeof refreshUI === 'function') refreshUI(); // Hier wird renderPool() aufgerufen
    if (typeof updatePatientList === 'function') updatePatientList();
    if (typeof renderFilterPresetSelect === 'function') renderFilterPresetSelect();
    // HINWEIS: switchView wird im späteren DOMContentLoaded Handler aufgerufen,
    // nachdem refreshView definiert wurde (siehe weiter unten im Code)
});

// Initialisiere View am Ende des Scripts (wenn DOM bereits geladen)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (typeof switchView === 'function' && typeof refreshView === 'function' && typeof currentView !== 'undefined') {
            switchView(currentView || 'week');
        }
    }, 50);
} else {
    // Falls DOM noch nicht geladen, warte darauf
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof switchView === 'function' && typeof refreshView === 'function' && typeof currentView !== 'undefined') {
                switchView(currentView || 'week');
            }
        }, 50);
    });
}

/* ==============================================
   INIT.JS - Hauptinitialisierung der App
   ============================================== */

// Haupt-Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    populateZones();
    populatePoolZoneFilter();
    renderZoneLegend();
    
    
    // Mobile Menu Button
    addMobileMenuButton();
    window.addEventListener('resize', addMobileMenuButton);
    
    // Lade Varianten und setze Standard-Variante
    try {
        await loadVariants();
        if (variants.length > 0 && !currentVariantId) {
            currentVariantId = variants[0].id;
        }
        updateVariantSelect();
    } catch(e) {
        console.error('Fehler beim Laden der Varianten:', e);
        showToast('Fehler beim Laden der Varianten', 'error');
    }
    
    // Load data from API
    if (currentVariantId) {
    try {
        await loadFromAPI();
    } catch(e) {
        console.error('Fehler beim Laden der Daten:', e);
        showToast('Fehler beim Laden der Daten vom Server', 'error');
        // Fallback: use empty data structure
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
    
    await loadTemplatesFromStorage();
    await loadFilterPresetsFromStorage();
    refreshUI(); // Hier wird renderPool() aufgerufen
    if (typeof updatePatientList === 'function') updatePatientList();
    if (typeof renderFilterPresetSelect === 'function') renderFilterPresetSelect();
    // HINWEIS: switchView wird im späteren DOMContentLoaded Handler aufgerufen,
    // nachdem refreshView definiert wurde (siehe weiter unten im Code)
});

// Initialisiere View am Ende des Scripts (wenn DOM bereits geladen)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (typeof switchView === 'function' && typeof refreshView === 'function') {
            switchView(currentView || 'week');
        }
    }, 50);
} else {
    // Falls DOM noch nicht geladen, warte darauf
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof switchView === 'function' && typeof refreshView === 'function') {
                switchView(currentView || 'week');
            }
        }, 50);
    });
}

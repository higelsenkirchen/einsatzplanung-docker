/* ==============================================
   STORAGE.JS - IndexedDB, LocalStorage
   ============================================== */

let db = null;
let templateCache = [];
let filterPresetCache = [];

// IndexedDB öffnen
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (e) => {
            console.error('IndexedDB Fehler:', e.target.error);
            reject(e.target.error);
        };
        
        request.onsuccess = (e) => {
            db = e.target.result;
            console.log('IndexedDB geöffnet');
            resolve(db);
        };
        
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
            
            if (!database.objectStoreNames.contains('templates')) {
                database.createObjectStore('templates', { keyPath: 'id' });
            }
            
            if (!database.objectStoreNames.contains('filterPresets')) {
                database.createObjectStore('filterPresets', { keyPath: 'id' });
            }
            
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'key' });
            }
            
            console.log('IndexedDB Schema erstellt/aktualisiert');
        };
    });
}

// Daten speichern
async function dbSave(storeName, key, data) {
    if (!db) await openDatabase();
    
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            
            let item;
            if (storeName === STORE_NAME) {
                item = { key: key, data: data, timestamp: Date.now() };
            } else if (storeName === 'settings') {
                item = { key: key, ...data };
            } else {
                item = { ...data, id: data.id || key };
            }
            
            const request = store.put(item);
            
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => {
                console.error('DB Save Error:', e.target.error);
                reject(e.target.error);
            };
        } catch (e) {
            console.error('DB Save Exception:', e);
            reject(e);
        }
    });
}

// Daten laden
async function dbLoad(storeName, key) {
    if (!db) await openDatabase();
    
    return new Promise((resolve, reject) => {
        try {
            if (!db.objectStoreNames.contains(storeName)) {
                console.warn(`ObjectStore "${storeName}" nicht gefunden`);
                resolve(null);
                return;
            }
            
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = (e) => {
                const result = e.target.result;
                resolve(result ? (storeName === STORE_NAME ? result.data : result) : null);
            };
            
            request.onerror = (e) => {
                console.error('DB Load Error:', e.target.error);
                resolve(null);
            };
        } catch (e) {
            console.error('DB Load Exception:', e);
            reject(e);
        }
    });
}

// Alle Daten eines Stores laden
async function dbLoadAll(storeName) {
    if (!db) await openDatabase();
    
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = (e) => resolve(e.target.result || []);
            request.onerror = (e) => {
                console.error('DB LoadAll Error:', e.target.error);
                reject(e.target.error);
            };
        } catch (e) {
            console.error('DB LoadAll Exception:', e);
            reject(e);
        }
    });
}

// Daten löschen
async function dbDelete(storeName, key) {
    if (!db) await openDatabase();
    
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => {
                console.error('DB Delete Error:', e.target.error);
                reject(e.target.error);
            };
        } catch (e) {
            console.error('DB Delete Exception:', e);
            reject(e);
        }
    });
}

// Store leeren
async function dbClear(storeName) {
    if (!db) await openDatabase();
    
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => {
                console.error('DB Clear Error:', e.target.error);
                reject(e.target.error);
            };
        } catch (e) {
            console.error('DB Clear Exception:', e);
            reject(e);
        }
    });
}

// Templates laden
async function loadTemplatesFromStorage() {
    try {
        const records = await dbLoadAll('templates');
        templateCache = (records || []).map(r => ({ ...r }));
        
        if (templateCache.length === 0) {
            const fallback = localStorage.getItem(TEMPLATE_FALLBACK_KEY);
            if (fallback) {
                templateCache = JSON.parse(fallback);
                try {
                    await dbClear('templates');
                    for (const tmpl of templateCache) {
                        await dbSave('templates', tmpl.id, tmpl);
                    }
                } catch (e) {
                    console.warn('Templates Migration fehlgeschlagen:', e);
                }
            }
        }
    } catch (e) {
        console.warn('Templates laden fehlgeschlagen:', e);
        try {
            templateCache = JSON.parse(localStorage.getItem(TEMPLATE_FALLBACK_KEY) || '[]');
        } catch {
            templateCache = [];
        }
    }
}

// Filter-Presets laden
async function loadFilterPresetsFromStorage() {
    try {
        const records = await dbLoadAll('filterPresets');
        filterPresetCache = (records || []).map(r => ({ ...r }));
        
        if (filterPresetCache.length === 0) {
            const fallback = localStorage.getItem(FILTER_PRESET_FALLBACK_KEY);
            if (fallback) {
                filterPresetCache = JSON.parse(fallback);
                try {
                    await dbClear('filterPresets');
                    for (const preset of filterPresetCache) {
                        await dbSave('filterPresets', preset.id, preset);
                    }
                } catch (e) {
                    console.warn('Filter-Presets Migration fehlgeschlagen:', e);
                }
            }
        }
    } catch (e) {
        console.warn('Filter-Presets laden fehlgeschlagen:', e);
        try {
            filterPresetCache = JSON.parse(localStorage.getItem(FILTER_PRESET_FALLBACK_KEY) || '[]');
        } catch {
            filterPresetCache = [];
        }
    }
}

// Templates-Getter
function getTemplates() {
    return templateCache || [];
}

// Templates speichern
async function saveTemplates(templates) {
    templateCache = templates.slice();
    try {
        await dbClear('templates');
        for (const t of templateCache) {
            await dbSave('templates', t.id, t);
        }
    } catch (e) {
        console.warn('Templates IndexedDB Speichern fehlgeschlagen:', e);
        try {
            localStorage.setItem(TEMPLATE_FALLBACK_KEY, JSON.stringify(templateCache));
        } catch (storageError) {
            console.warn('Templates LocalStorage Fallback fehlgeschlagen:', storageError);
        }
    }
}

// Filter-Presets-Getter
function getFilterPresets() {
    return filterPresetCache || [];
}

// Filter-Presets speichern
async function saveFilterPresets(presets) {
    filterPresetCache = presets.slice();
    try {
        await dbClear('filterPresets');
        for (const p of filterPresetCache) {
            await dbSave('filterPresets', p.id, p);
        }
    } catch (e) {
        console.warn('Filter-Presets IndexedDB Speichern fehlgeschlagen:', e);
        try {
            localStorage.setItem(FILTER_PRESET_FALLBACK_KEY, JSON.stringify(filterPresetCache));
        } catch (storageError) {
            console.warn('Filter-Presets LocalStorage Fallback fehlgeschlagen:', storageError);
        }
    }
}

// Initialize IndexedDB on script load
openDatabase().then(() => {
    console.log('IndexedDB bereit');
}).catch(err => {
    console.warn('IndexedDB nicht verfügbar, nutze localStorage als Fallback');
});



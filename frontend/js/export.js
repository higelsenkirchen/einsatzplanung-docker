/* ==============================================
   EXPORT.JS - CSV/Export-Funktionen
   ============================================== */

// --- EXPORT FUNKTIONEN ---
function printView() {
    // Add print header
    let header = document.querySelector('.print-header');
    if(!header) {
        header = document.createElement('div');
        header.className = 'print-header';
        header.style.display = 'none';
        document.body.insertBefore(header, document.body.firstChild);
    }
    
    const realEvents = filterValidEvents(appData.events);
    const totalMinutes = realEvents.reduce((sum, e) => sum + getEventDuration(e), 0);
    
    header.innerHTML = `
        <h1>Tourenplanung - Wochenübersicht</h1>
        <p>Erstellt am ${new Date().toLocaleDateString('de-DE')} • ${realEvents.length} Einsätze • ${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m Gesamtdauer</p>
    `;
    
    window.print();
}

function exportCSV() {
    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const realEvents = appData.events.filter(e => !e.extendedProps?.isTravel);
    
    let csv = 'Kunde;Tag;Start;Ende;Tour;Zone;Leistungen;Rhythmus\n';
    
    realEvents.forEach(evt => {
        const tour = appData.tours.find(t => t.id === evt.extendedProps?.tour);
        const types = (evt.extendedProps?.types || []).join(', ');
        const rhythm = evt.extendedProps?.rhythm === 'biweekly' ? '2-wöchentlich' : '1-wöchentlich';
        
        csv += `"${evt.title}";"${dayNames[evt.dayIndex]}";"${evt.start}";"${evt.end}";"${tour?.name || ''}";"${evt.extendedProps?.zone || ''}";"${types}";"${rhythm}"\n`;
    });
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tourenplanung.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function importCSV() {
    openModal('csvImportModal');
}

function exportToPDF() {
    // Nutze die Druckfunktion als PDF-Export (Browser kann als PDF speichern)
    showToast('Druckdialog wird geöffnet - wählen Sie "Als PDF speichern"', 'info');
    printView();
}

function startCSVUpload() {
    closeModal('csvImportModal');
    document.getElementById('csvFileInput').click();
}

function handleCSVImport(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const lines = text.split('\n').filter(l => l.trim());
            
            if(lines.length < 2) {
                showAlertModal('Fehler', 'CSV-Datei ist leer oder hat kein gültiges Format.', 'error');
                return;
            }
            
            // Skip header
            let imported = 0;
            for(let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(';').map(p => p.replace(/"/g, '').trim());
                if(parts.length >= 1 && parts[0]) {
                    const name = parts[0];
                    const zone = parts[1] || 'Alt-/Neustadt';
                    const typesStr = parts[2] || 'care';
                    const types = typesStr.split(',').map(t => t.trim().toLowerCase()).filter(t => ['care', 'house', 'social', 'other'].includes(t));
                    
                    // Add to pool
                    appData.pool.push({
                        id: generateId(),
                        title: name,
                        zone: zone,
                        types: types.length ? types : ['other']
                    });
                    imported++;
                }
            }
            
            queueSave();
            renderPool();
            showAlertModal('Erfolg', `${imported} Kunden importiert.`, 'success');
        } catch(err) {
            console.error(err);
            showAlertModal('Fehler', 'Fehler beim Import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

// --- BACKUP FUNKTIONEN ---
let pendingBackupImport = null;

function exportAllData() {
    const backup = {
        version: '2.2.0',
        exportDate: new Date().toISOString(),
        events: appData.events || [],
        pool: appData.pool || [],
        employees: appData.employees || [],
        tours: appData.tours || [],
        wageSettings: appData.wageSettings || {},
        favorites: appData.favorites || []
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tourenplanung-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup exportiert', 'success');
}

function importAllData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Validierung
            if(!data.events && !data.pool && !data.tours) {
                showToast('Ungültiges Backup-Format', 'error');
                return;
            }
            
            pendingBackupImport = data;
            openModal('backupImportConfirmModal');
        } catch(err) {
            console.error('Fehler beim Lesen des Backups:', err);
            showToast('Fehler beim Lesen des Backups', 'error');
        }
    };
    input.click();
}

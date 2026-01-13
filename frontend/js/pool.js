/* ==============================================
   POOL.JS - Pool-Rendering und -Verwaltung
   ============================================== */

function renderPool() {
    const container = document.getElementById('external-events'); 
    if(!container) return;
    container.innerHTML = '';
    
    // Get filter values
    const searchVal = (document.getElementById('poolSearchInput')?.value || '').toLowerCase();
    const typeVal = document.getElementById('poolTypeFilter')?.value || '';
    const zoneVal = document.getElementById('poolZoneFilter')?.value || '';
    const sortVal = document.getElementById('poolSort')?.value || 'name';
    
    // Filter pool items
    let filteredPool = [...(appData.pool || [])];
    
    if(searchVal) {
        filteredPool = filteredPool.filter(p => p.title.toLowerCase().includes(searchVal));
    }
    if(typeVal) {
        filteredPool = filteredPool.filter(p => (p.types || []).includes(typeVal));
    }
    if(zoneVal) {
        filteredPool = filteredPool.filter(p => p.zone === zoneVal);
    }
    
    // Sort pool items (favorites first, then by selected sort)
    filteredPool.sort((a, b) => {
        // Favorites always first
        if(a.favorite && !b.favorite) return -1;
        if(!a.favorite && b.favorite) return 1;
        
        switch(sortVal) {
            case 'name-desc':
                return b.title.localeCompare(a.title);
            case 'zone':
                return (a.zone || '').localeCompare(b.zone || '');
            case 'name':
            default:
                return a.title.localeCompare(b.title);
        }
    });
    
    // Make pool a drop target for events
    container.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over');
    };
    container.ondragleave = (e) => {
        container.classList.remove('drag-over');
    };
    container.ondrop = (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');
        handleDropToPool();
    };
    
    if(filteredPool.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:0.85rem;">Keine Einträge</div>';
        return;
    }
    
    // Determine size class based on number of items
    const itemCount = filteredPool.length;
    let sizeClass = 'size-normal';
    if(itemCount > 15) sizeClass = 'size-compact';
    if(itemCount > 25) sizeClass = 'size-mini';
    
    // Add count indicator
    const countBadge = document.createElement('div');
    countBadge.style.cssText = 'font-size:0.65rem; color:var(--text-light); text-align:center; padding:4px 0; margin-bottom:4px; border-bottom:1px solid var(--border-light);';
    countBadge.innerHTML = `<span style="font-weight:600; color:var(--text-muted);">${itemCount}</span> Einträge`;
    if(itemCount > 0) container.appendChild(countBadge);
    
    filteredPool.forEach(p => {
        const d = document.createElement('div'); 
        d.className = 'pool-item ' + sizeClass;
        
        // Baue Tooltip mit Adresse und Koordinaten
        const coordinates = p.extendedProps?.coordinates || p.extended_props?.coordinates;
        let tooltip = p.title;
        if (p.address) tooltip += `\n${p.address}`;
        if (p.postalCode) tooltip += `, ${p.postalCode}`;
        if (p.zone) tooltip += `\nZone: ${getZoneWithPostalCode(p.zone)}`;
        if (coordinates && coordinates.lat && coordinates.lng) {
            tooltip += `\n📍 Koordinaten: ${coordinates.lat.toFixed(6)}°N, ${coordinates.lng.toFixed(6)}°E`;
        }
        tooltip += '\n\nZiehen zum Planen';
        d.title = tooltip;
        
        d.draggable = true;
        d.ondragstart = (e) => handleDragStart(e, 'pool', p.id);
        
        // Zone color
        const zoneColor = ZONE_COLORS[p.zone] || 'var(--primary)';
        d.style.borderLeftColor = zoneColor;
        
        let dots = (p.types || []).map(t => `<div class="dot ${t}"></div>`).join('');
        const starIcon = p.favorite ? '⭐' : '☆';
        const starStyle = p.favorite ? 'color:#f59e0b;' : 'color:var(--text-light); opacity:0.6;';
        const hasCoordinates = coordinates && coordinates.lat && coordinates.lng;
        const coordIcon = hasCoordinates ? '📍' : '';
        
        d.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:5px; min-width:0; flex:1;">
                    <span class="favorite-star" style="cursor:pointer;font-size:0.9rem;${starStyle}flex-shrink:0;" data-id="${p.id}" title="${p.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}">${starIcon}</span>
                    <span class="pool-title" style="font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title}</span>
                    ${coordIcon ? `<span style="font-size:0.75rem;opacity:0.7;" title="Koordinaten vorhanden">${coordIcon}</span>` : ''}
            </div>
                <div style="display:flex;align-items:center;gap:3px;flex-shrink:0;">
                <span style="display:flex;gap:3px;flex-shrink:0;margin-left:6px;">${dots}</span>
                    <button class="pool-delete-btn" onclick="event.stopPropagation(); deletePoolItem('${p.id}')" title="Kunde löschen" style="background:none;border:none;color:var(--danger);cursor:pointer;padding:2px 4px;font-size:0.85rem;opacity:0.6;transition:opacity 0.2s;">🗑️</button>
                </div>
            </div>
            <div class="pool-zone" style="color:var(--text-muted);display:flex;align-items:center;gap:4px;margin-top:2px;">
                <span style="width:6px;height:6px;background:${zoneColor};border-radius:2px;display:inline-block;flex-shrink:0;"></span>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${getZoneWithPostalCode(p.zone) || 'Keine Zone'}</span>
                ${p.address ? `<span style="font-size:0.75rem;opacity:0.7;margin-left:4px;" title="${p.address}">${p.address}</span>` : ''}
            </div>`;
        
        // Favorite star click handler
        const star = d.querySelector('.favorite-star');
        if(star) {
            star.onclick = (e) => {
                e.stopPropagation();
                toggleFavorite(p.id);
            };
        }
        
        // Hover-Effekt für Löschen-Button
        const deleteBtn = d.querySelector('.pool-delete-btn');
        if(deleteBtn) {
            d.addEventListener('mouseenter', () => {
                deleteBtn.style.opacity = '1';
            });
            d.addEventListener('mouseleave', () => {
                deleteBtn.style.opacity = '0.6';
            });
        }
        
        // Click to edit pool item (not schedule)
        d.onclick = () => {
            openPoolItemEdit(p);
        };
        
        container.appendChild(d);
    });
    
    // Show empty state if no items
    if(filteredPool.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-light); font-size:0.8rem;">Keine Einträge</div>';
    }
}

function toggleFavorite(id) {
    const item = appData.pool.find(p => p.id === id);
    if(item) {
        item.favorite = !item.favorite;
        queueSave();
        renderPool();
        showToast(item.favorite ? `"${item.title}" als Favorit markiert` : `"${item.title}" aus Favoriten entfernt`, 'info');
    }
}

function openPoolItemEdit(poolItem) {
    // Open pool modal for editing
    document.getElementById('poolName').value = poolItem.title || '';
    document.getElementById('poolZone').value = poolItem.zone || '';
    document.getElementById('poolAddress').value = poolItem.address || '';
    document.getElementById('poolPostalCode').value = poolItem.postalCode || '';
    
    // Set checkboxes
    document.querySelectorAll('.pool-cb').forEach(cb => {
        cb.checked = (poolItem.types || []).includes(cb.value);
    });
    
    // Zeige Koordinaten falls vorhanden
    const coordinates = poolItem.extendedProps?.coordinates || poolItem.extended_props?.coordinates;
    const display = document.getElementById('poolCoordinatesDisplay');
    const text = document.getElementById('poolCoordinatesText');
    
    if (coordinates && coordinates.lat && coordinates.lng) {
        text.textContent = `${coordinates.lat.toFixed(6)}°N, ${coordinates.lng.toFixed(6)}°E`;
        display.style.display = 'block';
        
        // Speichere Koordinaten temporär im Modal
        const modal = document.getElementById('poolModal');
        modal.dataset.tempCoordinates = JSON.stringify(coordinates);
    } else {
        display.style.display = 'none';
    }
    
    // Store editing ID
    const modal = document.getElementById('poolModal');
    modal.dataset.editingId = poolItem.id;
    
    // Setze Button-Text auf "Speichern" beim Bearbeiten
    const submitBtn = document.getElementById('poolModalSubmitBtn');
    if (submitBtn) submitBtn.textContent = '💾 Speichern';
    
    openModal('poolModal');
}

function deletePoolItem(poolId) {
    const item = appData.pool.find(p => p.id === poolId);
    if(!item) return;
    
    const itemName = item.title;
    if(confirm(`Möchten Sie den Kunden "${itemName}" wirklich löschen?`)) {
        // Entferne Item aus Pool
        appData.pool = appData.pool.filter(p => p.id !== poolId);
        
        // Speichere Änderungen
        queueSave();
        renderPool();
        
        // Aktualisiere Kundenliste falls im Admin-Tab
        if (currentView === 'admin' && currentAdminTab === 'customers') {
            renderCustomerList();
        }
        
        showToast(`Kunde "${itemName}" gelöscht`, 'success');
    }
}

/* ==============================================
   UI.JS - Modals, Toasts, Dialoge, Theme
   ============================================== */

// Modal-Handler Storage
const modalHandlers = {};

// Toast-Benachrichtigung anzeigen
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Modal öffnen
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        
        // Entferne alte Event-Listener
        if (modalHandlers[id]) {
            document.removeEventListener('keydown', modalHandlers[id].escHandler);
        }
        
        // ESC-Handler
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeModal(id);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        modalHandlers[id] = { escHandler };
    }
}

// Modal schließen
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        
        // Entferne Event-Listener
        if (modalHandlers[id]) {
            document.removeEventListener('keydown', modalHandlers[id].escHandler);
            delete modalHandlers[id];
        }
    }
}

// Theme initialisieren
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const theme = savedTheme || 'light';
    setTheme(theme);
}

// Theme setzen
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeButton(theme);
}

// Theme wechseln
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    showToast(newTheme === 'dark' ? 'Dunkelmodus aktiviert' : 'Hellmodus aktiviert', 'info');
}

// Theme-Button aktualisieren
function updateThemeButton(theme) {
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    if (text) text.textContent = theme === 'dark' ? 'Hellmodus' : 'Dunkelmodus';
}

// Sidebar toggler
function toggleSidebar() {
    const sidebar = document.getElementById('mainSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
}

// Mobile Menu
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// Mobile Menu Button hinzufügen
function addMobileMenuButton() {
    if (window.innerWidth <= 768) {
        let menuBtn = document.getElementById('mobileMenuBtn');
        if (!menuBtn) {
            menuBtn = document.createElement('button');
            menuBtn.id = 'mobileMenuBtn';
            menuBtn.className = 'mobile-menu-btn';
            menuBtn.innerHTML = '☰';
            menuBtn.onclick = toggleMobileMenu;
            document.body.appendChild(menuBtn);
        }
    } else {
        const menuBtn = document.getElementById('mobileMenuBtn');
        if (menuBtn) {
            menuBtn.remove();
        }
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.remove('open');
        }
    }
}

// Menu-Sektion toggler
function toggleMenuSection(section) {
    const menu = document.getElementById('menu' + section.charAt(0).toUpperCase() + section.slice(1));
    const toggle = document.getElementById('toggle' + section.charAt(0).toUpperCase() + section.slice(1));
    
    if (menu && toggle) {
        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'flex';
        toggle.textContent = isVisible ? '▶' : '▼';
    }
}

// Navigation Dropdown
function toggleNavGroup(group) {
    const btn = document.getElementById(`navGroup${group.charAt(0).toUpperCase() + group.slice(1)}`);
    const dropdown = document.getElementById(`navDropdown${group.charAt(0).toUpperCase() + group.slice(1)}`);
    
    // Schließe andere Dropdowns
    document.querySelectorAll('.nav-dropdown.show').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });
    document.querySelectorAll('.nav-group-btn.open').forEach(b => {
        if (b !== btn) b.classList.remove('open');
    });
    
    if (btn && dropdown) {
        btn.classList.toggle('open');
        dropdown.classList.toggle('show');
    }
}

function closeNavGroups() {
    document.querySelectorAll('.nav-dropdown.show').forEach(d => d.classList.remove('show'));
    document.querySelectorAll('.nav-group-btn.open').forEach(b => b.classList.remove('open'));
}

// Toolbar Groups
function toggleToolbarGroup(group) {
    const dropdown = document.getElementById(`toolbarDropdown${group.charAt(0).toUpperCase() + group.slice(1)}`);
    
    document.querySelectorAll('.toolbar-dropdown.show').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });
    
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function closeToolbarGroups() {
    document.querySelectorAll('.toolbar-dropdown.show').forEach(d => d.classList.remove('show'));
}

// Filter Group
function toggleFilterGroup(group) {
    const toggle = document.getElementById(`filterToggle${group.charAt(0).toUpperCase() + group.slice(1)}`);
    const dropdown = document.getElementById(`filterDropdown${group.charAt(0).toUpperCase() + group.slice(1)}`);
    
    document.querySelectorAll('.filter-dropdown.show').forEach(d => {
        if (d !== dropdown) d.classList.remove('show');
    });
    document.querySelectorAll('.filter-group-toggle.open').forEach(t => {
        if (t !== toggle) t.classList.remove('open');
    });
    
    if (toggle && dropdown) {
        toggle.classList.toggle('open');
        dropdown.classList.toggle('show');
    }
}

// Kontext-Menü
let contextMenuTarget = null;

function showContextMenu(event, eventData) {
    event.preventDefault();
    contextMenuTarget = eventData;
    
    const menu = document.getElementById('contextMenu');
    if (!menu) return;
    
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.classList.add('visible');
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) {
        menu.classList.remove('visible');
    }
    contextMenuTarget = null;
}

// Kontext-Menü-Aktionen
function contextMenuEdit() {
    if (contextMenuTarget && typeof openEventModal === 'function') {
        openEventModal(contextMenuTarget);
    }
    hideContextMenu();
}

function contextMenuDuplicate() {
    if (contextMenuTarget && typeof duplicateEvent === 'function') {
        duplicateEvent(contextMenuTarget.id);
    }
    hideContextMenu();
}

function contextMenuToPool() {
    if (contextMenuTarget && typeof moveEventToPool === 'function') {
        moveEventToPool(contextMenuTarget.id);
    }
    hideContextMenu();
}

function contextMenuDelete() {
    if (contextMenuTarget && typeof deleteEvent === 'function') {
        deleteEvent(contextMenuTarget.id);
    }
    hideContextMenu();
}

// Global Event Listeners
document.addEventListener('click', (e) => {
    // Hide context menu
    if (!e.target.closest('.context-menu')) {
        hideContextMenu();
    }
    
    // Close toolbar dropdowns
    if (!e.target.closest('.toolbar-group')) {
        closeToolbarGroups();
    }
    
    // Close nav groups
    if (!e.target.closest('.nav-group')) {
        closeNavGroups();
    }
    
    // Close filter dropdowns
    if (!e.target.closest('.filter-group-compact')) {
        document.querySelectorAll('.filter-dropdown.show').forEach(d => d.classList.remove('show'));
        document.querySelectorAll('.filter-group-toggle.open').forEach(t => t.classList.remove('open'));
    }
    
    // Close mobile sidebar
    const sidebar = document.querySelector('.sidebar');
    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && !e.target.closest('.mobile-menu-btn')) {
            sidebar.classList.remove('open');
        }
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Strg+S - Speichern
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (typeof saveToAPI === 'function') {
            saveToAPI();
            showToast('Gespeichert', 'success');
        }
    }
    
    // Strg+Z - Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (typeof undo === 'function') {
            undo();
        }
    }
});

// Sidebar-Zustand beim Laden wiederherstellen
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('mainSidebar');
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (sidebar && savedState === 'true' && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
    }
    
    // Mobile Menu Button
    addMobileMenuButton();
    window.addEventListener('resize', addMobileMenuButton);
});


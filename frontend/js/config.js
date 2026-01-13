/* ==============================================
   CONFIG.JS - Konstanten, Zonen, Default-Werte
   ============================================== */

// Stadt-Zonen
const CITY_ZONES = [
    "Alt-/Neustadt", "Beckhausen", "Bismarck", "Buer", "Bulmke-Hüllen", 
    "Erle", "Feldmark", "Hassel", "Heßler", "Horst", "Resser Mark", 
    "Resse", "Rotthausen", "Schalke", "Scholven", "Ückendorf", "Außerhalb"
];

// Postleitzahlen für Stadtteile
const ZONE_POSTAL_CODES = {
    "Alt-/Neustadt": "45879",
    "Beckhausen": "45899",
    "Bismarck": "45889",
    "Buer": "45894",
    "Bulmke-Hüllen": "45888",
    "Erle": "45891",
    "Feldmark": "45883",
    "Hassel": "45768",
    "Heßler": "45883",
    "Horst": "45899",
    "Resser Mark": "45892",
    "Resse": "45892",
    "Rotthausen": "45884",
    "Schalke": "45881",
    "Scholven": "45896",
    "Ückendorf": "45886",
    "Außerhalb": null
};

// Zone-Farben
const ZONE_COLORS = {
    "Alt-/Neustadt": "#e11d48",
    "Beckhausen": "#b45309",
    "Bismarck": "#7c3aed",
    "Buer": "#0891b2",
    "Bulmke-Hüllen": "#059669",
    "Erle": "#16a34a",
    "Feldmark": "#65a30d",
    "Hassel": "#ca8a04",
    "Heßler": "#ea580c",
    "Horst": "#dc2626",
    "Resser Mark": "#9333ea",
    "Resse": "#2563eb",
    "Rotthausen": "#c026d3",
    "Schalke": "#0284c7",
    "Scholven": "#4f46e5",
    "Ückendorf": "#0d9488",
    "Außerhalb": "#525252"
};

// Zone-Distanzen (Koordinaten für Berechnung)
const ZONE_DISTANCES = {
    coords: {
        "Alt-/Neustadt": [4, 3.5],
        "Beckhausen": [3.5, 8],
        "Bismarck": [4, 5],
        "Buer": [5, 8],
        "Bulmke-Hüllen": [6, 4],
        "Erle": [6, 6],
        "Feldmark": [4, 4],
        "Hassel": [3, 8],
        "Heßler": [3, 3],
        "Horst": [2, 5],
        "Resser Mark": [6, 9],
        "Resse": [4, 9],
        "Rotthausen": [7, 2],
        "Schalke": [5, 5],
        "Scholven": [2, 8],
        "Ückendorf": [6, 3],
        "Außerhalb": [5, 5]
    }
};

// Typ-Farben - aus CSS-Variablen lesen für besseren Kontrast
function getTypeColor(type) {
    if (typeof document === 'undefined') {
        // Fallback für Node.js/Server-Side
        const fallback = {
            care: '#3b82f6',
            house: '#047857',
            social: '#b45309',
            other: '#6b7280'
        };
        return fallback[type] || '#6b7280';
    }
    const style = getComputedStyle(document.documentElement);
    const colorMap = {
        care: style.getPropertyValue('--c-care').trim() || '#3b82f6',
        house: style.getPropertyValue('--c-house').trim() || '#047857',
        social: style.getPropertyValue('--c-social').trim() || '#b45309',
        other: style.getPropertyValue('--c-other').trim() || '#6b7280'
    };
    return colorMap[type] || '#6b7280';
}

const COLORS = { 
    care: getTypeColor('care'), 
    house: getTypeColor('house'), 
    social: getTypeColor('social'), 
    other: getTypeColor('other') 
};

// Timeline-Konstanten
const DEFAULT_DURATION_MIN = 60;
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 22;
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

// Weitere Konstanten
const UNDO_STACK_MAX_SIZE = 10;
const TARGET_WORKLOAD_HOURS = 8;
const TARGET_WORKLOAD_MINUTES = TARGET_WORKLOAD_HOURS * 60;
const SAVE_DEBOUNCE_MS = 800;

// Default Gehalts-Einstellungen
const DEFAULT_WAGE_SETTINGS = {
    wageGroups: [
        { id: 'fachkraft', name: 'Fachkraft', hourlyRate: 18.00 },
        { id: 'hilfskraft', name: 'Hilfskraft', hourlyRate: 14.00 },
        { id: 'azubi', name: 'Auszubildende/r', hourlyRate: 10.00 }
    ],
    surcharges: {
        sunday: 25,
        holiday: 100,
        night: 25
    },
    revenueRates: {
        care: 45.00,
        house: 35.00,
        social: 40.00
    },
    avgSpeed: 30,
    kmRate: 0.30,
    publicTransportMonthly: 30.00,
    employerFactor: 1.5,
    targetMargin: 50
};

// IndexedDB Konstanten
const DB_NAME = 'TourenplanungDB';
const DB_VERSION = 2;
const STORE_NAME = 'appData';
const TEMPLATE_FALLBACK_KEY = 'weekTemplates';
const FILTER_PRESET_FALLBACK_KEY = 'filterPresets';

// API Configuration
const API_BASE_URL = window.location.origin;



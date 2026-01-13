/* ==============================================
   KONTRASTPRÜFUNG - WCAG 2.1 AA Compliance
   ============================================== */

// RGB zu Relative Luminance
function getRelativeLuminance(r, g, b) {
    const normalize = (c) => c / 255;
    const gamma = (c) => {
        c = normalize(c);
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * gamma(r) + 0.7152 * gamma(g) + 0.0722 * gamma(b);
}

// Hex zu RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Kontrastverhältnis berechnen
function getContrastRatio(color1, color2) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    if (!rgb1 || !rgb2) return null;
    
    const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
    
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    
    return (lighter + 0.05) / (darker + 0.05);
}

// WCAG Compliance prüfen
function checkWCAG(ratio, isLargeText = false) {
    const minRatio = isLargeText ? 3.0 : 4.5;
    const level = ratio >= 7.0 ? 'AAA' : (ratio >= minRatio ? 'AA' : 'FAIL');
    return { level, passes: ratio >= minRatio };
}

// Zu prüfende Kombinationen (nach Kontrastkorrekturen)
const combinations = {
    'Light Theme': {
        'text-main auf bg-card': { text: '#0f172a', bg: '#ffffff' },
        'text-secondary auf bg-card': { text: '#475569', bg: '#ffffff' },
        'text-muted auf bg-card': { text: '#64748b', bg: '#ffffff' },
        'text-light auf bg-card': { text: '#64748b', bg: '#ffffff' }, // Korrigiert
        'text-main auf bg-body': { text: '#0f172a', bg: '#f8fafc' },
        'text-main auf bg-elevated': { text: '#0f172a', bg: '#f1f5f9' },
        'text-main auf bg-hover': { text: '#0f172a', bg: '#e2e8f0' },
        'primary auf bg-card': { text: '#0369a1', bg: '#ffffff' }, // Korrigiert
        'success auf bg-card': { text: '#047857', bg: '#ffffff' }, // Korrigiert
        'warning auf bg-card': { text: '#b45309', bg: '#ffffff' }, // Korrigiert
        'danger auf bg-card': { text: '#dc2626', bg: '#ffffff' }, // Korrigiert
    },
    'Dark Theme': {
        'text-main auf bg-card': { text: '#f0f0f5', bg: '#12121a' },
        'text-secondary auf bg-card': { text: '#a0a0b0', bg: '#12121a' },
        'text-muted auf bg-card': { text: '#8b8ba0', bg: '#12121a' }, // Korrigiert
        'text-light auf bg-card': { text: '#8b8ba0', bg: '#12121a' }, // Korrigiert
        'text-main auf bg-body': { text: '#f0f0f5', bg: '#0a0a0f' },
        'text-main auf bg-elevated': { text: '#f0f0f5', bg: '#1a1a24' },
        'text-main auf bg-hover': { text: '#f0f0f5', bg: '#252532' },
        'primary auf bg-card': { text: '#06b6d4', bg: '#12121a' },
        'success auf bg-card': { text: '#10b981', bg: '#12121a' },
        'warning auf bg-card': { text: '#f59e0b', bg: '#12121a' },
        'danger auf bg-card': { text: '#ef4444', bg: '#12121a' },
    }
};

console.log('=== WCAG 2.1 AA Kontrastprüfung ===\n');
console.log('Anforderungen:');
console.log('- Normaler Text: mindestens 4.5:1');
console.log('- Großer Text (18pt+ oder 14pt+ bold): mindestens 3:1\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = [];

for (const [theme, combos] of Object.entries(combinations)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${theme}`);
    console.log('='.repeat(50));
    
    for (const [name, colors] of Object.entries(combos)) {
        const ratio = getContrastRatio(colors.text, colors.bg);
        const normal = checkWCAG(ratio, false);
        const large = checkWCAG(ratio, true);
        
        totalChecks++;
        if (normal.passes) passedChecks++;
        else failedChecks.push({ theme, name, ratio, colors });
        
        const status = normal.passes ? '✅' : '❌';
        const statusLarge = large.passes ? '✅' : '❌';
        
        console.log(`\n${status} ${name}`);
        console.log(`   Text: ${colors.text} auf ${colors.bg}`);
        console.log(`   Kontrast: ${ratio.toFixed(2)}:1`);
        console.log(`   Normaler Text: ${normal.level} ${status}`);
        console.log(`   Großer Text: ${large.level} ${statusLarge}`);
    }
}

console.log(`\n\n${'='.repeat(50)}`);
console.log('ZUSAMMENFASSUNG');
console.log('='.repeat(50));
console.log(`Gesamtprüfungen: ${totalChecks}`);
console.log(`Bestanden: ${passedChecks} (${((passedChecks/totalChecks)*100).toFixed(1)}%)`);
console.log(`Fehlgeschlagen: ${totalChecks - passedChecks}`);

if (failedChecks.length > 0) {
    console.log(`\n❌ FEHLGESCHLAGENE KOMBINATIONEN:`);
    failedChecks.forEach(({ theme, name, ratio, colors }) => {
        console.log(`\n${theme} - ${name}`);
        console.log(`  Text: ${colors.text} auf ${colors.bg}`);
        console.log(`  Kontrast: ${ratio.toFixed(2)}:1 (benötigt: 4.5:1)`);
        const minLum = getRelativeLuminance(...Object.values(hexToRgb(colors.bg)));
        const textLum = getRelativeLuminance(...Object.values(hexToRgb(colors.text)));
        if (minLum > textLum) {
            // Hintergrund ist heller, Text muss dunkler werden
            console.log(`  💡 Lösung: Textfarbe dunkler machen`);
        } else {
            // Text ist heller, Hintergrund muss dunkler werden
            console.log(`  💡 Lösung: Hintergrundfarbe dunkler machen`);
        }
    });
}

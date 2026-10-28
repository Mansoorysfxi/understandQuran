/**
 * settings.js
 * Manages user preferences and last read position with localStorage and DOM updates.
 */

const STORAGE_KEY = 'quran_study_settings_v1';
const LAST_READ_KEY = 'quran_study_last_read_v1';

// Default settings
export const DEFAULT_SETTINGS = {
  theme: 'light', // 'light' | 'sepia' | 'dark'
  script: 'uthmani', // 'uthmani' | 'indopak'
  showWbwUr: true,
  showWbwEn: true,
  showFullUr: true,
  showFullEn: true,
  urTranslator: '97', // '97' (Maududi) | '234' (Jalandhari) | 'both'
  sizeArabic: 32,
  sizeUrdu: 22,
  sizeEnglish: 16,
};

/**
 * Determine default theme from system preference if first visit
 */
function getPreferredTheme() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Load settings safely from localStorage
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS, theme: getPreferredTheme() };
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    console.warn('Could not read settings from localStorage:', e);
    return { ...DEFAULT_SETTINGS, theme: getPreferredTheme() };
  }
}

/**
 * Save settings to localStorage
 */
export function saveSettings(newSettings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    applySettingsToDOM(updated);
    return updated;
  } catch (e) {
    console.warn('Could not save settings to localStorage:', e);
    return newSettings;
  }
}

/**
 * Apply current settings to document root and CSS classes
 */
export function applySettingsToDOM(settings = getSettings()) {
  const root = document.documentElement;

  // Theme attribute
  root.setAttribute('data-theme', settings.theme || 'light');

  // Script attribute & font variable
  root.setAttribute('data-script', settings.script || 'uthmani');
  if (settings.script === 'indopak') {
    root.style.setProperty('--font-arabic-active', 'var(--font-indopak)');
  } else {
    root.style.setProperty('--font-arabic-active', 'var(--font-uthmani)');
  }

  // Font sizes
  root.style.setProperty('--size-arabic', `${settings.sizeArabic}px`);
  root.style.setProperty('--size-urdu', `${settings.sizeUrdu}px`);
  root.style.setProperty('--size-english', `${settings.sizeEnglish}px`);

  // Display layers toggle classes on <body>
  document.body.classList.toggle('hide-wbw-ur', !settings.showWbwUr);
  document.body.classList.toggle('hide-wbw-en', !settings.showWbwEn);
  document.body.classList.toggle('hide-full-ur', !settings.showFullUr);
  document.body.classList.toggle('hide-full-en', !settings.showFullEn);

  // Urdu translator selector class: show only 97, only 234, or both
  document.body.setAttribute('data-ur-translator', settings.urTranslator || '97');
}

/**
 * Save last read position safely
 */
export function saveLastRead(surahId, ayahNumber, surahNameSimple = '') {
  try {
    const data = {
      surahId: parseInt(surahId, 10),
      ayahNumber: parseInt(ayahNumber, 10) || 1,
      surahName: surahNameSimple,
      timestamp: Date.now(),
    };
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save last read position:', e);
  }
}

/**
 * Retrieve last read position
 */
export function getLastRead() {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read last read position:', e);
    return null;
  }
}

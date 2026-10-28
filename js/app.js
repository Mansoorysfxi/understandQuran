/**
 * app.js
 * Application controller: initializes chapters, router, search, settings, and views.
 */

import { Router } from './router.js';
import { loadAndRenderSurah, scrollToAyah, cleanupReader, showToast } from './reader.js';
import {
  getSettings,
  saveSettings,
  applySettingsToDOM,
  getLastRead,
  DEFAULT_SETTINGS,
} from './settings.js';

let chaptersData = [];
let metaData = null;
let router = null;

/**
 * Initialize application on DOMContentLoaded
 */
async function initApp() {
  // Apply saved or system-preference settings immediately
  const settings = getSettings();
  applySettingsToDOM(settings);

  // Load chapter metadata
  try {
    const res = await fetch('./data/chapters.json');
    if (!res.ok) throw new Error('Failed to load chapters.json');
    chaptersData = await res.json();
  } catch (err) {
    console.error('Error loading chapters:', err);
  }

  // Load meta
  try {
    const metaRes = await fetch('./data/meta.json');
    if (metaRes.ok) {
      metaData = await metaRes.json();
    }
  } catch (err) {
    console.warn('Error loading meta.json:', err);
  }

  // Initialize router
  router = new Router({
    home: renderHomeView,
    reader: (params) => {
      loadAndRenderSurah(params.surah, params.ayah, chaptersData);
    },
    about: renderAboutView,
  });

  router.init();

  // Initialize UI controls & dialogs
  setupSettingsModal();
  setupSearchModal();
  setupKeyboardShortcuts();
  setupServiceWorker();
}

/**
 * View: Home / Surah Index Grid
 */
function renderHomeView() {
  cleanupReader();

  const appContainer = document.getElementById('app');
  const navReaderInfo = document.getElementById('navReaderInfo');
  if (navReaderInfo) navReaderInfo.style.display = 'none';

  document.title = 'القرآن الكريم — Quran Study (Index)';

  const lastRead = getLastRead();

  let continueHtml = '';
  if (lastRead && lastRead.surahId) {
    continueHtml = `
      <aside class="continue-card" aria-label="Continue reading">
        <div class="continue-info">
          <span class="continue-label">Continue Reading</span>
          <div class="continue-title">Surah ${lastRead.surahName || lastRead.surahId} — Ayah ${lastRead.ayahNumber}</div>
          <span class="continue-sub">${formatRelativeTime(lastRead.timestamp)}</span>
        </div>
        <a href="#/${lastRead.surahId}/${lastRead.ayahNumber}" class="continue-btn">
          <span>Resume</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
      </aside>
    `;
  }

  appContainer.innerHTML = `
    <div class="index-container">
      <header class="index-hero">
        <h1 class="index-hero-title-ar" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</h1>
        <p class="index-hero-subtitle">Read and study the Holy Quran with Uthmani and IndoPak scripts, word-by-word Urdu & English meanings, and complete translations.</p>
      </header>

      ${continueHtml}

      <!-- Filter / Search Box -->
      <div class="search-bar-wrap">
        <svg class="search-icon-left" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="indexSearchInput" class="search-input" placeholder="Search by name, number, or Arabic (e.g. 2, Yasin, کهف)..." autocomplete="off">
        <button id="indexSearchClear" class="search-clear-btn" style="display: none;" aria-label="Clear search">&times;</button>
      </div>

      <!-- Surahs Grid -->
      <div class="surah-grid" id="surahGrid" role="list">
        ${renderSurahCards(chaptersData)}
      </div>
    </div>
  `;

  // Attach search filter
  const searchInput = document.getElementById('indexSearchInput');
  const clearBtn = document.getElementById('indexSearchClear');
  const grid = document.getElementById('surahGrid');

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    clearBtn.style.display = val ? 'flex' : 'none';

    const filtered = filterChapters(chaptersData, val);
    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-results">
          <h3>No Surahs Found</h3>
          <p>No chapter matched "<strong>${escapeHtml(val)}</strong>". Try searching by number or English name.</p>
        </div>
      `;
    } else {
      grid.innerHTML = renderSurahCards(filtered);
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    grid.innerHTML = renderSurahCards(chaptersData);
    searchInput.focus();
  });
}

/**
 * Filter chapters helper
 */
function filterChapters(chapters, query) {
  if (!query) return chapters;
  return chapters.filter((c) => {
    const idMatch = String(c.id) === query;
    const nameMatch = c.name_simple.toLowerCase().includes(query);
    const transMatch = c.translated_name.toLowerCase().includes(query);
    const arMatch = c.name_arabic.includes(query);
    return idMatch || nameMatch || transMatch || arMatch;
  });
}

/**
 * Generate HTML string for surah cards
 */
function renderSurahCards(chapters) {
  return chapters.map((c) => `
    <a href="#/${c.id}" class="surah-card" role="listitem">
      <div class="surah-card-left">
        <div class="surah-num-badge">${c.id}</div>
        <div class="surah-card-info">
          <div class="surah-name-en">${c.name_simple}</div>
          <div class="surah-meaning">${c.translated_name}</div>
          <div class="surah-meta-row">
            <span class="revelation-tag">${c.revelation_place}</span>
            <span>${c.verses_count} Verses</span>
          </div>
        </div>
      </div>
      <div class="surah-card-right">
        <div class="surah-name-ar" lang="ar" dir="rtl">${c.name_arabic}</div>
      </div>
    </a>
  `).join('');
}

/**
 * View: About & Attribution
 */
function renderAboutView() {
  cleanupReader();

  const appContainer = document.getElementById('app');
  const navReaderInfo = document.getElementById('navReaderInfo');
  if (navReaderInfo) navReaderInfo.style.display = 'none';

  document.title = 'About & Attribution — Quran Study';

  appContainer.innerHTML = `
    <div class="about-container">
      <header class="about-header">
        <h1>About Quran Study</h1>
        <p style="color: var(--text-tertiary); margin-top: 4px;">A static, responsive Quran reading and study platform hosted on GitHub Pages.</p>
      </header>

      <section class="about-section">
        <h2>Translations & Sources</h2>
        <p>All Quranic text, word-by-word breakdowns, and translations are fetched via the <a href="https://api.quran.com" target="_blank" rel="noopener">Quran.com API v4</a> and stored locally as static JSON files in this repository.</p>
        <ul>
          <li><strong>Arabic Text:</strong> Uthmani (Madinah Mushaf) and IndoPak (Pakistani / Subcontinent style).</li>
          <li><strong>Word-by-Word Urdu:</strong> Authentic lafzi tarjuma (word-by-word meanings) sourced from Quran.com.</li>
          <li><strong>Word-by-Word English:</strong> Literal word-for-word English glosses from Quran.com.</li>
          <li><strong>Full Urdu Translation (Maududi):</strong> <em>Tafheem-ul-Quran</em> by Syed Abul A'la Maududi.</li>
          <li><strong>Full Urdu Translation (Jalandhari):</strong> Fatah Muhammad Jalandhari (فتح محمد جالندھری).</li>
          <li><strong>Full English Translation:</strong> Sahih International.</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>Typography & Fonts</h2>
        <ul>
          <li><strong>Amiri Quran / Amiri:</strong> A classical Naskh font for Uthmani script designed by Khaled Hosny.</li>
          <li><strong>Gulzar:</strong> An authentic IndoPak Naskh/Nastaliq style Arabic font designed by Borna Izadpanah.</li>
          <li><strong>Noto Nastaliq Urdu:</strong> Designed by Google for authentic Nastaliq Urdu calligraphy.</li>
          <li><strong>Inter:</strong> Designed by Rasmus Andersson for clean, modern readability.</li>
        </ul>
      </section>

      <section class="about-section">
        <h2>Copyright & Licensing Notice</h2>
        <div class="license-box">
          <p>The text of the Holy Quran is in the public domain. Translations and commentaries are copyrighted by their respective translators and original publishers.</p>
          <p style="margin-top: 8px;">This project is built for educational and study purposes. Prior to distributing or republishing, review Quran.com's terms of service and individual licenses for each translation.</p>
        </div>
      </section>

      <div style="margin-top: 32px; text-align: center;">
        <a href="#/" class="btn btn-primary">Return to Surah Index</a>
      </div>
    </div>
  `;
}

/**
 * Setup Settings Modal / Bottom Sheet
 */
function setupSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const openBtn = document.getElementById('settingsBtn');
  const closeBtn = document.getElementById('closeSettingsBtn');
  const applyBtn = document.getElementById('applySettingsBtn');
  const resetBtn = document.getElementById('resetSettingsBtn');
  const themeToggleNavBtn = document.getElementById('themeToggleBtn');

  // Toggle Theme directly from top navbar button
  if (themeToggleNavBtn) {
    themeToggleNavBtn.addEventListener('click', () => {
      const current = getSettings().theme;
      const nextTheme = current === 'light' ? 'sepia' : current === 'sepia' ? 'dark' : 'light';
      saveSettings({ theme: nextTheme });
      updateSettingsForm();
      showToast(`Switched to ${nextTheme} theme`);
    });
  }

  function openSettings() {
    updateSettingsForm();
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  applyBtn.addEventListener('click', closeSettings);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSettings();
  });

  // Theme buttons in settings
  const themeBtns = modal.querySelectorAll('[data-set-theme]');
  themeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-set-theme');
      saveSettings({ theme });
      themeBtns.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Script segmented control
  const scriptBtns = modal.querySelectorAll('[data-script]');
  scriptBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const script = btn.getAttribute('data-script');
      saveSettings({ script });
      scriptBtns.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Display toggles
  const toggleWbwUr = document.getElementById('toggleWbwUr');
  const toggleWbwEn = document.getElementById('toggleWbwEn');
  const toggleFullUr = document.getElementById('toggleFullUr');
  const toggleFullEn = document.getElementById('toggleFullEn');
  const urTranslatorSelect = document.getElementById('urTranslatorSelect');

  toggleWbwUr.addEventListener('change', () => saveSettings({ showWbwUr: toggleWbwUr.checked }));
  toggleWbwEn.addEventListener('change', () => saveSettings({ showWbwEn: toggleWbwEn.checked }));
  toggleFullUr.addEventListener('change', () => saveSettings({ showFullUr: toggleFullUr.checked }));
  toggleFullEn.addEventListener('change', () => saveSettings({ showFullEn: toggleFullEn.checked }));
  urTranslatorSelect.addEventListener('change', () => saveSettings({ urTranslator: urTranslatorSelect.value }));

  // Sliders
  const arabicSlider = document.getElementById('arabicSizeSlider');
  const urduSlider = document.getElementById('urduSizeSlider');
  const englishSlider = document.getElementById('englishSizeSlider');

  const arabicVal = document.getElementById('arabicSizeVal');
  const urduVal = document.getElementById('urduSizeVal');
  const englishVal = document.getElementById('englishSizeVal');

  arabicSlider.addEventListener('input', (e) => {
    arabicVal.textContent = `${e.target.value}px`;
    saveSettings({ sizeArabic: parseInt(e.target.value, 10) });
  });

  urduSlider.addEventListener('input', (e) => {
    urduVal.textContent = `${e.target.value}px`;
    saveSettings({ sizeUrdu: parseInt(e.target.value, 10) });
  });

  englishSlider.addEventListener('input', (e) => {
    englishVal.textContent = `${e.target.value}px`;
    saveSettings({ sizeEnglish: parseInt(e.target.value, 10) });
  });

  // Jump to Ayah inside settings
  const jumpBtn = document.getElementById('jumpAyahBtn');
  const jumpInput = document.getElementById('jumpAyahInput');
  jumpBtn.addEventListener('click', () => {
    const val = parseInt(jumpInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      closeSettings();
      scrollToAyah(val);
    }
  });

  // Reset to defaults
  resetBtn.addEventListener('click', () => {
    saveSettings(DEFAULT_SETTINGS);
    updateSettingsForm();
    showToast('Settings reset to defaults');
  });

  function updateSettingsForm() {
    const s = getSettings();

    themeBtns.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-set-theme') === s.theme);
    });

    scriptBtns.forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-script') === s.script);
    });

    toggleWbwUr.checked = s.showWbwUr;
    toggleWbwEn.checked = s.showWbwEn;
    toggleFullUr.checked = s.showFullUr;
    toggleFullEn.checked = s.showFullEn;
    urTranslatorSelect.value = s.urTranslator || '97';

    arabicSlider.value = s.sizeArabic;
    arabicVal.textContent = `${s.sizeArabic}px`;

    urduSlider.value = s.sizeUrdu;
    urduVal.textContent = `${s.sizeUrdu}px`;

    englishSlider.value = s.sizeEnglish;
    englishVal.textContent = `${s.sizeEnglish}px`;
  }
}

/**
 * Setup Quick Search Modal (Ctrl/Cmd+K or '/')
 */
function setupSearchModal() {
  const modal = document.getElementById('searchModal');
  const searchBtn = document.getElementById('searchBtn');
  const closeBtn = document.getElementById('closeSearchBtn');
  const input = document.getElementById('modalSearchInput');
  const resultsContainer = document.getElementById('modalSearchResults');

  function openSearch() {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    input.value = '';
    renderResults(chaptersData.slice(0, 10));
    setTimeout(() => input.focus(), 50);
  }

  function closeSearch() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  searchBtn.addEventListener('click', openSearch);
  closeBtn.addEventListener('click', closeSearch);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSearch();
  });

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    const filtered = filterChapters(chaptersData, val);
    renderResults(filtered.slice(0, 15));
  });

  function renderResults(list) {
    if (list.length === 0) {
      resultsContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-tertiary);">No surahs found</div>`;
      return;
    }

    resultsContainer.innerHTML = list.map((c) => `
      <a href="#/${c.id}" class="search-result-item" data-search-surah="${c.id}">
        <div>
          <strong>${c.id}. ${c.name_simple}</strong>
          <span style="font-size: 0.8rem; color: var(--text-tertiary); margin-left: 8px;">${c.translated_name}</span>
        </div>
        <div lang="ar" dir="rtl" style="font-family: var(--font-arabic-active); font-size: 1.2rem;">${c.name_arabic}</div>
      </a>
    `).join('');

    resultsContainer.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => closeSearch());
    });
  }
}

/**
 * Keyboard shortcuts (/ for search, Esc to close dialogs)
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('searchBtn')?.click();
    } else if (e.key === 'Escape') {
      document.getElementById('searchModal').style.display = 'none';
      document.getElementById('settingsModal').style.display = 'none';
    }
  });
}

/**
 * Service Worker Registration for offline caching
 */
function setupServiceWorker() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Start app
document.addEventListener('DOMContentLoaded', initApp);

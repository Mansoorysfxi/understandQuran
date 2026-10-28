/**
 * app.js
 * Application controller matching DesignFilesFromStitch (Pages 1–5):
 * Renders Home Surahs Index, Reader View, About & Sources, and Preferences Drawer.
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
 * Initialize application
 */
async function initApp() {
  // Apply saved or system settings
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

  // Load meta info
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

  // Setup UI controllers
  setupPreferencesDrawer();
  setupQuickSearchModal();
  setupKeyboardShortcuts();
  setupServiceWorker();
}

/**
 * View: Home / Surahs Index (Stitch Inspired)
 */
function renderHomeView() {
  cleanupReader();
  updateNavActivePill('home');
  document.title = 'Quran Study — قرآن کریم · English & Urdu';

  const appContainer = document.getElementById('app');
  const lastRead = getLastRead();

  let resumeHtml = '';
  if (lastRead && lastRead.surahId) {
    resumeHtml = `
      <aside class="resume-banner" aria-label="Resume reading">
        <div class="resume-left">
          <div class="resume-icon-badge">
            <span class="material-symbols-outlined">auto_stories</span>
          </div>
          <div>
            <div class="resume-tag">Continue Reading</div>
            <div class="resume-title">Surah ${lastRead.surahName || lastRead.surahId} — Ayah ${lastRead.ayahNumber}</div>
            <div class="resume-sub">${formatRelativeTime(lastRead.timestamp)}</div>
          </div>
        </div>
        <a href="#/${lastRead.surahId}/${lastRead.ayahNumber}" class="resume-btn">
          <span>Resume</span>
          <span class="material-symbols-outlined" style="font-size: 18px;">arrow_forward</span>
        </a>
      </aside>
    `;
  }

  appContainer.innerHTML = `
    <div class="home-view-container">
      <!-- Sacred Hero Header -->
      <header class="home-hero-header">
        <div class="home-hero-crest">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M24 3L29.5 12L39 12L33.5 21L39 30L29.5 30L24 39L18.5 30L9 30L14.5 21L9 12L18.5 12L24 3Z" fill="currentColor" fill-opacity="0.12" stroke-linejoin="round"></path>
            <circle cx="24" cy="24" fill="currentColor" fill-opacity="0.25" r="4.5" stroke="currentColor" stroke-width="1.2"></circle>
          </svg>
        </div>
        <h1 class="home-hero-title">The Holy Quran</h1>
        <div class="home-hero-arabic" lang="ar" dir="rtl">القرآن الكريم</div>
        <p class="home-hero-sub">A serene, distraction-free sanctuary for Urdu and English speakers to reflect upon and understand the words of the Holy Quran through authentic word-by-word linguistic analysis.</p>
      </header>

      ${resumeHtml}

      <!-- Search & Filter Controls -->
      <div class="home-filter-toolbar">
        <div class="search-input-box">
          <span class="material-symbols-outlined search-icon-inside">search</span>
          <input type="text" id="homeSearchInput" class="search-field-input" placeholder="Search by surah name, number, or Arabic (e.g. 2, Yasin, کہف)..." autocomplete="off">
        </div>

        <div class="filter-chips-row">
          <button type="button" class="filter-chip active" data-filter="all">All (114)</button>
          <button type="button" class="filter-chip" data-filter="makkah">Meccan (86)</button>
          <button type="button" class="filter-chip" data-filter="madinah">Medinan (28)</button>
        </div>
      </div>

      <!-- 114 Surahs Grid -->
      <div class="surahs-grid-container" id="homeSurahsGrid" role="list">
        ${renderSurahGridCards(chaptersData)}
      </div>
    </div>
  `;

  // Attach search & filter handlers
  const searchInput = document.getElementById('homeSearchInput');
  const chips = document.querySelectorAll('.filter-chip');
  const grid = document.getElementById('homeSurahsGrid');

  let activeFilter = 'all';

  function applyFilters() {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = chaptersData.filter((c) => {
      const idMatch = String(c.id) === q;
      const nameMatch = c.name_simple.toLowerCase().includes(q);
      const transMatch = c.translated_name.toLowerCase().includes(q);
      const arMatch = c.name_arabic.includes(q);
      const queryOk = !q || idMatch || nameMatch || transMatch || arMatch;

      const rev = c.revelation_place.toLowerCase();
      const chipOk = activeFilter === 'all' || rev.includes(activeFilter);

      return queryOk && chipOk;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 16px; color: var(--text-secondary);">
          <h3 style="font-size: 1.2rem; color: var(--primary); margin-bottom: 8px;">No Surahs Found</h3>
          <p>No chapter matches your filter. Try another search query.</p>
        </div>
      `;
    } else {
      grid.innerHTML = renderSurahGridCards(filtered);
    }
  }

  searchInput.addEventListener('input', applyFilters);

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter') || 'all';
      applyFilters();
    });
  });
}

/**
 * Render surah preview cards
 */
function renderSurahGridCards(chapters) {
  return chapters.map((c) => `
    <a href="#/${c.id}" class="surah-preview-card" role="listitem">
      <div class="surah-preview-left">
        <div class="surah-index-num">${c.id}</div>
        <div class="surah-preview-info">
          <div class="surah-preview-name-en">${c.name_simple}</div>
          <div class="surah-preview-meaning">${c.translated_name}</div>
          <div class="surah-preview-meta">
            <span class="badge-tag" style="text-transform: capitalize;">${c.revelation_place}</span>
            <span>${c.verses_count} Verses</span>
          </div>
        </div>
      </div>
      <div class="surah-preview-right">
        <div class="surah-preview-arabic" lang="ar" dir="rtl">${c.name_arabic}</div>
      </div>
    </a>
  `).join('');
}

/**
 * View: About & Sources (Faithful to Stitch Pages 1 & 5)
 */
function renderAboutView() {
  cleanupReader();
  updateNavActivePill('about');
  document.title = 'About & Sources — Quran Study';

  const appContainer = document.getElementById('app');

  appContainer.innerHTML = `
    <div class="about-view-wrapper">
      <!-- Section 1: Sacred Header & Rub el Hizb Emblem -->
      <section class="about-hero-crest-section">
        <div class="about-crest-star">
          <svg class="w-16 h-16 text-primary" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M24 3L29.5 12L39 12L33.5 21L39 30L29.5 30L24 39L18.5 30L9 30L14.5 21L9 12L18.5 12L24 3Z" fill="currentColor" fill-opacity="0.08" stroke-linejoin="round"></path>
            <circle cx="24" cy="24" fill="currentColor" fill-opacity="0.2" r="4.5" stroke="currentColor" stroke-width="1.2"></circle>
          </svg>
        </div>

        <div class="about-scholarly-badge">
          <span>Scholarly Documentation</span>
          <span>•</span>
          <span class="font-urdu" dir="rtl">مُسْتَنَدَاتٌ عِلْمِيَّة</span>
        </div>

        <h1 class="about-main-title">About Quran Study</h1>
        <p class="about-arabic-subtitle font-urdu" dir="rtl">قرآن کریم مطالعہ و تصدیقِ مصادر</p>
        <p class="about-lead-paragraph">
          A serene, distraction-free sanctuary for Urdu and English speakers to reflect upon and understand the words of the Holy Quran through authentic word-by-word linguistic analysis.
        </p>
      </section>

      <!-- Section 2: Four Core Architectural Pillars (Stitch Page 1) -->
      <section class="about-features-grid">
        <div class="about-feature-card">
          <div class="feature-icon-box">
            <span class="material-symbols-outlined">dictionary</span>
          </div>
          <h3>Word-by-Word Morphology</h3>
          <p>Every word is segmented into its morphological components with direct Arabic, Urdu, and English meanings displayed right beneath the root script.</p>
        </div>

        <div class="about-feature-card">
          <div class="feature-icon-box">
            <span class="material-symbols-outlined">compare</span>
          </div>
          <h3>Authentic Comparative Readings</h3>
          <p>Side-by-side comparative translations by Maulana Syed Abul A'la Maududi (Tafheem-ul-Quran), Maulana Fatah Muhammad Jalandhari, and Sahih International.</p>
        </div>

        <div class="about-feature-card">
          <div class="feature-icon-box">
            <span class="material-symbols-outlined">menu_book</span>
          </div>
          <h3>Tactile Editorial Typography</h3>
          <p>Hand-crafted typography combining classical Amiri Quran calligraphy, authentic Noto Nastaliq Urdu, Gulzar IndoPak script, and modern Inter UI.</p>
        </div>

        <div class="about-feature-card">
          <div class="feature-icon-box">
            <span class="material-symbols-outlined">verified</span>
          </div>
          <h3>Sanctuary: Zero Ads & Open</h3>
          <p>100% static, client-side, ad-free, and tracker-free. Operates offline without telemetry, preserving your contemplation and focus.</p>
        </div>
      </section>

      <!-- Section 3: Data Sources & Computational Pipeline -->
      <section class="about-pipeline-card">
        <div class="pipeline-header">
          <h2>Data Sources & Computational Pipeline</h2>
        </div>

        <div class="pipeline-list">
          <div class="pipeline-item">
            <div class="pipeline-num">1</div>
            <div class="pipeline-details">
              <h4>Quran.com REST API (v4) & Tanzil Project</h4>
              <p>Word-by-word Urdu and English mappings, lemmas, and verse tokens are sourced directly from verified Quran.com API v4 datasets.</p>
            </div>
          </div>

          <div class="pipeline-item">
            <div class="pipeline-num">2</div>
            <div class="pipeline-details">
              <h4>King Fahd Glorious Quran Printing Complex (KFGQPC)</h4>
              <p>Uthmani script orthography adheres to the Madinah Mushaf standard, while IndoPak script reflects subcontinent Nastaliq orthography.</p>
            </div>
          </div>

          <div class="pipeline-item">
            <div class="pipeline-num">3</div>
            <div class="pipeline-details">
              <h4>Local Offline JSON Storage</h4>
              <p>All 114 surahs and 6,236 verses are saved locally in the repository. No runtime network calls are made to external servers.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Return Button -->
      <div style="text-align: center; margin-top: 12px;">
        <a href="#/" class="resume-btn" style="display: inline-flex;">
          <span class="material-symbols-outlined">arrow_back</span>
          <span>Return to Surah Index</span>
        </a>
      </div>
    </div>
  `;
}

/**
 * Setup Reader Preferences Drawer (Stitch Page 4)
 */
function setupPreferencesDrawer() {
  const drawer = document.getElementById('settingsDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const triggerBtn = document.getElementById('drawerTriggerBtn');
  const closeBtn = document.getElementById('closeDrawerBtn');
  const resetBtn = document.getElementById('resetSettingsBtn');
  const navPillSettings = document.getElementById('navPillSettings');

  function openDrawer() {
    updateDrawerUI();
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.style.display = 'block';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.style.display = 'none';
  }

  triggerBtn.addEventListener('click', openDrawer);
  navPillSettings.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  // Theme selector cards
  const themeCards = drawer.querySelectorAll('[data-set-theme]');
  themeCards.forEach((card) => {
    card.addEventListener('click', () => {
      const theme = card.getAttribute('data-set-theme');
      saveSettings({ theme });
      themeCards.forEach((c) => c.classList.toggle('active', c === card));
      showToast(`Switched to ${theme} theme`);
    });
  });

  // Top navbar theme toggle button
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = getSettings().theme;
    const nextTheme = current === 'light' ? 'sepia' : current === 'sepia' ? 'dark' : 'light';
    saveSettings({ theme: nextTheme });
    updateDrawerUI();
    showToast(`Switched to ${nextTheme} theme`);
  });

  // Script cards (Uthmani vs IndoPak)
  const scriptCards = drawer.querySelectorAll('[data-script]');
  scriptCards.forEach((card) => {
    card.addEventListener('click', () => {
      const script = card.getAttribute('data-script');
      saveSettings({ script });
      scriptCards.forEach((c) => c.classList.toggle('active', c === card));
      showToast(`Switched to ${script === 'indopak' ? 'IndoPak' : 'Uthmani'} script`);
    });
  });

  // Display layer toggles
  const toggleWbwUr = document.getElementById('toggleWbwUr');
  const toggleWbwEn = document.getElementById('toggleWbwEn');
  const toggleFullUr = document.getElementById('toggleFullUr');
  const toggleFullEn = document.getElementById('toggleFullEn');
  const urTranslatorSelect = document.getElementById('urTranslatorSelect');

  toggleWbwUr.addEventListener('change', () => {
    saveSettings({ showWbwUr: toggleWbwUr.checked });
    updateActiveCountBadge();
  });
  toggleWbwEn.addEventListener('change', () => {
    saveSettings({ showWbwEn: toggleWbwEn.checked });
    updateActiveCountBadge();
  });
  toggleFullUr.addEventListener('change', () => {
    saveSettings({ showFullUr: toggleFullUr.checked });
    updateActiveCountBadge();
  });
  toggleFullEn.addEventListener('change', () => {
    saveSettings({ showFullEn: toggleFullEn.checked });
    updateActiveCountBadge();
  });
  urTranslatorSelect.addEventListener('change', () => {
    saveSettings({ urTranslator: urTranslatorSelect.value });
  });

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

  // Jump Ayah
  const jumpBtn = document.getElementById('jumpAyahBtn');
  const jumpInput = document.getElementById('jumpAyahInput');
  jumpBtn.addEventListener('click', () => {
    const val = parseInt(jumpInput.value, 10);
    if (!isNaN(val) && val >= 1) {
      closeDrawer();
      scrollToAyah(val);
    }
  });

  // Reset to default
  resetBtn.addEventListener('click', () => {
    saveSettings(DEFAULT_SETTINGS);
    updateDrawerUI();
    showToast('Preferences reset to default');
  });

  function updateActiveCountBadge() {
    const s = getSettings();
    let count = 0;
    if (s.showWbwUr) count++;
    if (s.showWbwEn) count++;
    if (s.showFullUr) count++;
    if (s.showFullEn) count++;
    const badge = document.getElementById('activeLayersCount');
    if (badge) badge.textContent = `${count} Active`;
  }

  function updateDrawerUI() {
    const s = getSettings();

    themeCards.forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-set-theme') === s.theme);
    });

    scriptCards.forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-script') === s.script);
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

    updateActiveCountBadge();
  }
}

/**
 * Setup Quick Search Modal (Search ⌘K or /)
 */
function setupQuickSearchModal() {
  const modal = document.getElementById('searchModal');
  const searchTrigger = document.getElementById('searchTriggerBtn');
  const closeBtn = document.getElementById('closeSearchBtn');
  const input = document.getElementById('modalSearchInput');
  const resultsContainer = document.getElementById('modalSearchResults');

  function openModal() {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    input.value = '';
    renderModalResults(chaptersData.slice(0, 10));
    setTimeout(() => input.focus(), 60);
  }

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  searchTrigger.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  input.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = chaptersData.filter((c) => {
      const idMatch = String(c.id) === q;
      const nameMatch = c.name_simple.toLowerCase().includes(q);
      const transMatch = c.translated_name.toLowerCase().includes(q);
      const arMatch = c.name_arabic.includes(q);
      return !q || idMatch || nameMatch || transMatch || arMatch;
    });
    renderModalResults(filtered.slice(0, 15));
  });

  function renderModalResults(list) {
    if (list.length === 0) {
      resultsContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-wbw);">No chapters found</div>`;
      return;
    }

    resultsContainer.innerHTML = list.map((c) => `
      <a href="#/${c.id}" class="search-result-item">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="browser-row-num" style="width: 26px; height: 26px; font-size: 0.75rem;">${c.id}</div>
          <div>
            <strong>${c.name_simple}</strong>
            <span style="font-size: 0.78rem; color: var(--text-wbw); margin-left: 6px;">${c.translated_name}</span>
          </div>
        </div>
        <div lang="ar" dir="rtl" style="font-family: var(--font-arabic-active); font-size: 1.15rem; color: var(--secondary);">${c.name_arabic}</div>
      </a>
    `).join('');

    resultsContainer.querySelectorAll('.search-result-item').forEach((item) => {
      item.addEventListener('click', () => closeModal());
    });
  }
}

/**
 * Keyboard Shortcuts
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('searchTriggerBtn')?.click();
    } else if (e.key === 'Escape') {
      document.getElementById('searchModal').style.display = 'none';
      document.getElementById('settingsDrawer').classList.remove('open');
      document.getElementById('drawerBackdrop').style.display = 'none';
    }
  });
}

/**
 * Service Worker Registration for offline study
 */
function setupServiceWorker() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
}

function updateNavActivePill(path) {
  document.querySelectorAll('.nav-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.getAttribute('data-path') === path);
  });
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

// Start app
document.addEventListener('DOMContentLoaded', initApp);

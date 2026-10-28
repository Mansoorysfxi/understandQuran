/**
 * reader.js
 * Surah reader engine matching Stitch Page 2:
 * Left desktop surah browser sidebar, sticky reading action subbar with ayah progress,
 * rosette arch surah header, word-by-word interlinear cards, and dual full translations.
 */

import { saveLastRead, getSettings } from './settings.js';

let currentSurahData = null;
let currentChapterMeta = null;
let allChaptersMeta = [];
let renderedVerseCount = 0;
const BATCH_SIZE = 25;
let intersectionObserver = null;
let scrollTrackingListener = null;

/**
 * Main entry: loads and renders a Surah
 */
export async function loadAndRenderSurah(surahId, targetAyah = null, chapters = []) {
  allChaptersMeta = chapters;
  const appContainer = document.getElementById('app');

  // Find chapter metadata
  currentChapterMeta = chapters.find((c) => c.id === surahId) || {
    id: surahId,
    name_simple: `Surah ${surahId}`,
    name_arabic: '',
    translated_name: '',
    verses_count: 0,
    revelation_place: '',
  };

  // Update page title
  document.title = `${currentChapterMeta.name_simple} (${currentChapterMeta.name_arabic}) — Quran Study`;

  // Update active pill in top navigation
  updateNavActivePill('reader');

  // Render skeleton loading state
  renderSkeleton(appContainer, currentChapterMeta);

  // Clean up previous observers/listeners
  cleanupReader();

  try {
    const padded = String(surahId).padStart(3, '0');
    const res = await fetch(`./data/surah/${padded}.json`);
    if (!res.ok) {
      throw new Error(`Could not load surah data (HTTP ${res.status})`);
    }
    const data = await res.json();
    currentSurahData = data;

    // Render Reader Scaffold matching Stitch Page 2
    renderReaderScaffold(appContainer, currentChapterMeta, data);

    // Initial batch of verses
    const streamContainer = document.getElementById('verseStreamList');
    renderedVerseCount = 0;

    const initialCount = targetAyah
      ? Math.min(data.verses.length, Math.max(BATCH_SIZE, targetAyah + 5))
      : BATCH_SIZE;

    appendVerseBatch(streamContainer, data.verses, 0, initialCount);

    // Setup progressive infinite scroll
    setupInfiniteScroll(streamContainer, data.verses);

    // Setup scroll progress and ayah tracking
    setupScrollProgress(surahId, currentChapterMeta.name_simple, data.verses.length);

    // Scroll to target ayah if provided
    if (targetAyah) {
      setTimeout(() => {
        scrollToAyah(targetAyah);
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      saveLastRead(surahId, 1, currentChapterMeta.name_simple);
    }
  } catch (err) {
    console.error('Error loading surah:', err);
    appContainer.innerHTML = `
      <div style="max-width: 600px; margin: 80px auto; text-align: center; padding: 24px;">
        <h2 style="color: var(--primary);">Error Loading Surah ${surahId}</h2>
        <p style="color: var(--text-secondary); margin: 12px 0 24px;">${err.message}</p>
        <a href="#/" class="btn-jump-action" style="text-decoration: none;">Return to Surah Index</a>
      </div>
    `;
  }
}

/**
 * Render skeleton loading state
 */
function renderSkeleton(container, meta) {
  container.innerHTML = `
    <div style="max-width: var(--max-reading-width); margin: 32px auto; padding: 0 20px;">
      <div class="skeleton-box" style="text-align: center; align-items: center;">
        <div class="skeleton-bar" style="width: 140px; height: 32px;"></div>
        <div class="skeleton-bar" style="width: 260px; height: 48px; margin-top: 12px;"></div>
        <div class="skeleton-bar" style="width: 180px; height: 20px; margin-top: 8px;"></div>
      </div>
      <div class="skeleton-loader-stitch" style="margin-top: 24px;">
        <div class="skeleton-box"><div class="skeleton-bar" style="width: 100%;"></div><div class="skeleton-bar" style="width: 70%;"></div></div>
        <div class="skeleton-box"><div class="skeleton-bar" style="width: 100%;"></div><div class="skeleton-bar" style="width: 80%;"></div></div>
        <div class="skeleton-box"><div class="skeleton-bar" style="width: 100%;"></div><div class="skeleton-bar" style="width: 60%;"></div></div>
      </div>
    </div>
  `;
}

/**
 * Render reader layout matching Stitch Page 2
 */
function renderReaderScaffold(container, meta, data) {
  const showBismillah = meta.id !== 9 && meta.id !== 1;
  const prevId = meta.id > 1 ? meta.id - 1 : null;
  const nextId = meta.id < 114 ? meta.id + 1 : null;

  // Build Left Sidebar Surah items
  const sidebarItemsHtml = allChaptersMeta.map((c) => `
    <a href="#/${c.id}" class="browser-surah-row ${c.id === meta.id ? 'active' : ''}" data-revelation="${c.revelation_place.toLowerCase()}">
      <div class="browser-row-left">
        <div class="browser-row-num">${c.id}</div>
        <div class="browser-row-details">
          <span class="browser-row-name">${escapeHtml(c.name_simple)}</span>
          <span class="browser-row-meaning">${escapeHtml(c.translated_name)} · ${c.verses_count}v</span>
        </div>
      </div>
      <span class="browser-row-ar" lang="ar" dir="rtl">${escapeHtml(c.name_arabic)}</span>
    </a>
  `).join('');

  container.innerHTML = `
    <div class="reader-mushaf-layout">
      <!-- Left Collapsible Surah Browser Sidebar (Desktop 288px) -->
      <aside class="desktop-surah-browser" id="desktopSurahBrowser" aria-label="Surah Browser">
        <!-- Search input -->
        <div class="browser-search-wrap">
          <span class="material-symbols-outlined browser-search-icon">search</span>
          <input type="text" id="browserSearchInput" class="browser-search-input" placeholder="Surah name or # (e.g. 1)..." autocomplete="off">
        </div>

        <!-- Quick filter chips -->
        <div class="browser-chips-row">
          <button type="button" class="browser-chip active" data-filter="all">All (114)</button>
          <button type="button" class="browser-chip" data-filter="makkah">Meccan</button>
          <button type="button" class="browser-chip" data-filter="madinah">Medinan</button>
        </div>

        <!-- Surahs list container -->
        <div class="browser-surahs-stream" id="browserSurahsStream">
          ${sidebarItemsHtml}
        </div>
      </aside>

      <!-- Central Mushaf Reading Sanctuary (Max 860px) -->
      <div class="reading-sanctuary-center">
        <!-- Sticky Reading Action Sub-Bar -->
        <div class="reading-sticky-subbar" id="readingStickySubbar">
          <div class="subbar-content-row">
            <!-- Left: Back button & Title -->
            <div class="subbar-left-group">
              <a href="#/" class="subbar-back-btn" title="Back to all surahs" aria-label="Return to index">
                <span class="material-symbols-outlined">arrow_back</span>
              </a>
              <div style="display: flex; align-items: baseline; gap: 8px;">
                <h2 class="subbar-heading">${meta.id}. ${meta.name_simple}</h2>
                <span class="subbar-arabic-calligraphy" lang="ar" dir="rtl">${meta.name_arabic}</span>
              </div>
            </div>

            <!-- Middle Ayah Progress Indicator -->
            <div class="subbar-progress-pill">
              <span class="pulse-bullet"></span>
              <span>Ayah <strong id="subbarAyahNumber" style="color: var(--primary);">1</strong> of ${data.verses.length}</span>
            </div>

            <!-- Right Action Icons -->
            <div class="subbar-actions-right">
              <button type="button" class="subbar-action-icon" id="subbarDrawerTrigger" title="Reading Preferences" aria-label="Open Preferences">
                <span class="material-symbols-outlined">tune</span>
              </button>
              <button type="button" class="subbar-action-icon" id="subbarThemeTrigger" title="Switch Theme" aria-label="Toggle Theme">
                <span class="material-symbols-outlined">light_mode</span>
              </button>
            </div>
          </div>

          <!-- Thin Emerald Reading Progress Bar -->
          <div class="subbar-reading-progress-track">
            <div class="subbar-reading-progress-fill" id="subbarProgressFill" style="width: 0%;"></div>
          </div>
        </div>

        <!-- Surah Header Card (Classic Illumination Arch Motif) -->
        <section class="surah-header-rosette-card" aria-label="Surah information">
          <div class="rosette-crest-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <polygon points="12,2 15,9 22,9 16.5,14 19,21 12,17 5,21 7.5,14 2,9 9,9" stroke-linejoin="round"></polygon>
              <circle cx="12" cy="12" fill="currentColor" r="3"></circle>
            </svg>
          </div>

          <h1 class="surah-title-calligraphy-display" lang="ar" dir="rtl">${meta.name_arabic}</h1>
          <div class="surah-heading-english">${meta.id}. ${meta.name_simple}</div>
          <div class="surah-sub-meaning">${meta.translated_name}</div>

          <div class="surah-meta-chips-wrap">
            <span class="surah-meta-chip" style="text-transform: capitalize;">${meta.revelation_place} Revelation</span>
            <span class="surah-meta-chip">${data.verses.length} Verses</span>
          </div>
        </section>

        <!-- Bismillah Calligraphy Frame (if applicable) -->
        ${showBismillah ? `
          <div class="bismillah-ornament-card" aria-label="Bismillah">
            <div class="bismillah-text-display font-uthmani" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>
          </div>
        ` : ''}

        <!-- Verse Stream List -->
        <div class="verse-stream-list" id="verseStreamList" role="feed" aria-busy="false">
          <!-- Verses appended here -->
        </div>

        <!-- Infinite scroll sentinel -->
        <div id="scrollSentinel" style="height: 40px; margin: 24px 0;"></div>

        <!-- Surah Navigation Footer -->
        <nav class="surah-nav-footer-stitch" aria-label="Surah navigation">
          ${prevId ? `
            <a href="#/${prevId}" class="nav-bottom-btn">
              <span class="material-symbols-outlined">arrow_back</span>
              <span>Previous Surah</span>
            </a>
          ` : `<span class="nav-bottom-btn disabled">Previous Surah</span>`}

          <a href="#/" class="nav-bottom-btn">
            <span class="material-symbols-outlined">menu_book</span>
            <span>Surah Index</span>
          </a>

          ${nextId ? `
            <a href="#/${nextId}" class="nav-bottom-btn">
              <span>Next Surah</span>
              <span class="material-symbols-outlined">arrow_forward</span>
            </a>
          ` : `<span class="nav-bottom-btn disabled">Next Surah</span>`}
        </nav>
      </div>
    </div>
  `;

  // Attach sidebar search & filter handlers
  setupSidebarSearch();

  // Attach subbar drawer & theme handlers
  document.getElementById('subbarDrawerTrigger')?.addEventListener('click', () => {
    document.getElementById('drawerTriggerBtn')?.click();
  });
  document.getElementById('subbarThemeTrigger')?.addEventListener('click', () => {
    document.getElementById('themeToggleBtn')?.click();
  });
}

/**
 * Append a batch of verses to the stream
 */
function appendVerseBatch(container, allVerses, startIndex, count) {
  const endIndex = Math.min(startIndex + count, allVerses.length);
  const fragment = document.createDocumentFragment();

  for (let i = startIndex; i < endIndex; i++) {
    const verse = allVerses[i];
    const card = createVerseCard(verse);
    fragment.appendChild(card);
  }

  container.appendChild(fragment);
  renderedVerseCount = endIndex;
}

/**
 * Create a single verse card element matching Stitch Page 2
 */
function createVerseCard(verse) {
  const card = document.createElement('article');
  card.className = 'verse-card-stitch';
  card.id = `ayah-${verse.n}`;
  card.setAttribute('data-verse-num', verse.n);

  // Words HTML (dual script support)
  const wordsHtml = (verse.words || []).map((w) => `
    <div class="word-chip-card" tabindex="0" title="${escapeHtml(w.en || '')} — ${escapeHtml(w.ur || '')}">
      <span class="word-arabic-display script-uthmani font-uthmani" lang="ar" dir="rtl">${escapeHtml(w.uthmani)}</span>
      <span class="word-arabic-display script-indopak font-indopak" lang="ar" dir="rtl">${escapeHtml(w.indopak || w.uthmani)}</span>
      <span class="word-meaning-urdu font-urdu" lang="ur" dir="rtl">${escapeHtml(w.ur || '')}</span>
      <span class="word-meaning-english" lang="en" dir="ltr">${escapeHtml(w.en || '')}</span>
    </div>
  `).join('');

  // Translations
  const trMaududi = verse.tr && verse.tr['97'] ? verse.tr['97'] : '';
  const trJalandhari = verse.tr && verse.tr['234'] ? verse.tr['234'] : '';
  const trSahih = verse.tr && verse.tr['20'] ? verse.tr['20'] : '';

  card.innerHTML = `
    <!-- Top Bar: Ayah Badge & Action Icons -->
    <div class="verse-stitch-topbar">
      <div class="verse-badge-group">
        <div class="ayah-num-badge">${verse.key}</div>
        <span class="ayah-label-text">Verse ${verse.n}</span>
      </div>

      <div class="verse-action-buttons">
        <button class="verse-icon-btn copy-verse-action" type="button" aria-label="Copy verse text" title="Copy Ayah Arabic & Translation">
          <span class="material-symbols-outlined">content_copy</span>
        </button>
        <button class="verse-icon-btn share-verse-action" type="button" aria-label="Share verse link" title="Copy Link to Ayah">
          <span class="material-symbols-outlined">share</span>
        </button>
      </div>
    </div>

    <!-- Word-by-Word Interlinear Grid (RTL) -->
    <div class="words-interlinear-grid" dir="rtl">
      ${wordsHtml}
    </div>

    <!-- Full Verse Translations Block -->
    <div class="verse-translations-block">
      ${trMaududi ? `
        <div class="verse-translation-ur ur-maududi" data-translator="97">
          <span class="translator-pill-tag font-urdu" dir="rtl">سید ابوالاعلیٰ مودودی (تفہیم القرآن)</span>
          <p class="translation-paragraph-urdu font-urdu" lang="ur" dir="rtl">${escapeHtml(trMaududi)}</p>
        </div>
      ` : ''}

      ${trJalandhari ? `
        <div class="verse-translation-ur ur-jalandhari" data-translator="234">
          <span class="translator-pill-tag font-urdu" dir="rtl">فتح محمد جالندھری</span>
          <p class="translation-paragraph-urdu font-urdu" lang="ur" dir="rtl">${escapeHtml(trJalandhari)}</p>
        </div>
      ` : ''}

      ${trSahih ? `
        <div class="verse-translation-en">
          <span class="translator-pill-tag">Sahih International</span>
          <p class="translation-paragraph-english" lang="en" dir="ltr">${escapeHtml(trSahih)}</p>
        </div>
      ` : ''}
    </div>
  `;

  // Attach actions
  card.querySelector('.copy-verse-action').addEventListener('click', () => copyVerseContent(verse));
  card.querySelector('.share-verse-action').addEventListener('click', () => copyVerseLink(verse));

  return card;
}

/**
 * Copy formatted verse content
 */
function copyVerseContent(verse) {
  const settings = getSettings();
  const arabicText = settings.script === 'indopak' && verse.indopak ? verse.indopak : verse.uthmani;

  let text = `${arabicText}\n\n`;

  if (settings.showFullUr) {
    if (settings.urTranslator === '97' && verse.tr['97']) {
      text += `[اردو - مودودی]: ${verse.tr['97']}\n\n`;
    } else if (settings.urTranslator === '234' && verse.tr['234']) {
      text += `[اردو - جالندھری]: ${verse.tr['234']}\n\n`;
    } else {
      if (verse.tr['97']) text += `[اردو - مودودی]: ${verse.tr['97']}\n`;
      if (verse.tr['234']) text += `[اردو - جالندھری]: ${verse.tr['234']}\n`;
      text += '\n';
    }
  }

  if (settings.showFullEn && verse.tr['20']) {
    text += `[English - Sahih Intl]: ${verse.tr['20']}\n\n`;
  }

  text += `— Surah ${currentChapterMeta.name_simple} (${verse.key})`;

  navigator.clipboard.writeText(text).then(() => {
    showToast(`Ayah ${verse.key} copied to clipboard`);
  }).catch(() => {
    showToast('Failed to copy text');
  });
}

/**
 * Copy deep link to verse
 */
function copyVerseLink(verse) {
  const url = `${window.location.origin}${window.location.pathname}#/${currentChapterMeta.id}/${verse.n}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast(`Link to Ayah ${verse.key} copied`);
  }).catch(() => {
    showToast('Failed to copy link');
  });
}

/**
 * Setup Infinite Scroll via IntersectionObserver
 */
function setupInfiniteScroll(container, allVerses) {
  const sentinel = document.getElementById('scrollSentinel');
  if (!sentinel) return;

  intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting) {
      if (renderedVerseCount < allVerses.length) {
        appendVerseBatch(container, allVerses, renderedVerseCount, BATCH_SIZE);
      }
    }
  }, { rootMargin: '450px' });

  intersectionObserver.observe(sentinel);
}

/**
 * Setup Scroll Progress & Ayah Number Indicator
 */
function setupScrollProgress(surahId, surahName, totalVerses) {
  const subbarAyah = document.getElementById('subbarAyahNumber');
  const subbarProgressFill = document.getElementById('subbarProgressFill');

  let ticking = false;
  scrollTrackingListener = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = scrollHeight > 0 ? Math.min(100, Math.round((scrollTop / scrollHeight) * 100)) : 0;

        if (subbarProgressFill) {
          subbarProgressFill.style.width = `${pct}%`;
        }

        // Detect visible ayah card
        const cards = document.querySelectorAll('.verse-card-stitch');
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (rect.top >= 0 && rect.top <= window.innerHeight * 0.45) {
            const vNum = parseInt(card.getAttribute('data-verse-num'), 10);
            if (vNum) {
              if (subbarAyah) subbarAyah.textContent = vNum;
              saveLastRead(surahId, vNum, surahName);
            }
            break;
          }
        }

        ticking = false;
      });
      ticking = true;
    }
  };

  window.addEventListener('scroll', scrollTrackingListener, { passive: true });
}

/**
 * Smoothly scroll to a specific Ayah and highlight it
 */
export function scrollToAyah(ayahNumber) {
  if (!currentSurahData) return;

  const streamContainer = document.getElementById('verseStreamList');
  if (streamContainer && ayahNumber > renderedVerseCount) {
    appendVerseBatch(
      streamContainer,
      currentSurahData.verses,
      renderedVerseCount,
      ayahNumber - renderedVerseCount + 5
    );
  }

  const card = document.getElementById(`ayah-${ayahNumber}`);
  if (card) {
    const navHeight = 90;
    const elementPosition = card.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - navHeight;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    });

    card.classList.add('highlighted-verse');
    setTimeout(() => {
      card.classList.remove('highlighted-verse');
    }, 2200);
  }
}

/**
 * Setup Left Sidebar Search & Meccan/Medinan Chips
 */
function setupSidebarSearch() {
  const input = document.getElementById('browserSearchInput');
  const stream = document.getElementById('browserSurahsStream');
  const chips = document.querySelectorAll('.browser-chip');

  if (!input || !stream) return;

  let activeFilter = 'all';

  function applyFilter() {
    const q = input.value.toLowerCase().trim();
    const rows = stream.querySelectorAll('.browser-surah-row');

    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const rev = row.getAttribute('data-revelation') || '';

      const matchesQuery = !q || text.includes(q);
      const matchesChip = activeFilter === 'all' || rev.includes(activeFilter);

      row.style.display = matchesQuery && matchesChip ? 'flex' : 'none';
    });
  }

  input.addEventListener('input', applyFilter);

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter') || 'all';
      applyFilter();
    });
  });
}

/**
 * Clean up reader observers and listeners
 */
export function cleanupReader() {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  if (scrollTrackingListener) {
    window.removeEventListener('scroll', scrollTrackingListener);
    scrollTrackingListener = null;
  }
}

/**
 * Toast helper
 */
export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function updateNavActivePill(path) {
  document.querySelectorAll('.nav-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.getAttribute('data-path') === path);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

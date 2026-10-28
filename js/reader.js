/**
 * reader.js
 * Surah reader engine: lazy-loads surah JSON, renders batched verse cards,
 * manages word-by-word columns, full translations, and scroll progress tracking.
 */

import { saveLastRead, getSettings } from './settings.js';

let currentSurahData = null;
let currentChapterMeta = null;
let renderedVerseCount = 0;
const BATCH_SIZE = 25;
let intersectionObserver = null;
let scrollTrackingListener = null;

let allChaptersMeta = [];

/**
 * Main entry: loads and renders a Surah
 */
export async function loadAndRenderSurah(surahId, targetAyah = null, chapters = []) {
  allChaptersMeta = chapters;
  const appContainer = document.getElementById('app');
  const navReaderInfo = document.getElementById('navReaderInfo');
  const navSurahTitle = document.getElementById('navSurahTitle');
  const navProgressBar = document.getElementById('navProgressBar');

  // Find chapter metadata
  currentChapterMeta = chapters.find((c) => c.id === surahId) || {
    id: surahId,
    name_simple: `Surah ${surahId}`,
    name_arabic: '',
    translated_name: '',
    verses_count: 0,
    revelation_place: '',
  };

  // Update top navigation
  if (navReaderInfo) {
    navReaderInfo.style.display = 'block';
    navSurahTitle.textContent = `${currentChapterMeta.id}. ${currentChapterMeta.name_simple} (${currentChapterMeta.name_arabic})`;
    if (navProgressBar) navProgressBar.style.width = '0%';
  }

  // Update page title
  document.title = `${currentChapterMeta.name_simple} (${currentChapterMeta.name_arabic}) — Quran Study`;

  // Show Skeleton Loader
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

    // Render Reader Scaffold
    renderReaderScaffold(appContainer, currentChapterMeta, data);

    // Initial batch of verses
    const streamContainer = document.getElementById('verseStream');
    renderedVerseCount = 0;

    // If targetAyah is beyond initial batch, render up to targetAyah + 10
    const initialCount = targetAyah ? Math.min(data.verses.length, Math.max(BATCH_SIZE, targetAyah + 10)) : BATCH_SIZE;
    appendVerseBatch(streamContainer, data.verses, 0, initialCount);

    // Set up progressive batch loader for remaining verses
    setupInfiniteScroll(streamContainer, data.verses);

    // Set up scroll progress tracking and last-read saving
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
      <div class="reader-container" style="text-align: center; padding: 60px 16px;">
        <h2>Error Loading Surah ${surahId}</h2>
        <p style="color: var(--text-secondary); margin: 12px 0 24px;">${err.message}</p>
        <a href="#/" class="btn btn-primary">Return to Surah Index</a>
      </div>
    `;
  }
}

/**
 * Render skeleton loading state
 */
function renderSkeleton(container, meta) {
  container.innerHTML = `
    <div class="reader-container">
      <div class="skeleton-card">
        <div class="skeleton-line short" style="margin: 0 auto;"></div>
        <div class="skeleton-line medium" style="margin: 0 auto; height: 32px;"></div>
        <div class="skeleton-line short" style="margin: 0 auto;"></div>
      </div>
      <div class="skeleton-loader" style="margin-top: 24px;">
        <div class="skeleton-card"><div class="skeleton-line full"></div><div class="skeleton-line medium"></div></div>
        <div class="skeleton-card"><div class="skeleton-line full"></div><div class="skeleton-line medium"></div></div>
        <div class="skeleton-card"><div class="skeleton-line full"></div><div class="skeleton-line medium"></div></div>
      </div>
    </div>
  `;
}

/**
 * Render main reader layout
 */
function renderReaderScaffold(container, meta, data) {
  const showBismillah = meta.id !== 9 && meta.id !== 1;
  const prevId = meta.id > 1 ? meta.id - 1 : null;
  const nextId = meta.id < 114 ? meta.id + 1 : null;

  // Sidebar surah links
  const sidebarItemsHtml = allChaptersMeta.map((c) => `
    <a href="#/${c.id}" class="sidebar-surah-item ${c.id === meta.id ? 'active' : ''}">
      <span><strong>${c.id}.</strong> ${escapeHtml(c.name_simple)}</span>
      <span class="sidebar-surah-item-ar" lang="ar" dir="rtl">${escapeHtml(c.name_arabic)}</span>
    </a>
  `).join('');

  container.innerHTML = `
    <div class="reader-layout-wrapper">
      <!-- Desktop Collapsible Surah Sidebar -->
      <aside class="desktop-surah-sidebar" id="desktopSurahSidebar" aria-label="Surahs list">
        <div class="sidebar-header">
          <div class="sidebar-title-row">
            <h3>All Surahs (114)</h3>
          </div>
          <input type="text" id="sidebarSurahFilter" class="sidebar-search-input" placeholder="Quick filter...">
        </div>
        <div class="sidebar-surahs-list" id="sidebarSurahsList">
          ${sidebarItemsHtml}
        </div>
      </aside>

      <!-- Center Reading Column -->
      <div class="reader-container">
        <!-- Surah Header Card -->
        <section class="surah-header-card" aria-label="Surah information">
          <div class="surah-header-ornament">۞</div>
          <h1 class="surah-header-title-ar" lang="ar" dir="rtl">${meta.name_arabic}</h1>
          <h2 class="surah-header-title-en">${meta.id}. ${meta.name_simple}</h2>
          <p class="surah-header-meaning">${meta.translated_name}</p>
          <div class="surah-header-meta">
            <span class="revelation-tag">${meta.revelation_place}</span>
            <span>•</span>
            <span>${data.verses.length} Verses</span>
          </div>
        </section>

        <!-- Bismillah (if applicable) -->
        ${showBismillah ? `
          <div class="bismillah-card" aria-label="Bismillah">
            <div class="bismillah-text" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>
          </div>
        ` : ''}

        <!-- Verse Stream Container -->
        <div class="verse-stream" id="verseStream" role="feed" aria-busy="false">
          <!-- Verses dynamically appended here -->
        </div>

        <!-- Infinite scroll sentinel anchor -->
        <div id="scrollSentinel" style="height: 40px; margin: 20px 0;"></div>

        <!-- Surah Navigation Footer -->
        <nav class="surah-nav-footer" aria-label="Surah navigation">
          ${prevId ? `
            <a href="#/${prevId}" class="nav-surah-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              <span>Previous Surah</span>
            </a>
          ` : `<span class="nav-surah-btn disabled">Previous Surah</span>`}

          <a href="#/" class="nav-surah-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
            <span>Index</span>
          </a>

          ${nextId ? `
            <a href="#/${nextId}" class="nav-surah-btn">
              <span>Next Surah</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </a>
          ` : `<span class="nav-surah-btn disabled">Next Surah</span>`}
        </nav>
      </div>
    </div>
  `;

  // Filter in sidebar
  const sidebarFilter = document.getElementById('sidebarSurahFilter');
  const sidebarList = document.getElementById('sidebarSurahsList');
  if (sidebarFilter && sidebarList) {
    sidebarFilter.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = sidebarList.querySelectorAll('.sidebar-surah-item');
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? 'flex' : 'none';
      });
    });
  }
}

/**
 * Append a batch of verses to the stream
 */
function appendVerseBatch(container, allVerses, startIndex, count) {
  const endIndex = Math.min(startIndex + count, allVerses.length);
  const fragment = document.createDocumentFragment();

  for (let i = startIndex; i < endIndex; i++) {
    const verse = allVerses[i];
    const verseCard = createVerseCard(verse);
    fragment.appendChild(verseCard);
  }

  container.appendChild(fragment);
  renderedVerseCount = endIndex;
}

/**
 * Create a single verse card element
 */
function createVerseCard(verse) {
  const card = document.createElement('article');
  card.className = 'verse-card';
  card.id = `ayah-${verse.n}`;
  card.setAttribute('data-verse-num', verse.n);

  const settings = getSettings();

  // Words HTML
  const wordsHtml = (verse.words || []).map((w) => {
    return `
      <div class="word-box" tabindex="0" title="${escapeHtml(w.en || '')} — ${escapeHtml(w.ur || '')}">
        <span class="word-arabic script-uthmani" lang="ar" dir="rtl">${escapeHtml(w.uthmani)}</span>
        <span class="word-arabic script-indopak" lang="ar" dir="rtl">${escapeHtml(w.indopak || w.uthmani)}</span>
        <span class="word-ur" lang="ur" dir="rtl">${escapeHtml(w.ur || '')}</span>
        <span class="word-en" lang="en" dir="ltr">${escapeHtml(w.en || '')}</span>
      </div>
    `;
  }).join('');

  // Full Urdu Translations
  const trMaududi = verse.tr && verse.tr['97'] ? verse.tr['97'] : '';
  const trJalandhari = verse.tr && verse.tr['234'] ? verse.tr['234'] : '';
  const trSahih = verse.tr && verse.tr['20'] ? verse.tr['20'] : '';

  card.innerHTML = `
    <div class="verse-toolbar">
      <div class="verse-badge">
        <span>${verse.key}</span>
      </div>

      <div class="verse-actions">
        <button class="action-btn copy-verse-btn" aria-label="Copy verse text" title="Copy verse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>

        <button class="action-btn share-verse-btn" aria-label="Share verse link" title="Copy link to verse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        </button>
      </div>
    </div>

    <!-- Word by word layout -->
    <div class="words-container" dir="rtl">
      ${wordsHtml}
    </div>

    <!-- Full translations -->
    <div class="translations-wrap">
      ${trMaududi ? `
        <div class="translation-block full-translation-ur ur-maududi" data-translator="97">
          <div class="translation-header">
            <span class="translator-tag">مودودی (تفہیم القرآن)</span>
          </div>
          <p lang="ur" dir="rtl">${escapeHtml(trMaududi)}</p>
        </div>
      ` : ''}

      ${trJalandhari ? `
        <div class="translation-block full-translation-ur ur-jalandhari" data-translator="234">
          <div class="translation-header">
            <span class="translator-tag">فتح محمد جالندھری</span>
          </div>
          <p lang="ur" dir="rtl">${escapeHtml(trJalandhari)}</p>
        </div>
      ` : ''}

      ${trSahih ? `
        <div class="translation-block full-translation-en">
          <div class="translation-header">
            <span class="translator-tag">Sahih International</span>
          </div>
          <p lang="en" dir="ltr">${escapeHtml(trSahih)}</p>
        </div>
      ` : ''}
    </div>
  `;

  // Attach button events
  const copyBtn = card.querySelector('.copy-verse-btn');
  copyBtn.addEventListener('click', () => copyVerseContent(verse));

  const shareBtn = card.querySelector('.share-verse-btn');
  shareBtn.addEventListener('click', () => copyVerseLink(verse));

  return card;
}

/**
 * Copy formatted verse content to clipboard
 */
function copyVerseContent(verse) {
  const settings = getSettings();
  const arabicText = settings.script === 'indopak' && verse.indopak ? verse.indopak : verse.uthmani;

  let textToCopy = `${arabicText}\n\n`;

  if (settings.showFullUr) {
    if (settings.urTranslator === '97' && verse.tr['97']) {
      textToCopy += `[اردو - مودودی]: ${verse.tr['97']}\n\n`;
    } else if (settings.urTranslator === '234' && verse.tr['234']) {
      textToCopy += `[اردو - جالندھری]: ${verse.tr['234']}\n\n`;
    } else {
      if (verse.tr['97']) textToCopy += `[اردو - مودودی]: ${verse.tr['97']}\n`;
      if (verse.tr['234']) textToCopy += `[اردو - جالندھری]: ${verse.tr['234']}\n`;
      textToCopy += '\n';
    }
  }

  if (settings.showFullEn && verse.tr['20']) {
    textToCopy += `[English]: ${verse.tr['20']}\n\n`;
  }

  textToCopy += `— Surah ${currentChapterMeta.name_simple} (${verse.key})`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    showToast(`Verse ${verse.key} copied to clipboard`);
  }).catch(() => {
    showToast('Failed to copy text');
  });
}

/**
 * Copy verse deep link
 */
function copyVerseLink(verse) {
  const url = `${window.location.origin}${window.location.pathname}#/${currentChapterMeta.id}/${verse.n}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast(`Link to verse ${verse.key} copied`);
  }).catch(() => {
    showToast('Failed to copy link');
  });
}

/**
 * Setup IntersectionObserver for infinite scrolling long surahs
 */
function setupInfiniteScroll(streamContainer, allVerses) {
  const sentinel = document.getElementById('scrollSentinel');
  if (!sentinel) return;

  intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting) {
      if (renderedVerseCount < allVerses.length) {
        appendVerseBatch(streamContainer, allVerses, renderedVerseCount, BATCH_SIZE);
      }
    }
  }, { rootMargin: '400px' });

  intersectionObserver.observe(sentinel);
}

/**
 * Setup scroll progress indicator and last-read update
 */
function setupScrollProgress(surahId, surahName, totalVerses) {
  const navProgressBar = document.getElementById('navProgressBar');

  let ticking = false;
  scrollTrackingListener = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollHeight > 0 ? Math.min(100, Math.round((scrollTop / scrollHeight) * 100)) : 0;

        if (navProgressBar) {
          navProgressBar.style.width = `${progress}%`;
        }

        // Determine currently visible verse for saving last read
        const verseCards = document.querySelectorAll('.verse-card');
        for (const card of verseCards) {
          const rect = card.getBoundingClientRect();
          if (rect.top >= 0 && rect.top <= window.innerHeight * 0.5) {
            const vNum = parseInt(card.getAttribute('data-verse-num'), 10);
            if (vNum) {
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
 * Scroll to a specific ayah smoothly and highlight it
 */
export function scrollToAyah(ayahNumber) {
  if (!currentSurahData) return;

  // If the verse card hasn't been rendered yet, append all verses up to ayahNumber
  const streamContainer = document.getElementById('verseStream');
  if (streamContainer && ayahNumber > renderedVerseCount) {
    appendVerseBatch(streamContainer, currentSurahData.verses, renderedVerseCount, ayahNumber - renderedVerseCount + 10);
  }

  const card = document.getElementById(`ayah-${ayahNumber}`);
  if (card) {
    const navHeight = 70;
    const elementPosition = card.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - navHeight;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    });

    card.classList.add('highlighted-verse');
    setTimeout(() => {
      card.classList.remove('highlighted-verse');
    }, 2000);
  }
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
 * Toast utility
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

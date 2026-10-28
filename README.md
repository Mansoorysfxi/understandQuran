# 📖 Quran Study (القرآن الكريم)

A fast, static, responsive Quran study website hosted directly on **GitHub Pages**.

Designed with a calm, book-like aesthetic for deep reading and study with **word-by-word meanings in Urdu and English**, multiple Arabic script styles, and complete translations.

---

## ✨ Features

- **Dual Arabic Scripts:** Switch seamlessly between **Uthmani** (Madinah Mushaf) and **IndoPak** (Subcontinent / Pakistani Nastaliq style).
- **Word-by-Word Breakdown:**
  - **Urdu:** Authentic word-by-word *Lafzi Tarjuma* (لفظی ترجمہ) under every Arabic word.
  - **English:** Clear word-for-word glosses.
  - Interactive highlighting on hover/tap.
- **Multiple Complete Translations:**
  - **Urdu:** Syed Abul A'la Maududi (*Tafheem-ul-Quran*)
  - **Urdu:** Fatah Muhammad Jalandhari (*فتح محمد جالندھری*)
  - **English:** Sahih International
  - Toggle each translation independently or compare Maududi and Jalandhari side-by-side.
- **Thoughtful Reading Experience:**
  - **Themes:** Light, Sepia (warm book paper), and Dark (night reading), defaulting to system preference.
  - **Customizable Typography:** Independent font size sliders for Arabic, Urdu, and English.
  - **Fonts:** `Amiri Quran` / `Amiri` for Uthmani, `Gulzar` for IndoPak, `Noto Nastaliq Urdu` for Urdu, and `Inter` for clean UI.
- **Navigation & Usability:**
  - Full surah index with search filtering (by chapter number, English name, or Arabic name).
  - Deep linking (`#/2`, `#/2/255`) and hash routing.
  - Quick Search modal accessible via `/` keyboard shortcut.
  - "Continue Reading" resume card remembering your last read position via `localStorage`.
  - One-click copy for verse text with translations and copyable deep links.
- **High Performance & Offline Support:**
  - Zero runtime external API dependencies; reads only pre-fetched local JSON.
  - Lazy-loads only the active chapter and renders long surahs progressively using `IntersectionObserver`.
  - Includes a Service Worker (`sw.js`) that caches visited surahs for offline study.
  - Fully responsive: tested on mobile (360px), tablet (768px), and desktop (1280px).

---

## 📁 Repository Structure

```
├── .nojekyll                 # Ensures GitHub Pages serves data directories without Jekyll
├── index.html                # Single-page application root
├── sw.js                     # Offline caching service worker
├── css/
│   └── styles.css            # Responsive styles and color themes (Light, Sepia, Dark)
├── js/
│   ├── app.js                # Application entry point, search, and event orchestration
│   ├── router.js             # Hash-based client router (#/, #/{surah}, #/{surah}/{ayah})
│   ├── reader.js             # Verse card rendering, word columns, and progress tracking
│   └── settings.js           # Settings persistence and DOM variable management
├── data/
│   ├── chapters.json         # 114 Surahs metadata (names, verses, revelation place)
│   ├── meta.json             # Translation metadata, dates, and licensing
│   └── surah/
│       ├── 001.json          # Chapter 1 (Al-Fatihah)
│       └── ...               # Chapters 002 to 114
├── scripts/
│   └── fetch-data.mjs        # Node 18+ data pipeline script to download and validate data
└── README.md
```

---

## 🚀 Setup & Data Pipeline

### 1. Requirements
- Node.js 18+ (uses native `fetch`)

### 2. Fetch or Update Quran Data
To re-fetch all 114 surahs and run full validation against Quran.com API v4:

```bash
# Fetch all surahs (skips already downloaded surahs)
node scripts/fetch-data.mjs

# Re-fetch all surahs from scratch
node scripts/fetch-data.mjs --force

# Fetch a single surah (e.g. Surah 1)
node scripts/fetch-data.mjs --surah 1 --force

# List available translations from Quran.com API
node scripts/fetch-data.mjs --list-translations
```

The script automatically:
1. Fetches chapter metadata to `data/chapters.json`.
2. Downloads word-by-word English and Urdu data in two parallel-safe sequential passes.
3. Downloads full translations for Maududi (97), Jalandhari (234), and Sahih International (20).
4. Strips verse-end markers and footnote HTML tags.
5. Verifies all 114 chapters and confirms the exact 6,236 total verse count.

---

## 🌐 Deploying to GitHub Pages

1. **Commit and push** the repository, ensuring `data/` and `.nojekyll` are included:
   ```bash
   git add .
   git commit -m "Initial Quran study static website with data"
   git push origin main
   ```
2. In your GitHub repository:
   - Navigate to **Settings** → **Pages**.
   - Under **Build and deployment**:
     - Source: **Deploy from a branch**
     - Branch: **`main`** / Folder: **`/(root)`**
   - Click **Save**.
3. Your site will be live at `https://<username>.github.io/<repository-name>/`.
   *(All asset paths are relative, so it works under any subfolder).*

---

## 📜 Licensing & Attribution

- **Quranic Text:** In the public domain.
- **Word-by-Word & Verse Translations:** Sourced via the [Quran.com API v4](https://api.quran.com). Translations remain the intellectual property and copyright of their respective authors and publishers:
  - *Tafheem-ul-Quran* by Syed Abul A'la Maududi (Urdu)
  - Fatah Muhammad Jalandhari (Urdu)
  - Sahih International (English)
- **Review Notice:** Please review [Quran.com's Terms of Use](https://quran.com) and individual translation licenses before public distribution or commercial use.

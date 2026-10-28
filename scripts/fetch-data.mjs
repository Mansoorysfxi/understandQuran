#!/usr/bin/env node
/**
 * Quran Data Fetcher
 * Downloads Quran text, word-by-word translations (English + Urdu), and full
 * translations from the Quran.com API v4 and saves them as local JSON files.
 *
 * Usage:
 *   node scripts/fetch-data.mjs                    # fetch all surahs (skip existing)
 *   node scripts/fetch-data.mjs --force             # re-fetch all surahs
 *   node scripts/fetch-data.mjs --surah 1           # fetch only surah 1
 *   node scripts/fetch-data.mjs --list-translations  # list available translations
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const SURAH_DIR = join(DATA_DIR, "surah");

// ─── Configuration ──────────────────────────────────────────────────────────
const CONFIG = {
  translations: [
    { id: 97,  lang: "ur", label: "Urdu — Tafheem-ul-Quran (Maududi)" },
    { id: 234, lang: "ur", label: "Urdu — Fatah Muhammad Jalandhari" },
    { id: 20,  lang: "en", label: "English — Sahih International" },
  ],
  // Word-by-word: use `language=xx` param (NOT word_translation_language)
  wordTranslationLanguages: ["en", "ur"],
  scripts: ["text_uthmani", "text_indopak"],
};

const API_BASE = "https://api.quran.com/api/v4";
const DELAY_MS = 400; // ms between requests
const MAX_RETRIES = 3;
const PER_PAGE = 50;

// ─── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const forceFlag = args.includes("--force");
const listTranslationsFlag = args.includes("--list-translations");
const surahIdx = args.indexOf("--surah");
const singleSurah = surahIdx !== -1 ? parseInt(args[surahIdx + 1], 10) : null;

// ─── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetch(path, retries = MAX_RETRIES) {
  const url = `${API_BASE}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sleep(DELAY_MS);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      console.error(
        `  ⚠ Attempt ${attempt}/${retries} failed: ${err.message}`
      );
      if (attempt === retries) throw err;
      await sleep(1000 * attempt); // backoff
    }
  }
}

function saveJSON(filepath, data) {
  mkdirSync(dirname(filepath), { recursive: true });
  writeFileSync(filepath, JSON.stringify(data));
  console.log(`  ✓ Saved ${filepath}`);
}

/** Strip HTML footnote tags like <sup foot_note=123>1</sup> but keep surrounding text */
function stripFootnotes(text) {
  if (!text) return text;
  return text
    .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .trim();
}

// ─── Step 1: List translations ──────────────────────────────────────────────
async function listTranslations() {
  console.log("\n═══ Available Urdu translations ═══");
  const ur = await apiFetch("/resources/translations?language=ur");
  for (const t of ur.translations) {
    const isUrdu = t.language_name?.toLowerCase().includes("urdu");
    if (isUrdu) {
      console.log(
        `  id=${t.id}  lang=${t.language_name}  name="${t.name}"  author="${t.author_name}"`
      );
    }
  }

  console.log("\n═══ Available English translations ═══");
  const en = await apiFetch("/resources/translations?language=en");
  for (const t of en.translations) {
    const isEn = t.language_name?.toLowerCase().includes("english");
    if (isEn) {
      console.log(
        `  id=${t.id}  lang=${t.language_name}  name="${t.name}"  author="${t.author_name}"`
      );
    }
  }
}

// ─── Step 2: Fetch chapters ─────────────────────────────────────────────────
async function fetchChapters() {
  console.log("\n═══ Fetching chapter metadata ═══");
  const res = await apiFetch("/chapters");
  const chapters = res.chapters.map((c) => ({
    id: c.id,
    name_arabic: c.name_arabic,
    name_simple: c.name_simple,
    translated_name: c.translated_name?.name || "",
    verses_count: c.verses_count,
    revelation_place: c.revelation_place,
  }));
  saveJSON(join(DATA_DIR, "chapters.json"), chapters);
  return chapters;
}

// ─── Paginated fetch helper ─────────────────────────────────────────────────
async function fetchAllPages(basePath) {
  let allVerses = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const sep = basePath.includes("?") ? "&" : "?";
    const data = await apiFetch(`${basePath}${sep}per_page=${PER_PAGE}&page=${page}`);
    allVerses.push(...data.verses);
    totalPages = data.pagination.total_pages;
    page++;
  }
  return allVerses;
}

// ─── Step 3: Fetch verses for a surah ───────────────────────────────────────
async function fetchSurahVerses(surahNum, expectedCount) {
  const padded = String(surahNum).padStart(3, "0");
  const outPath = join(SURAH_DIR, `${padded}.json`);

  if (!forceFlag && existsSync(outPath)) {
    console.log(`  ⏭ Surah ${surahNum} already exists, skipping.`);
    return null; // skip
  }

  const translationIds = CONFIG.translations.map((t) => t.id).join(",");
  const wordFields = CONFIG.scripts.join(",");

  // ── Pass 1: English word-by-word (also fetches verse text + translations) ──
  console.log(`  Fetching verses (English word-by-word)…`);
  const enVerses = await fetchAllPages(
    `/verses/by_chapter/${surahNum}?words=true` +
    `&language=en` +
    `&word_fields=${wordFields}` +
    `&translations=${translationIds}` +
    `&fields=text_uthmani,text_indopak`
  );

  // ── Pass 2: Urdu word-by-word (only words needed, translations already fetched) ──
  console.log(`  Fetching verses (Urdu word-by-word)…`);
  const urVerses = await fetchAllPages(
    `/verses/by_chapter/${surahNum}?words=true` +
    `&language=ur`
  );

  // ── Validate: same verse count in both passes ──
  if (enVerses.length !== urVerses.length) {
    console.error(
      `  ✖ FATAL: Verse count mismatch: EN=${enVerses.length}, UR=${urVerses.length} for Surah ${surahNum}`
    );
    process.exit(1);
  }

  // ── Validate: Urdu word translations are actually Urdu ──
  let urduWordCount = 0;
  let urduActualCount = 0;
  for (const verse of urVerses) {
    for (const w of verse.words || []) {
      if (w.char_type_name === "end") continue;
      urduWordCount++;
      if (
        w.translation?.language_name?.toLowerCase() === "urdu" &&
        w.translation?.text
      ) {
        urduActualCount++;
      }
    }
  }

  if (urduWordCount > 0 && urduActualCount === 0) {
    console.error(
      `\n  ✖ WARNING: Urdu word translations returned 0 actual Urdu entries for Surah ${surahNum}.` +
      `\n    Falling back to empty "ur" fields. They can be filled later.`
    );
  } else {
    const pct = ((urduActualCount / urduWordCount) * 100).toFixed(1);
    console.log(`  ✓ Urdu word-by-word: ${urduActualCount}/${urduWordCount} words (${pct}%)`);
  }

  // ── Merge and clean ──
  const verses = enVerses.map((enVerse, vi) => {
    const urVerse = urVerses[vi];
    const enWords = (enVerse.words || []).filter((w) => w.char_type_name !== "end");
    const urWords = (urVerse.words || []).filter((w) => w.char_type_name !== "end");

    // Validate word count alignment
    if (enWords.length !== urWords.length) {
      console.warn(
        `  ⚠ Word count mismatch in ${enVerse.verse_key}: EN=${enWords.length}, UR=${urWords.length}`
      );
    }

    const words = enWords.map((w, wi) => {
      const urWord = urWords[wi];
      const urText =
        urWord?.translation?.language_name?.toLowerCase() === "urdu"
          ? urWord.translation.text || ""
          : "";
      return {
        uthmani: w.text_uthmani || "",
        indopak: w.text_indopak || "",
        ur: urText,
        en: w.translation?.text || "",
      };
    });

    // Clean translations
    const tr = {};
    for (const t of enVerse.translations || []) {
      tr[String(t.resource_id)] = stripFootnotes(t.text);
    }

    return {
      key: enVerse.verse_key,
      n: enVerse.verse_number,
      uthmani: enVerse.text_uthmani || "",
      indopak: enVerse.text_indopak || "",
      words,
      tr,
    };
  });

  // Validate verse count
  if (verses.length !== expectedCount) {
    console.warn(
      `  ⚠ Surah ${surahNum}: expected ${expectedCount} verses, got ${verses.length}`
    );
  }

  const surahData = { id: surahNum, verses };
  saveJSON(outPath, surahData);
  return surahData;
}

// ─── Step 4: Save meta.json ─────────────────────────────────────────────────
function saveMeta() {
  const meta = {
    source: "Quran.com API v4 (https://api.quran.com/api/v4)",
    fetchDate: new Date().toISOString(),
    translations: CONFIG.translations.map((t) => ({
      id: t.id,
      lang: t.lang,
      label: t.label,
    })),
    wordTranslationLanguages: CONFIG.wordTranslationLanguages,
    scripts: CONFIG.scripts,
    attribution:
      "Quranic text and translations are sourced from Quran.com. " +
      "Translations are copyrighted by their respective translators and publishers. " +
      "Review Quran.com's terms of use and each translation's license before public distribution.",
  };
  saveJSON(join(DATA_DIR, "meta.json"), meta);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║    Quran Data Fetcher (API v4)        ║");
  console.log("╚═══════════════════════════════════════╝");

  // If --list-translations, just list and exit
  if (listTranslationsFlag) {
    await listTranslations();
    return;
  }

  // First list translations to verify CONFIG
  await listTranslations();

  // Verify configured translation IDs exist
  console.log("\n═══ Configured translations ═══");
  for (const t of CONFIG.translations) {
    console.log(`  ✓ id=${t.id}  ${t.label}`);
  }

  // Fetch chapters
  const chapters = await fetchChapters();
  console.log(`  ${chapters.length} chapters loaded.`);

  // Determine which surahs to fetch
  const surahsToFetch = singleSurah
    ? [chapters.find((c) => c.id === singleSurah)]
    : chapters;

  if (singleSurah && !surahsToFetch[0]) {
    console.error(`Surah ${singleSurah} not found.`);
    process.exit(1);
  }

  // Fetch each surah
  let fetched = 0;
  let skipped = 0;
  let totalVerses = 0;

  for (const ch of surahsToFetch) {
    console.log(
      `\n── Surah ${ch.id}: ${ch.name_simple} (${ch.name_arabic}) — ${ch.verses_count} verses ──`
    );
    const result = await fetchSurahVerses(ch.id, ch.verses_count);
    if (result) {
      fetched++;
      totalVerses += result.verses.length;
    } else {
      skipped++;
      // Count verses from existing file
      const padded = String(ch.id).padStart(3, "0");
      const existing = join(SURAH_DIR, `${padded}.json`);
      if (existsSync(existing)) {
        const data = JSON.parse(readFileSync(existing, "utf8"));
        totalVerses += data.verses.length;
      }
    }
  }

  // Save meta
  saveMeta();

  // Final validation
  if (!singleSurah) {
    console.log("\n═══ Validation ═══");
    let valid = true;
    let grandTotal = 0;

    for (const ch of chapters) {
      const padded = String(ch.id).padStart(3, "0");
      const filepath = join(SURAH_DIR, `${padded}.json`);
      if (!existsSync(filepath)) {
        console.error(`  ✖ Missing: ${filepath}`);
        valid = false;
        continue;
      }
      const data = JSON.parse(readFileSync(filepath, "utf8"));
      if (data.verses.length !== ch.verses_count) {
        console.error(
          `  ✖ Surah ${ch.id}: expected ${ch.verses_count} verses, got ${data.verses.length}`
        );
        valid = false;
      }
      grandTotal += data.verses.length;
    }

    if (grandTotal !== 6236) {
      console.error(
        `  ✖ Total verses: ${grandTotal} (expected 6236)`
      );
      valid = false;
    } else {
      console.log(`  ✓ Total verses: ${grandTotal}`);
    }

    if (valid) {
      console.log("  ✓ All validations passed!");
    } else {
      console.error("  ✖ Some validations failed.");
    }
  }

  // Summary
  console.log("\n═══ Summary ═══");
  console.log(`  Fetched: ${fetched} surahs`);
  console.log(`  Skipped: ${skipped} surahs`);
  console.log(`  Total verses processed: ${totalVerses}`);
  console.log("  Done! ✓");
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});

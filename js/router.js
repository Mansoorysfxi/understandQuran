/**
 * router.js
 * Client-side hash router for GitHub Pages static hosting.
 * Handles routes:
 *   #/             -> Home / Surah Index
 *   #/{surah}      -> Surah Reader (e.g. #/2)
 *   #/{surah}/{ayah} -> Surah Reader focused on specific ayah (e.g. #/2/255)
 *   #/about        -> About & Attribution
 */

export class Router {
  constructor(routes = {}) {
    this.routes = routes;
    this.currentRoute = null;

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  init() {
    this.handleRoute();
  }

  handleRoute() {
    const rawHash = window.location.hash || '#/';
    // Strip leading '#' and split by '/'
    const cleanPath = rawHash.replace(/^#\/?/, '');
    const parts = cleanPath.split('/').filter(Boolean);

    let route = 'home';
    let params = {};

    if (parts.length === 0 || parts[0] === '') {
      route = 'home';
    } else if (parts[0] === 'about') {
      route = 'about';
    } else {
      const surahNum = parseInt(parts[0], 10);
      if (!isNaN(surahNum) && surahNum >= 1 && surahNum <= 114) {
        route = 'reader';
        params.surah = surahNum;
        if (parts[1]) {
          const ayahNum = parseInt(parts[1], 10);
          if (!isNaN(ayahNum)) {
            params.ayah = ayahNum;
          }
        }
      } else {
        route = 'home';
      }
    }

    this.currentRoute = { route, params, rawHash };

    const handler = this.routes[route] || this.routes.home;
    if (typeof handler === 'function') {
      handler(params);
    }
  }

  navigate(hash) {
    if (!hash.startsWith('#')) {
      hash = '#' + hash;
    }
    window.location.hash = hash;
  }
}

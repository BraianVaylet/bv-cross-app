// Aplica el tema y el acento antes del primer paint para evitar parpadeo (FOUC).
// La lógica de derivación del acento debe coincidir con src/lib/theme.tsx.
(function () {
  try {
    var saved = localStorage.getItem('bv-theme');
    var dark = saved
      ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#191B16' : '#F7F8F3');

    var ACCENTS = {
      orange: '#FF5722',
      green: '#2F9E6F',
      blue: '#307BD1',
      red: '#D13030',
      yellow: '#E0A92E',
      magenta: '#C430D1',
    };
    var DARK_INK = '#2A1206';
    var base = ACCENTS[localStorage.getItem('bv-accent')] || ACCENTS.orange;

    function rgb(hex) {
      var h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function toHex(r, g, b) {
      function p(n) {
        return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      }
      return '#' + p(r) + p(g) + p(b);
    }
    function mix(hex, target, amt) {
      var a = rgb(hex);
      var t = rgb(target);
      return toHex(a[0] + (t[0] - a[0]) * amt, a[1] + (t[1] - a[1]) * amt, a[2] + (t[2] - a[2]) * amt);
    }
    function lum(hex) {
      var c = rgb(hex).map(function (v) {
        var x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function contrast(a, b) {
      var hi = Math.max(a, b);
      var lo = Math.min(a, b);
      return (hi + 0.05) / (lo + 0.05);
    }

    var accent = dark ? mix(base, '#ffffff', 0.12) : base;
    var l = lum(accent);
    var onAccent = contrast(l, 1) >= contrast(l, lum(DARK_INK)) ? '#ffffff' : DARK_INK;
    var strong = dark ? mix(accent, '#ffffff', 0.18) : mix(accent, '#000000', 0.16);
    var soft = dark ? mix(accent, '#000000', 0.8) : mix(accent, '#ffffff', 0.86);
    var s = document.documentElement.style;
    s.setProperty('--c-accent', accent);
    s.setProperty('--c-accent-strong', strong);
    s.setProperty('--c-accent-soft', soft);
    s.setProperty('--c-on-accent', onAccent);
  } catch (e) {
    /* sin acceso a storage: tema claro + acento naranja por defecto */
  }
})();

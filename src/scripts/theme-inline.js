(function () {
  var root = document.documentElement;
  var key = 'theme';
  var saved = null;
  try {
    saved = localStorage.getItem(key);
  } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  root.setAttribute('data-js', '');

  function current() {
    var set = root.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function sync() {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    var dark = current() === 'dark';
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    var label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? 'Dark theme' : 'Light theme';
    var icon = button.querySelector('[data-theme-icon]');
    if (icon) {
      icon.setAttribute(
        'd',
        dark
          ? 'M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z'
          : 'M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
      );
      if (dark) {
        icon.removeAttribute('fill');
        icon.removeAttribute('stroke-linecap');
      } else {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke-linecap', 'round');
      }
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-theme-toggle]')) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem(key, next);
    } catch (e) {}
    sync();
  });
  document.addEventListener('DOMContentLoaded', sync);
  // Runs before the first paint, so the pressed look never flashes for light-theme visitors.
  requestAnimationFrame(sync);
})();

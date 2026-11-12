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
    if (button) button.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
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

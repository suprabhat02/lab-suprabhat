/** Marks the explainer section currently being read in the "On this page" nav. Loaded lazily. */
export function watchToc(nav: HTMLElement): void {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const pairs = links.flatMap((link) => {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    return target ? [{ link, target }] : [];
  });
  if (pairs.length === 0) return;

  const details = nav.querySelector('details');
  const wide = window.matchMedia('(width >= 64rem)');
  if (details && wide.matches) details.open = true;

  // A section counts as current once its heading passes this line, a third of the way down the viewport.
  const line = () => window.innerHeight / 3;
  let current: HTMLAnchorElement | null = null;

  const update = () => {
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    let next: HTMLAnchorElement | null = null;
    for (const { link, target } of pairs) {
      if (target.getBoundingClientRect().top <= line()) next = link;
    }
    const firstTop = pairs[0]?.target.getBoundingClientRect().top ?? 0;
    if (atBottom && firstTop < window.innerHeight) next = pairs.at(-1)?.link ?? next;
    if (next === current) return;
    current?.removeAttribute('aria-current');
    next?.setAttribute('aria-current', 'location');
    current = next;
  };

  const observer = new IntersectionObserver(update, { rootMargin: '0px 0px -66% 0px' });
  for (const { target } of pairs) observer.observe(target);
  // A fast jump can skip a heading past the band without an intersection change; catch up afterwards.
  const win: EventTarget = window;
  if ('onscrollend' in win) win.addEventListener('scrollend', update, { passive: true });
  else {
    let queued = false;
    win.addEventListener(
      'scroll',
      () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          update();
        });
      },
      { passive: true },
    );
  }
  update();
}

export {};

const app = document.querySelector<HTMLElement>('[data-audit-app]');
if (app) {
  let loading = false;
  let ready = false;
  let pending: HTMLButtonElement | null = null;
  const load = () => {
    if (loading || ready) return;
    loading = true;
    void import('./stylesheet-audit-tool')
      .then(({ start }) => {
        start(app);
        ready = true;
        app.removeEventListener('click', hold, true);
        pending?.click();
        pending = null;
      })
      .catch((error: unknown) => {
        loading = false;
        const notice = app.querySelector<HTMLElement>('[data-audit-notice]');
        if (notice) {
          notice.hidden = false;
          notice.textContent = 'The audit could not load. Interact again or reload to retry.';
        }
        console.error('Could not load the stylesheet audit.', error);
      });
  };
  function hold(event: MouseEvent) {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-audit-copy], [data-audit-sort]')
        : null;
    if (!button || ready) return;
    event.preventDefault();
    event.stopPropagation();
    pending = button;
    load();
  }
  app.addEventListener('click', hold, true);
  app.addEventListener('focusin', load);
  app.addEventListener('pointerdown', load);
  app.addEventListener('input', load);
  if (new URLSearchParams(location.search).has('s')) load();
}

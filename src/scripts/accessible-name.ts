const app = document.querySelector<HTMLElement>('[data-name-app]');
if (app) {
  let loading = false;
  let ready = false;
  let pending: HTMLButtonElement | null = null;
  const load = () => {
    if (loading || ready) return;
    loading = true;
    void import('./accessible-name-tool')
      .then(({ start }) => {
        start(app);
        ready = true;
        app.removeEventListener('click', hold, true);
        pending?.click();
        pending = null;
      })
      .catch((error: unknown) => {
        loading = false;
        const notice = app.querySelector<HTMLElement>('[data-name-notice]');
        if (notice) {
          notice.hidden = false;
          notice.textContent = 'The calculator could not load. Try interacting again or reload the page.';
        }
        console.error('Could not load the accessible name calculator.', error);
      });
  };
  function hold(event: MouseEvent) {
    const button =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-name-copy]') : null;
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

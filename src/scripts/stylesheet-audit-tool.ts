import type { Audit } from '../lib/audit/model';
import type { Result } from '../lib/cascade/types';
import { decodeState, encodeState, validateCss } from '../lib/audit/share';
import { summaryView, graphView, tableView, detailsView } from '../lib/audit/views';
import type { Sort } from '../lib/audit/views';
import { h, mount } from '../lib/view/h';

export function start(app: HTMLElement): void {
  const input = app.querySelector<HTMLTextAreaElement>('[data-audit-css]');
  const output = app.querySelector<HTMLElement>('[data-audit-output]');
  const live = app.querySelector<HTMLElement>('[data-audit-live]');
  const notice = app.querySelector<HTMLElement>('[data-audit-notice]');
  const copy = app.querySelector<HTMLButtonElement>('[data-audit-copy]');
  const status = app.querySelector<HTMLElement>('[data-audit-copy-status]');
  const fallback = app.querySelector<HTMLInputElement>('[data-audit-link]');
  const fallbackWrap = app.querySelector<HTMLElement>('[data-audit-link-wrap]');
  if (!input || !output || !live || !notice || !copy || !status || !fallback || !fallbackWrap)
    throw new Error('Missing stylesheet audit controls.');
  const shared = new URLSearchParams(location.search).get('s');
  if (shared !== null) {
    const decoded = decodeState(shared);
    if (decoded.ok) input.value = decoded.value.css;
    else {
      notice.hidden = false;
      notice.textContent = decoded.error.message;
    }
  }
  let worker: Worker | null = null;
  let timer = 0;
  let deadline = 0;
  let revision = 0;
  let model: Audit | null = null;
  let sort: Sort = 'none';
  const showError = (message: string) => {
    model = null;
    input.setAttribute('aria-invalid', 'true');
    output.removeAttribute('aria-busy');
    mount(output, h('p', { class: 'notice' }, message));
    live.textContent = message;
  };
  const updateShare = () => {
    const valid = validateCss(input.value, true);
    copy.setAttribute('aria-disabled', String(!valid.ok));
    status.textContent = valid.ok ? '' : valid.error.message;
  };
  const render = () => {
    if (!model) return;
    const sorting = document.activeElement?.hasAttribute('data-audit-sort');
    mount(output, [
      summaryView(model),
      graphView(model),
      h('div', { 'data-audit-table-slot': true }, tableView(model, sort)),
      detailsView(model),
    ]);
    if (sorting) output.querySelector<HTMLButtonElement>('[data-audit-sort]')?.focus();
  };
  const run = () => {
    worker?.terminate();
    window.clearTimeout(deadline);
    const valid = validateCss(input.value);
    if (!valid.ok) {
      showError(valid.error.message);
      return;
    }
    const id = ++revision;
    live.textContent = 'Working…';
    output.setAttribute('aria-busy', 'true');
    try {
      worker = new Worker(new URL('./stylesheet-audit-worker.ts', import.meta.url), { type: 'module' });
    } catch (error: unknown) {
      console.error('Could not start the audit worker.', error);
      showError('The audit worker could not start. Edit the CSS to retry or reload the page.');
      return;
    }
    worker.onmessage = (event: MessageEvent<{ id: number; result: Result<Audit> }>) => {
      if (event.data.id !== revision) return;
      window.clearTimeout(deadline);
      output.removeAttribute('aria-busy');
      if (!event.data.result.ok) {
        showError(event.data.result.error.message);
        return;
      }
      input.removeAttribute('aria-invalid');
      model = event.data.result.value;
      render();
      live.textContent = `${model.metrics.selectors} selectors, ${model.metrics.important} important declarations.${model.truncated ? ' Showing only the first 5,000 selectors.' : ''}`;
    };
    worker.onerror = (event) => {
      window.clearTimeout(deadline);
      console.error('The audit worker failed.', event.message);
      showError('The audit could not finish. Shorten the CSS and try again.');
    };
    deadline = window.setTimeout(() => {
      worker?.terminate();
      showError('The audit exceeded 10 seconds. Shorten the CSS and try again.');
    }, 10_000);
    worker.postMessage({ id, css: input.value });
  };
  input.addEventListener('input', () => {
    revision++;
    worker?.terminate();
    window.clearTimeout(timer);
    window.clearTimeout(deadline);
    model = null;
    fallbackWrap.hidden = true;
    updateShare();
    timer = window.setTimeout(run, 150);
  });
  copy.addEventListener('click', () => {
    const encoded = encodeState({ v: 1, css: input.value });
    if (!encoded.ok) {
      status.textContent = encoded.error.message;
      return;
    }
    const url = new URL('/stylesheet-audit/', location.origin);
    url.searchParams.set('s', encoded.value);
    history.replaceState(history.state, '', url);
    const manual = () => {
      fallbackWrap.hidden = false;
      fallback.value = url.href;
      fallback.focus();
      fallback.select();
      status.textContent = 'Select the link and copy it with Ctrl+C or Cmd+C.';
    };
    if (navigator.clipboard?.writeText)
      void navigator.clipboard.writeText(url.href).then(() => {
        status.textContent = 'Link copied.';
      }, manual);
    else manual();
  });
  output.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-audit-sort]') : null;
    if (!button) return;
    sort = sort === 'ascending' ? 'descending' : 'ascending';
    if (!model) return;
    const slot = output.querySelector('[data-audit-table-slot]');
    if (!slot) return;
    mount(slot, tableView(model, sort));
    slot.querySelector<HTMLButtonElement>('[data-audit-sort]')?.focus();
    live.textContent = `Table sorted by specificity, ${sort}. Graph stays in source order.`;
  });
  const highlight = (target: EventTarget | null) => {
    const item = target instanceof Element ? target.closest('[data-audit-point], [data-audit-row]') : null;
    if (!item) return;
    const index = item?.getAttribute('data-audit-point') ?? item?.getAttribute('data-audit-row');
    for (const active of output.querySelectorAll('[data-active]')) active.removeAttribute('data-active');
    if (index !== null && index !== undefined) {
      for (const match of output.querySelectorAll(
        `[data-audit-point="${index}"], [data-audit-row="${index}"]`,
      ))
        match.setAttribute('data-active', '');
    }
  };
  output.addEventListener('pointermove', (event) => highlight(event.target));
  output.addEventListener('focus', (event) => highlight(event.target), true);
  output.addEventListener('keydown', (event) => {
    if (
      !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) ||
      !(event.target instanceof Element)
    )
      return;
    const selector = event.target.hasAttribute('data-audit-point')
      ? '[data-audit-point]'
      : event.target.hasAttribute('data-audit-row')
        ? '[data-audit-row]'
        : null;
    if (!selector) return;
    const items = [...output.querySelectorAll<HTMLElement | SVGElement>(selector)];
    const current = items.findIndex((item) => item === event.target);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
    const target = items[next];
    if (!target) return;
    event.preventDefault();
    for (const item of items) item.setAttribute('tabindex', '-1');
    target.setAttribute('tabindex', '0');
    if (target instanceof HTMLElement || target instanceof SVGElement) target.focus();
    highlight(target);
  });
  window.addEventListener('pagehide', () => {
    worker?.terminate();
    window.clearTimeout(deadline);
  });
  updateShare();
  run();
}

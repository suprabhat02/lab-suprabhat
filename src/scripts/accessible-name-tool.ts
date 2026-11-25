import { parseDom } from '../lib/accname/adapters/dom';
import { analyze, DEFAULT_HTML } from '../lib/accname/model';
import { decodeState, encodeState, SHARE_VERSION } from '../lib/accname/share';
import { analysisView, optionsView } from '../lib/accname/views';
import { errorMessage } from '../lib/app/views';
import { mount } from '../lib/view/h';

export function start(app: HTMLElement): void {
  const input = app.querySelector<HTMLTextAreaElement>('[data-name-html]');
  const select = app.querySelector<HTMLSelectElement>('[data-name-element]');
  const selectWrap = app.querySelector<HTMLElement>('[data-name-select]');
  const output = app.querySelector<HTMLElement>('[data-name-output]');
  const live = app.querySelector<HTMLElement>('[data-name-live]');
  const notice = app.querySelector<HTMLElement>('[data-name-notice]');
  const copy = app.querySelector<HTMLButtonElement>('[data-name-copy]');
  const copyStatus = app.querySelector<HTMLElement>('[data-name-copy-status]');
  const fallback = app.querySelector<HTMLInputElement>('[data-name-link]');
  const fallbackWrap = app.querySelector<HTMLElement>('[data-name-link-wrap]');
  if (
    !input ||
    !select ||
    !selectWrap ||
    !output ||
    !live ||
    !notice ||
    !copy ||
    !copyStatus ||
    !fallback ||
    !fallbackWrap
  ) {
    throw new Error('Missing accessible name tool elements.');
  }
  let selected = Number(select.value || 0);
  let timer = 0;
  let announceTimer = 0;
  const shared = new URLSearchParams(location.search).get('s');
  if (shared !== null) {
    const decoded = decodeState(shared);
    const restored = decoded.ok ? analyze(decoded.value.html, decoded.value.element, parseDom) : decoded;
    if (decoded.ok && restored.ok) {
      input.value = decoded.value.html;
      selected = decoded.value.element;
    } else {
      input.value = DEFAULT_HTML;
      notice.hidden = false;
      notice.textContent = restored.ok
        ? 'This link could not be restored. The default example is shown instead.'
        : restored.error.message;
    }
  }
  const render = (announce = true) => {
    window.clearTimeout(announceTimer);
    let result = analyze(input.value, selected, parseDom);
    if (!result.ok && selected > 0) {
      const first = analyze(input.value, 0, parseDom);
      if (first.ok && selected >= first.value.elements.length) {
        selected = 0;
        result = first;
      }
    }
    if (!result.ok) {
      input.setAttribute('aria-invalid', 'true');
      selectWrap.hidden = true;
      mount(output, errorMessage(result.error.message));
      live.textContent = result.error.message;
      return result;
    }
    input.removeAttribute('aria-invalid');
    mount(select, optionsView(result.value));
    selectWrap.hidden = result.value.elements.length < 2;
    mount(output, analysisView(result.value));
    window.clearTimeout(announceTimer);
    if (announce)
      announceTimer = window.setTimeout(() => {
        live.textContent = `${result.value.verdict}.`;
      }, 300);
    return result;
  };
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    window.clearTimeout(announceTimer);
    timer = window.setTimeout(() => render(), 120);
    copyStatus.textContent = '';
    fallbackWrap.hidden = true;
  });
  select.addEventListener('change', () => {
    selected = Number(select.value);
    render();
  });
  copy.addEventListener('click', () => {
    window.clearTimeout(timer);
    if (!render(false).ok) {
      copyStatus.textContent = 'Fix the HTML before copying a link.';
      return;
    }
    const encoded = encodeState({ v: SHARE_VERSION, html: input.value, element: selected });
    if (!encoded.ok) {
      copyStatus.textContent = encoded.error.message;
      return;
    }
    const url = new URL('/accessible-name/', location.origin);
    url.searchParams.set('s', encoded.value);
    history.replaceState(history.state, '', url);
    const manual = () => {
      fallbackWrap.hidden = false;
      fallback.value = url.href;
      fallback.focus();
      fallback.select();
      copyStatus.textContent = 'Select the link below and copy it with Ctrl+C or Cmd+C.';
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url.href).then(() => {
        copyStatus.textContent = 'Link copied.';
      }, manual);
    } else manual();
  });
  render(shared !== null || input.value !== DEFAULT_HTML);
}

/**
 * Entry for the specificity page. Kept tiny: it wires up the tabs and loads the tool
 * (and the selector parser) on first interaction, or straight away for a shared link.
 */
import type { Mode } from '../lib/cascade/share';
import type { TabsController } from './specificity-tool';

const MODES: readonly string[] = ['anatomy', 'nesting', 'cascade'];
const isMode = (value: string | undefined): value is Mode => value !== undefined && MODES.includes(value);

function setupTabs(): TabsController {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tablist = document.querySelector<HTMLElement>('[data-tablist]');
  const listeners: ((mode: Mode) => void)[] = [];
  let current: Mode = 'anatomy';

  const select = (mode: Mode, focus = false) => {
    current = mode;
    for (const tab of tabs) {
      const selected = tab.dataset['tab'] === mode;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !selected;
      if (selected && focus) tab.focus();
    }
  };
  const choose = (mode: string | undefined, focus = false) => {
    if (!isMode(mode)) return;
    select(mode, focus);
    for (const listener of listeners) listener(mode);
  };

  if (tablist && tabs.length > 0) {
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      if (!panel) continue;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      panel.querySelector('[data-panel-heading]')?.classList.add('visually-hidden');
    }
    tablist.hidden = false;
    tablist.closest('[data-tabs]')?.classList.add('tabs-ready');
    select(current);

    tablist.addEventListener('click', (event) => {
      const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"]') : null;
      choose(tab?.dataset['tab']);
    });
    tablist.addEventListener('keydown', (event) => {
      const index = tabs.findIndex((t) => t === document.activeElement);
      if (index === -1) return;
      const last = tabs.length - 1;
      const next =
        event.key === 'ArrowRight'
          ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft'
            ? (index - 1 + tabs.length) % tabs.length
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? last
                : -1;
      if (next === -1) return;
      event.preventDefault();
      choose(tabs[next]?.dataset['tab'], true);
    });
  }

  return { select, current: () => current, onChange: (listener) => listeners.push(listener) };
}

const app = document.querySelector<HTMLElement>('[data-app]');
if (app) {
  const tabs = setupTabs();
  const zones = [app, document.querySelector('[data-tabs]'), document.querySelector('[data-suggestions]')];
  const ACTIONS = '[data-add], [data-copy], [data-remove], [data-add-row], [data-remove-row], a[data-try]';
  let started = false;
  let pending: HTMLElement | null = null;

  const load = () => {
    if (started) return;
    started = true;
    void import('./specificity-tool').then(({ start }) => {
      document.removeEventListener('click', hold, true);
      start(app, tabs);
      // Replay a click that arrived before the tool was ready.
      pending?.click();
      pending = null;
    });
  };
  function hold(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(ACTIONS) : null;
    if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    pending = target;
    load();
  }

  document.addEventListener('click', hold, true);
  for (const zone of zones) {
    zone?.addEventListener('focusin', load, { once: true });
    zone?.addEventListener('pointerdown', load, { once: true });
    zone?.addEventListener('input', load, { once: true });
  }
  document.querySelector('[data-duel]')?.addEventListener('submit', (event) => {
    if (started) return;
    event.preventDefault();
    load();
  });
  if (new URLSearchParams(window.location.search).has('s')) load();
}

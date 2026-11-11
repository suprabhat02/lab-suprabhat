/**
 * The specificity tool controller, loaded on first interaction by specificity-app.ts.
 * It picks up whatever is already in the pre-rendered form, so nothing typed before it loads is lost.
 */
import { DEFAULT_INPUTS } from '../lib/app/defaults';
import { buildCascade, buildDuel, buildNesting } from '../lib/app/model';
import type { Calc, DuelModel } from '../lib/app/model';
import {
  anatomyView,
  cascadeResultView,
  cascadeRowView,
  contenderView,
  errorMessage,
  fieldMessages,
  nestingView,
  scoreView,
  suggestionsView,
  verdictView,
} from '../lib/app/views';
import { decodeState, encodeState, LAYER_NAME, LIMITS } from '../lib/cascade/share';
import type { AppInputs, CascadeRow, Mode, ShareState } from '../lib/cascade/share';
import type { Specificity } from '../lib/cascade/types';
import { h, mount, renderToDom, rich } from '../lib/view/h';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface TabsController {
  select(mode: Mode, focus?: boolean): void;
  current(): Mode;
  onChange(listener: (mode: Mode) => void): void;
}

interface State {
  selectors: string[];
  nesting: string;
  property: string;
  layerOrder: string[];
  rows: CascadeRow[];
  mode: Mode;
  target: number | null;
}

export function start(app: HTMLElement, tabs: TabsController): void {
  const q = <T extends Element>(selector: string, scope: ParentNode = document): T | null =>
    scope.querySelector<T>(selector);

  const els = {
    contenders: q<HTMLElement>('[data-contenders]', app),
    verdict: q<HTMLElement>('[data-verdict]', app),
    live: q<HTMLElement>('[data-live]'),
    add: q<HTMLButtonElement>('[data-add]', app),
    copy: q<HTMLButtonElement>('[data-copy]', app),
    copyStatus: q<HTMLElement>('[data-copy-status]', app),
    shareFallback: q<HTMLInputElement>('[data-share-fallback]', app),
    notice: q<HTMLElement>('[data-share-notice]', app),
    form: q<HTMLFormElement>('[data-duel]', app),
    suggestions: q<HTMLElement>('[data-suggestions]'),
    anatomy: q<HTMLElement>('[data-anatomy]'),
    nesting: q<HTMLTextAreaElement>('[data-nesting]'),
    nestingOutput: q<HTMLElement>('[data-nesting-output]'),
    cascade: q<HTMLElement>('[data-cascade]'),
    decls: q<HTMLElement>('[data-decls]'),
    layerOrder: q<HTMLInputElement>('[data-layer-order]'),
    layerError: q<HTMLElement>('[data-layer-error]'),
    property: q<HTMLInputElement>('[data-property]'),
    addRow: q<HTMLButtonElement>('[data-add-row]'),
    cascadeOutput: q<HTMLElement>('[data-cascade-output]'),
  };

  const fromInputs = (inputs: AppInputs, mode: Mode): State => ({
    selectors: [...inputs.selectors],
    nesting: inputs.nesting,
    property: inputs.cascade.property,
    layerOrder: [...inputs.cascade.layerOrder],
    rows: inputs.cascade.rows.map((r) => ({ ...r })),
    mode,
    target: null,
  });

  const state: State = fromInputs(DEFAULT_INPUTS, tabs.current());
  let calc: Calc | null = null;
  let calcPromise: Promise<Calc> | null = null;
  let lastValues: (Specificity | null)[] = [];

  const loadCalc = (): Promise<Calc> => {
    calcPromise ??= import('../lib/cascade/specificity').then((m) => {
      calc = m.calculate;
      return m.calculate;
    });
    return calcPromise;
  };

  const debounce = (fn: () => void, ms: number) => {
    let timer = 0;
    return () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, ms);
    };
  };

  const toShare = (): ShareState => ({
    v: 1,
    mode: state.mode,
    inputs: {
      selectors: state.selectors,
      nesting: state.nesting,
      cascade: { property: state.property, layerOrder: state.layerOrder, rows: state.rows },
    },
  });

  const isDefault = () =>
    JSON.stringify(toShare().inputs) === JSON.stringify(DEFAULT_INPUTS) && state.mode === 'anatomy';

  const syncUrl = debounce(() => {
    const url = new URL(window.location.href);
    if (isDefault()) url.searchParams.delete('s');
    else {
      const encoded = encodeState(toShare());
      if (!encoded.ok) return;
      url.searchParams.set('s', encoded.value);
    }
    history.replaceState(history.state, '', url);
  }, 400);

  let pendingAnnouncement = '';
  const announceNow = debounce(() => {
    if (els.live) els.live.textContent = pendingAnnouncement;
  }, 400);
  const announce = (text: string) => {
    pendingAnnouncement = text;
    announceNow();
  };

  /* ---------- Duel ---------- */

  let duel: DuelModel | null = null;

  function renderDuel(options: { full?: boolean; announce?: boolean } = {}): void {
    if (!calc) return;
    duel = buildDuel(state.selectors, calc, state.target);
    const model = duel;
    if (options.full && els.contenders) {
      mount(
        els.contenders,
        model.contenders.map((c, i) => contenderView(i, model.contenders.length, c, model)),
      );
    } else {
      model.contenders.forEach((c, i) => {
        const input = q<HTMLInputElement>(`[data-selector="${i}"]`, app);
        if (input) {
          if (c.parsed.ok) input.removeAttribute('aria-invalid');
          else input.setAttribute('aria-invalid', 'true');
        }
        const messages = q(`[data-messages="${i}"]`, app);
        if (messages) mount(messages, fieldMessages(c, `sel-${i}-error`));
        const score = q(`[data-score="${i}"]`, app);
        if (score) mount(score, scoreView(c, i, model, lastValues[i] ?? null));
      });
    }
    lastValues = model.contenders.map((c) => c.best?.value ?? null);
    if (els.verdict) mount(els.verdict, verdictView(model));
    if (els.suggestions) mount(els.suggestions, suggestionsView(model));
    if (els.anatomy) mount(els.anatomy, anatomyView(model.contenders));
    if (els.add) els.add.disabled = state.selectors.length >= LIMITS.selectors.max;
    if (options.announce !== false) announce(model.announcement);
  }

  const renderDuelSoon = debounce(() => renderDuel(), 120);

  els.contenders?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset['selector'] === undefined) return;
    const index = Number(target.dataset['selector']);
    state.selectors[index] = target.value;
    syncUrl();
    if (calc) renderDuelSoon();
    else void loadCalc().then(() => renderDuel());
  });

  els.contenders?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-remove]');
    if (!button) return;
    const index = Number(button.dataset['remove']);
    if (state.selectors.length <= LIMITS.selectors.min) return;
    state.selectors.splice(index, 1);
    lastValues.splice(index, 1);
    state.target = null;
    void loadCalc().then(() => {
      renderDuel({ full: true });
      const next = q<HTMLInputElement>(
        `[data-selector="${Math.min(index, state.selectors.length - 1)}"]`,
        app,
      );
      next?.focus();
      syncUrl();
    });
  });

  els.add?.addEventListener('click', () => {
    if (state.selectors.length >= LIMITS.selectors.max) return;
    state.selectors.push('');
    void loadCalc().then(() => {
      renderDuel({ full: true, announce: false });
      q<HTMLInputElement>(`[data-selector="${state.selectors.length - 1}"]`, app)?.focus();
      syncUrl();
    });
  });

  els.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void loadCalc().then(() => {
      renderDuel();
      if (duel && els.live) els.live.textContent = duel.announcement;
    });
  });

  els.suggestions?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.hasAttribute('data-fix-target')) return;
    state.target = Number(target.value);
    renderDuel({ announce: false });
    q<HTMLSelectElement>('[data-fix-target]')?.focus();
  });

  /* ---------- Copy link ---------- */

  els.copy?.addEventListener('click', () => {
    const status = els.copyStatus;
    const encoded = encodeState(toShare());
    if (!encoded.ok) {
      if (status) status.textContent = encoded.error.message;
      return;
    }
    const url = new URL('/specificity/', window.location.origin);
    url.searchParams.set('s', encoded.value);
    const link = url.href;
    const fallback = () => {
      const field = els.shareFallback;
      const wrap = q<HTMLElement>('[data-share-wrap]', app);
      if (field && wrap) {
        wrap.hidden = false;
        field.value = link;
        field.focus();
        field.select();
      }
      if (status) status.textContent = 'Select the link below and copy it with Ctrl+C or Cmd+C.';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        if (status) status.textContent = 'Link copied.';
      }, fallback);
    } else fallback();
  });

  /* ---------- Nesting ---------- */

  function renderNesting(): void {
    if (!calc || !els.nestingOutput) return;
    mount(els.nestingOutput, nestingView(buildNesting(state.nesting, calc)));
  }
  const renderNestingSoon = debounce(renderNesting, 150);

  els.nesting?.addEventListener('input', () => {
    state.nesting = els.nesting?.value ?? '';
    syncUrl();
    if (calc) renderNestingSoon();
    else void loadCalc().then(renderNesting);
  });

  /* ---------- Cascade ---------- */

  const clampInt = (value: string, min: number, max: number, fallback: number) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function readLayerOrder(): void {
    const raw = els.layerOrder?.value ?? '';
    const names = raw.split(/[\s,]+/).filter(Boolean);
    const invalid = names.filter((n) => !LAYER_NAME.test(n) || n.length > LIMITS.layerName);
    state.layerOrder = [...new Set(names.filter((n) => !invalid.includes(n)))].slice(0, LIMITS.layers);
    if (els.layerError) {
      const first = invalid[0];
      mount(
        els.layerError,
        first
          ? h(
              'p',
              { class: 'message message-error' },
              ...rich(
                `\`${first}\` isn't a valid layer name. Start with a letter, then use letters, digits, hyphens or underscores.`,
              ),
            )
          : [],
      );
    }
    els.layerOrder?.setAttribute('aria-invalid', invalid.length ? 'true' : 'false');
  }

  function readRows(): void {
    const rows: CascadeRow[] = [];
    els.decls?.querySelectorAll<HTMLFieldSetElement>('[data-row]').forEach((fieldset, i) => {
      const field = <T extends HTMLElement>(name: string) =>
        fieldset.querySelector<T>(`[data-field="${name}"]`);
      const previous = state.rows[i];
      const inline = field<HTMLInputElement>('inline')?.checked ?? false;
      const scopeRoot = (field<HTMLInputElement>('scope')?.value ?? '').slice(0, LIMITS.scopeRoot);
      const layer = field<HTMLSelectElement>('layer')?.value ?? '';
      const row: Mutable<CascadeRow> = {
        selector: (field<HTMLInputElement>('selector')?.value ?? '').slice(0, 1000),
        value: (field<HTMLInputElement>('value')?.value ?? '').slice(0, LIMITS.value),
        important: field<HTMLInputElement>('important')?.checked ?? false,
        inline,
        layer: layer && LAYER_NAME.test(layer) ? layer : null,
        scope: scopeRoot.trim()
          ? {
              root: scopeRoot,
              proximity: clampInt(field<HTMLInputElement>('proximity')?.value ?? '', 0, LIMITS.proximity, 1),
            }
          : null,
        order: clampInt(
          field<HTMLInputElement>('order')?.value ?? '',
          1,
          LIMITS.order,
          previous?.order ?? i + 1,
        ),
      };
      rows.push(row);
      // Inline styles have no selector, layer or scope; keep the controls in step without re-rendering.
      for (const name of ['selector', 'layer', 'scope']) {
        const control = field<HTMLInputElement | HTMLSelectElement>(name);
        if (control) control.disabled = inline;
      }
      const proximity = field<HTMLInputElement>('proximity');
      if (proximity) proximity.disabled = inline || !row.scope;
    });
    state.rows = rows;
  }

  function renderRows(focusRow: number | null = null): void {
    if (!els.decls || !calc) return;
    const model = buildCascade(
      { property: state.property, layerOrder: state.layerOrder, rows: state.rows },
      calc,
    );
    mount(
      els.decls,
      model.rows.map((r, i) =>
        cascadeRowView(i, model.rows.length, r.row, state.layerOrder, r.error?.message ?? null),
      ),
    );
    if (els.addRow) els.addRow.disabled = state.rows.length >= LIMITS.rows.max;
    if (focusRow !== null) q<HTMLInputElement>(`[data-row="${focusRow}"] input`, els.decls)?.focus();
  }

  function refreshLayerSelects(): void {
    els.decls?.querySelectorAll<HTMLSelectElement>('[data-field="layer"]').forEach((select, i) => {
      const current = state.rows[i]?.layer ?? null;
      const names = [
        ...new Set([
          ...state.layerOrder,
          ...(current && !state.layerOrder.includes(current) ? [current] : []),
        ]),
      ];
      mount(select, [
        h('option', { value: '', selected: current === null }, 'None (unlayered)'),
        ...names.map((n) => h('option', { value: n, selected: n === current }, n)),
      ]);
    });
  }

  function renderCascade(options: { announce?: boolean } = {}): void {
    if (!calc || !els.cascadeOutput) return;
    const model = buildCascade(
      { property: state.property, layerOrder: state.layerOrder, rows: state.rows },
      calc,
    );
    mount(els.cascadeOutput, cascadeResultView(model));
    // Update per-row selector errors in place so focus is never lost.
    model.rows.forEach((r, i) => {
      const input = els.decls?.querySelector<HTMLInputElement>(`[data-row="${i}"] [data-field="selector"]`);
      if (!input) return;
      const holder = input.parentElement;
      holder?.querySelector('.message-error')?.remove();
      if (r.error && holder) {
        const id = `c${i}-error`;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', id);
        holder.append(renderToDom(errorMessage(r.error.message, id)));
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    });
    if (options.announce && model.result) announce(model.result.summary.replace(/`/g, ''));
  }
  const renderCascadeSoon = debounce(() => renderCascade({ announce: true }), 150);

  els.cascade?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === els.layerOrder) {
      readLayerOrder();
      refreshLayerSelects();
      readRows();
    } else if (target === els.property) {
      state.property = els.property.value.slice(0, LIMITS.property);
    } else {
      readRows();
    }
    syncUrl();
    if (calc) renderCascadeSoon();
    else void loadCalc().then(() => renderCascade({ announce: true }));
  });

  els.cascade?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const remove = target.closest<HTMLButtonElement>('[data-remove-row]');
    if (remove && state.rows.length > LIMITS.rows.min) {
      state.rows.splice(Number(remove.dataset['removeRow']), 1);
      void loadCalc().then(() => {
        renderRows(Math.min(Number(remove.dataset['removeRow']), state.rows.length - 1));
        renderCascade({ announce: true });
        syncUrl();
      });
    }
  });

  els.addRow?.addEventListener('click', () => {
    if (state.rows.length >= LIMITS.rows.max) return;
    const order = Math.min(LIMITS.order, Math.max(0, ...state.rows.map((r) => r.order)) + 1);
    state.rows.push({
      selector: 'p',
      value: 'black',
      important: false,
      inline: false,
      layer: null,
      scope: null,
      order,
    });
    void loadCalc().then(() => {
      renderRows(state.rows.length - 1);
      renderCascade({ announce: true });
      syncUrl();
    });
  });

  /* ---------- Tabs ---------- */

  tabs.onChange((mode) => {
    state.mode = mode;
    syncUrl();
  });

  /* ---------- Shared state ---------- */

  async function applyState(next: ShareState): Promise<void> {
    Object.assign(state, fromInputs(next.inputs, next.mode));
    if (els.nesting) els.nesting.value = state.nesting;
    if (els.property) els.property.value = state.property;
    if (els.layerOrder) els.layerOrder.value = state.layerOrder.join(', ');
    tabs.select(state.mode);
    await loadCalc();
    lastValues = [];
    renderDuel({ full: true, announce: false });
    renderNesting();
    renderRows();
    renderCascade();
  }

  // "Try this" links in the explainer load an example without a full reload.
  document.addEventListener('click', (event) => {
    const link =
      event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-try]') : null;
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const s = new URL(link.href).searchParams.get('s');
    const decoded = s ? decodeState(s) : null;
    if (!decoded?.ok) return;
    event.preventDefault();
    void applyState(decoded.value).then(() => {
      history.replaceState(history.state, '', link.href);
      const cascadeMode = decoded.value.mode === 'cascade';
      const focusTarget = cascadeMode
        ? q<HTMLInputElement>('[data-decls] input:not(:disabled)')
        : q<HTMLInputElement>('[data-selector="0"]', app);
      const scrollTarget = cascadeMode ? document.getElementById('panel-cascade') : app;
      scrollTarget?.scrollIntoView({ block: 'start' });
      focusTarget?.focus({ preventScroll: true });
      if (cascadeMode) {
        const summary = q('.cascade-summary');
        if (summary) announce(summary.textContent ?? '');
      } else if (duel) announce(duel.announcement);
    });
  });

  /* ---------- Start ---------- */

  // Pick up anything typed before this module loaded.
  state.selectors = [...app.querySelectorAll<HTMLInputElement>('[data-selector]')].map((i) => i.value);
  state.nesting = els.nesting?.value ?? state.nesting;
  state.property = els.property?.value ?? state.property;
  readLayerOrder();
  readRows();

  const param = new URLSearchParams(window.location.search).get('s');
  const decoded = param === null ? null : decodeState(param);
  if (decoded?.ok) void applyState(decoded.value);
  else {
    if (decoded && !decoded.ok) {
      if (els.notice) {
        els.notice.textContent = decoded.error.message;
        els.notice.hidden = false;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('s');
      history.replaceState(history.state, '', url);
    }
    const current = JSON.stringify({ ...toShare().inputs });
    void loadCalc().then(() => {
      if (current === JSON.stringify(DEFAULT_INPUTS)) return;
      renderDuel();
      renderNesting();
      renderCascade();
      syncUrl();
    });
  }
}

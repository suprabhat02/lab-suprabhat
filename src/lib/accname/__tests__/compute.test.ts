import { describe, expect, it } from 'vitest';
import { JSDOM, requestInterceptor } from 'jsdom';
import { computeAccessibleDescription, computeAccessibleName } from 'dom-accessibility-api';
import { fromDocument } from '../adapters/dom';
import { parseHtml } from '../adapters/parse5';
import { computeDescription, computeName } from '../compute';
import { checkName } from '../checks';
import { roleOf } from '../role';
import type { TraceStep } from '../types';

interface Fixture {
  title: string;
  html: string;
  name: string;
  source: string | null;
  description?: string;
}

const fixtures: ReadonlyArray<Fixture> = [
  { title: 'button text', html: '<button id="target">Save</button>', name: 'Save', source: 'content' },
  { title: 'link text', html: '<a id="target" href="/">Home</a>', name: 'Home', source: 'content' },
  {
    title: 'aria-label',
    html: '<button id="target" aria-label="Save"></button>',
    name: 'Save',
    source: 'aria-label',
  },
  {
    title: 'labelledby',
    html: '<span id="a">Save</span><button id="target" aria-labelledby="a"></button>',
    name: 'Save',
    source: 'aria-labelledby',
  },
  {
    title: 'label for',
    html: '<label for="target">Search</label><input id="target">',
    name: 'Search',
    source: 'label[for]',
  },
  {
    title: 'wrapping label',
    html: '<label>Search<input id="target"></label>',
    name: 'Search',
    source: 'wrapping label',
  },
  { title: 'alt', html: '<img id="target" alt="Sunset">', name: 'Sunset', source: 'alt' },
  {
    title: 'legend',
    html: '<fieldset id="target"><legend>Contact</legend></fieldset>',
    name: 'Contact',
    source: 'legend',
  },
  {
    title: 'caption',
    html: '<table id="target"><caption>Prices</caption></table>',
    name: 'Prices',
    source: 'caption',
  },
  {
    title: 'svg title',
    html: '<svg id="target"><title>Search</title></svg>',
    name: 'Search',
    source: 'svg title',
  },
  {
    title: 'title fallback',
    html: '<button id="target" title="Save"></button>',
    name: 'Save',
    source: 'title',
  },
  {
    title: 'placeholder fallback',
    html: '<input id="target" placeholder="Search">',
    name: 'Search',
    source: 'placeholder',
  },
  {
    title: 'button value',
    html: '<input id="target" type="button" value="Save">',
    name: 'Save',
    source: 'value',
  },
  {
    title: 'submit default',
    html: '<input id="target" type="submit">',
    name: 'Submit',
    source: 'browser default',
  },
  {
    title: 'reset default',
    html: '<input id="target" type="reset">',
    name: 'Reset',
    source: 'browser default',
  },
  {
    title: 'image input alt',
    html: '<input id="target" type="image" alt="Search">',
    name: 'Search',
    source: 'alt',
  },
  {
    title: 'labelledby beats aria-label',
    html: '<span id="a">Visible</span><button id="target" aria-labelledby="a" aria-label="Other">Content</button>',
    name: 'Visible',
    source: 'aria-labelledby',
  },
  {
    title: 'labelledby beats native label',
    html: '<span id="a">ARIA</span><label for="target">Native</label><input id="target" aria-labelledby="a">',
    name: 'ARIA',
    source: 'aria-labelledby',
  },
  {
    title: 'labelledby beats title and placeholder',
    html: '<span id="a">ARIA</span><input id="target" aria-labelledby="a" title="Title" placeholder="Hint">',
    name: 'ARIA',
    source: 'aria-labelledby',
    description: 'Title',
  },
  {
    title: 'aria-label beats label',
    html: '<label for="target">Search the lab</label><input id="target" aria-label="Search">',
    name: 'Search',
    source: 'aria-label',
  },
  {
    title: 'aria-label beats text',
    html: '<button id="target" aria-label="Search the lab">Search</button>',
    name: 'Search the lab',
    source: 'aria-label',
  },
  {
    title: 'aria-label beats alt',
    html: '<img id="target" aria-label="ARIA" alt="Native">',
    name: 'ARIA',
    source: 'aria-label',
  },
  {
    title: 'aria-label beats legend',
    html: '<fieldset id="target" aria-label="ARIA"><legend>Native</legend></fieldset>',
    name: 'ARIA',
    source: 'aria-label',
  },
  {
    title: 'aria-label beats caption',
    html: '<table id="target" aria-label="ARIA"><caption>Native</caption></table>',
    name: 'ARIA',
    source: 'aria-label',
    description: 'Native',
  },
  {
    title: 'aria-label beats title',
    html: '<button id="target" aria-label="ARIA" title="Help"></button>',
    name: 'ARIA',
    source: 'aria-label',
    description: 'Help',
  },
  {
    title: 'label beats placeholder and title',
    html: '<label for="target">Search</label><input id="target" title="Help" placeholder="Hint">',
    name: 'Search',
    source: 'label[for]',
    description: 'Help',
  },
  {
    title: 'content beats title',
    html: '<button id="target" title="Help">Search</button>',
    name: 'Search',
    source: 'content',
    description: 'Help',
  },
  {
    title: 'title beats placeholder',
    html: '<input id="target" title="Search" placeholder="Hint">',
    name: 'Search',
    source: 'title',
  },
  {
    title: 'alt beats title',
    html: '<img id="target" alt="Sunset" title="Photo">',
    name: 'Sunset',
    source: 'alt',
    description: 'Photo',
  },
  {
    title: 'native button label beats content',
    html: '<label for="target">Native</label><button id="target">Content</button>',
    name: 'Native',
    source: 'label[for]',
  },
  {
    title: 'multiple labels DOM order',
    html: '<label for="target">First</label><input id="target"><label for="target">Last</label>',
    name: 'First Last',
    source: 'label[for]',
  },
  {
    title: 'reference order',
    html: '<span id="a">First</span><span id="b">Last</span><button id="target" aria-labelledby="b a"></button>',
    name: 'Last First',
    source: 'aria-labelledby',
  },
  {
    title: 'referenced label has aria-label',
    html: '<span id="a" aria-label="Override">Text</span><button id="target" aria-labelledby="a"></button>',
    name: 'Override',
    source: 'aria-labelledby',
  },
  {
    title: 'labelledby does not chain',
    html: '<span id="a" aria-labelledby="b">First</span><span id="b">Second</span><button id="target" aria-labelledby="a"></button>',
    name: 'First',
    source: 'aria-labelledby',
  },
  {
    title: 'self reference',
    html: '<button id="target" aria-labelledby="target" aria-label="Self">Text</button>',
    name: 'Self',
    source: 'aria-labelledby',
  },
  {
    title: 'missing id falls through',
    html: '<button id="target" aria-labelledby="missing" aria-label="Fallback">Text</button>',
    name: 'Fallback',
    source: 'aria-label',
  },
  {
    title: 'empty aria-label falls through',
    html: '<button id="target" aria-label="   ">Text</button>',
    name: 'Text',
    source: 'content',
  },
  { title: 'hidden root', html: '<button id="target" hidden>Text</button>', name: '', source: 'hidden' },
  {
    title: 'aria-hidden subtree',
    html: '<button id="target">Save<span aria-hidden="true">Icon</span></button>',
    name: 'Save',
    source: 'content',
  },
  {
    title: 'display none subtree',
    html: '<button id="target">Save<span style="display: none">Hidden</span></button>',
    name: 'Save',
    source: 'content',
  },
  {
    title: 'visibility hidden subtree',
    html: '<button id="target">Save<span style="visibility: hidden">Hidden</span></button>',
    name: 'Save',
    source: 'content',
  },
  {
    title: 'hidden referenced label includes hidden children',
    html: '<span id="a" hidden>Keep <span hidden>both</span></span><button id="target" aria-labelledby="a"></button>',
    name: 'Keep both',
    source: 'aria-labelledby',
  },
  {
    title: 'visible referenced label excludes hidden children',
    html: '<span id="a">Keep<span hidden>omit</span></span><button id="target" aria-labelledby="a"></button>',
    name: 'Keep',
    source: 'aria-labelledby',
  },
  {
    title: 'wrapped own input value is excluded',
    html: '<label>Label<input id="target" value="not a label"></label>',
    name: 'Label',
    source: 'wrapping label',
  },
  {
    title: 'embedded text control',
    html: '<label for="target">Flash <input value="5"> times</label><input id="target" type="checkbox">',
    name: 'Flash 5 times',
    source: 'label[for]',
  },
  {
    title: 'embedded select',
    html: '<label for="target">Choose <select><option>first</option><option selected>second</option></select> item</label><input id="target" type="checkbox">',
    name: 'Choose second item',
    source: 'label[for]',
  },
  {
    title: 'embedded range',
    html: '<label for="target">Volume <input type="range" value="5"></label><input id="target" type="checkbox">',
    name: 'Volume 5',
    source: 'label[for]',
  },
  {
    title: 'embedded valuetext beats valuenow',
    html: '<label for="target">Volume <span role="slider" aria-valuetext="half" aria-valuenow="50"></span></label><input id="target" type="checkbox">',
    name: 'Volume half',
    source: 'label[for]',
  },
  {
    title: 'presentation removes heading name',
    html: '<h2 id="target" role="presentation">Title</h2>',
    name: '',
    source: null,
  },
  {
    title: 'none removes image name',
    html: '<img id="target" role="none" alt="Decoration">',
    name: '',
    source: null,
  },
  {
    title: 'presentation does not hide descendants',
    html: '<button id="target"><span role="presentation">Save</span></button>',
    name: 'Save',
    source: 'content',
  },
  {
    title: 'focusable presentation is ignored',
    html: '<button id="target" role="presentation">Save</button>',
    name: 'Save',
    source: 'content',
  },
  {
    title: 'generic naming prohibited',
    html: '<div id="target" aria-label="Not a control">Text</div>',
    name: '',
    source: null,
  },
  { title: 'empty image alt', html: '<img id="target" alt="">', name: '', source: null },
  {
    title: 'description references',
    html: '<button id="target" aria-describedby="d" title="Tooltip">Save</button><span id="d">More help</span>',
    name: 'Save',
    source: 'content',
    description: 'More help',
  },
  {
    title: 'aria-description',
    html: '<button id="target" aria-description="More help" title="Tooltip">Save</button>',
    name: 'Save',
    source: 'content',
    description: 'More help',
  },
  {
    title: 'describedby beats description',
    html: '<button id="target" aria-describedby="d" aria-description="Other">Save</button><span id="d">More help</span>',
    name: 'Save',
    source: 'content',
    description: 'More help',
  },
  {
    title: 'description does not reuse name title',
    html: '<input id="target" title="Search">',
    name: 'Search',
    source: 'title',
    description: '',
  },
  {
    title: 'hidden description reference',
    html: '<button id="target" aria-describedby="d">Save</button><p id="d" hidden>Help</p>',
    name: 'Save',
    source: 'content',
    description: 'Help',
  },
  {
    title: 'inline whitespace boundaries',
    html: '<button id="target"><span>Save </span><span>this</span> <span>file</span></button>',
    name: 'Save this file',
    source: 'content',
  },
  {
    title: 'figure ignores implicit figcaption',
    html: '<figure id="target"><figcaption>Caption</figcaption></figure>',
    name: '',
    source: null,
  },
  {
    title: 'empty labelledby falls through',
    html: '<span id="a"></span><button id="target" aria-labelledby="a" aria-label="Fallback"></button>',
    name: 'Fallback',
    source: 'aria-label',
  },
  {
    title: 'empty describedby blocks fallback',
    html: '<button id="target" aria-describedby="d" title="Other">Save</button><span id="d"></span>',
    name: 'Save',
    source: 'content',
    description: '',
  },
  {
    title: 'empty description blocks title',
    html: '<button id="target" aria-description="" title="Other">Save</button>',
    name: 'Save',
    source: 'content',
    description: '',
  },
];

const ORACLE_DIFFERENCES: Readonly<Record<string, { name?: string; description?: string }>> = {
  // A tooltip used for the name cannot also describe it: https://w3c.github.io/accname/#mapping_additional_nd_description
  'title fallback': { description: 'Save' },
  'title beats placeholder': { description: 'Search' },
  'description does not reuse name title': { description: 'Search' },
  // HTML-AAM's final text-input fallback: https://w3c.github.io/html-aam/#input-type-text-input-type-password-input-type-number-input-type-search-input-type-tel-input-type-email-input-type-url-and-textarea-elements-accessible-name-computation
  'placeholder fallback': { name: '' },
  // An unused caption is a description: https://w3c.github.io/html-aam/#accdesc-computation
  'aria-label beats caption': { description: '' },
  // A directly referenced hidden root includes hidden descendants: https://w3c.github.io/accname/#comp_hidden_not_referenced
  'hidden referenced label includes hidden children': { name: 'Keep' },
  // Focusable elements ignore presentation: https://www.w3.org/TR/wai-aria-1.2/#presentational-roles-conflict-resolution
  'focusable presentation is ignored': { name: '' },
  // Generic prohibits naming at initialization: https://www.w3.org/TR/wai-aria-1.2/#generic
  'generic naming prohibited': { name: 'Not a control' },
  // Text-node whitespace is preserved until the final flat string: https://w3c.github.io/accname/#comp_text_node
  // Chromium, Firefox and WebKit also return "Save this file" for this fixture.
  'inline whitespace boundaries': { name: 'Savethis file' },
  // Empty labelledby results continue: https://w3c.github.io/accname/#comp_labelledby
  'empty labelledby falls through': { name: '' },
  // The first applicable description wins even when empty: https://w3c.github.io/accname/#mapping_additional_nd_description
  'empty describedby blocks fallback': { description: 'Other' },
  'empty description blocks title': { description: 'Other' },
};

const flattenTrace = (trace: ReadonlyArray<TraceStep>): TraceStep[] =>
  trace.flatMap((step) => [step, ...flattenTrace(step.children)]);

describe('accessible name fixtures', () => {
  it.each(fixtures)('$title: expected name, description, trace, adapters, and oracle', (fixture) => {
    const dom = new JSDOM('');
    const oracle = new JSDOM(fixture.html);
    try {
      const document = new dom.window.DOMParser().parseFromString(fixture.html, 'text/html');
      const element = oracle.window.document.getElementById('target');
      const browserNode = fromDocument(document).lookupId('target');
      const buildNode = parseHtml(fixture.html).lookupId('target');
      if (!element || !browserNode || !buildNode) throw new Error(`Missing fixture target: ${fixture.title}`);
      const name = computeName(buildNode);
      const description = computeDescription(buildNode);
      expect(name.value).toBe(fixture.name);
      expect(name.source).toBe(fixture.source);
      expect(description.value).toBe(fixture.description ?? '');
      expect(computeName(browserNode)).toEqual(name);
      expect(computeDescription(browserNode)).toEqual(description);
      if (name.source && name.value) {
        const used = name.trace.findIndex((step) => step.outcome === 'used');
        expect(used).toBeGreaterThanOrEqual(0);
        expect(name.trace.slice(used + 1).every((step) => step.outcome === 'not-reached')).toBe(true);
      }
      const difference = ORACLE_DIFFERENCES[fixture.title];
      expect(computeAccessibleName(element)).toBe(difference?.name ?? fixture.name);
      expect(computeAccessibleDescription(element)).toBe(
        difference?.description ?? fixture.description ?? '',
      );
    } finally {
      dom.window.close();
      oracle.window.close();
    }
  });

  it.each([
    { ariaLabel: ' aria-label="Author"', name: 'Author', outcome: 'used' },
    { ariaLabel: '', name: 'Native', outcome: 'skipped' },
  ])('keeps published step IDs and precedence with aria-label=$ariaLabel', ({ ariaLabel, name, outcome }) => {
    const node = parseHtml(
      `<label for="target">Native</label><input id="target"${ariaLabel}>`,
    ).lookupId('target');
    if (!node) throw new Error('Missing target');
    const result = computeName(node);
    expect(result.value).toBe(name);
    expect(
      result.trace
        .filter((step) => ['2C', '2D', '2E'].includes(step.id))
        .map(({ id, source, outcome }) => ({ id, source, outcome })),
    ).toEqual([
      { id: '2C', source: 'embedded control', outcome: 'skipped' },
      { id: '2D', source: 'aria-label', outcome },
      { id: '2E', source: 'label[for]', outcome: ariaLabel ? 'not-reached' : 'used' },
      { id: '2E', source: 'placeholder', outcome: 'not-reached' },
      { id: '2E', source: 'aria-placeholder', outcome: 'not-reached' },
    ]);
  });

  it('traces nested embedded controls and referenced content', () => {
    const root = parseHtml(
      '<span id="a">Flash <input value="5" aria-label="Count"> times</span><button id="target" aria-labelledby="a"></button>',
    );
    const node = root.lookupId('target');
    if (!node) throw new Error('Missing target');
    const result = computeName(node);
    expect(result.value).toBe('Flash 5 times');
    expect(result.trace.find((step) => step.id === '2B')?.children.length).toBeGreaterThan(0);
    expect(flattenTrace(result.trace)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: '2C', source: 'embedded control', text: '5', outcome: 'used' }),
      ]),
    );
  });

  it('checks empty, mismatched, missing, prohibited, duplicate and fallback labels', () => {
    for (const [html, code, wcag] of [
      ['<button id="target"><img alt=""></button>', 'empty-name', '4.1.2'],
      ['<button id="target" aria-label="Other">Save</button>', 'label-in-name', '2.5.3'],
      ['<button id="target" aria-labelledby="missing">Save</button>', 'missing-reference', null],
      ['<div id="target" aria-label="Other"></div>', 'prohibited-name', null],
      ['<input id="target" title="Search">', 'fallback-name', null],
      [
        '<label for="target">One</label><label for="target">Two</label><input id="target">',
        'multiple-labels',
        null,
      ],
    ]) {
      const node = parseHtml(html ?? '').lookupId('target');
      if (!node) throw new Error('Missing target');
      expect(checkName(node)).toEqual(expect.arrayContaining([expect.objectContaining({ code, wcag })]));
    }
    const node = parseHtml('<button id="target" aria-label="next">Next…</button>').lookupId('target');
    if (!node) throw new Error('Missing target');
    expect(checkName(node)).toEqual([]);
  });

  it.each([
    ['button', 'button'],
    ['submit', 'button'],
    ['reset', 'button'],
    ['image', 'button'],
    ['text', 'textbox'],
    ['search', 'searchbox'],
    ['email', 'textbox'],
    ['tel', 'textbox'],
    ['url', 'textbox'],
    ['password', 'html-input-password'],
    ['number', 'spinbutton'],
    ['checkbox', 'checkbox'],
    ['radio', 'radio'],
    ['range', 'slider'],
    ['hidden', 'none'],
    ['file', 'html-input-file'],
    ['color', 'html-input-color'],
    ['date', 'html-input-date'],
    ['datetime-local', 'html-input-datetime-local'],
    ['month', 'html-input-month'],
    ['time', 'html-input-time'],
    ['week', 'html-input-week'],
  ])('maps the %s input role', (type, role) => {
    const node = parseHtml(`<input id="target" type="${type}">`).lookupId('target');
    if (!node) throw new Error('Missing target');
    expect(roleOf(node)).toBe(role);
  });

  it('uses the first valid non-abstract explicit role', () => {
    const node = parseHtml('<div id="target" role="invalid widget button link">Save</div>').lookupId(
      'target',
    );
    if (!node) throw new Error('Missing target');
    expect(roleOf(node)).toBe('button');
    expect(computeName(node).value).toBe('Save');
  });

  it('parses hostile markup without requests or execution in a script-capable environment', async () => {
    const requests: string[] = [];
    const dom = new JSDOM('', {
      url: 'https://example.test/',
      runScripts: 'dangerously',
      resources: {
        interceptors: [
          requestInterceptor((request) => {
            requests.push(request.url);
            return new Response('', { status: 200 });
          }),
        ],
      },
    });
    const alertCalls: string[] = [];
    dom.window.alert = (message?: string) => {
      alertCalls.push(message ?? '');
    };
    try {
      const html =
        '<button id="target">Save<img src="https://example.test/x" onerror="alert(1)"></button><script>alert(2)</script><iframe src="https://example.test/frame"></iframe>';
      const document = new dom.window.DOMParser().parseFromString(html, 'text/html');
      const node = fromDocument(document).lookupId('target');
      if (!node) throw new Error('Missing target');
      expect(computeName(node).value).toBe('Save');
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(requests).toEqual([]);
      expect(alertCalls).toEqual([]);
      expect(dom.window.document.body.children).toHaveLength(0);
    } finally {
      dom.window.close();
    }
  });
});

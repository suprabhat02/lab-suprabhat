import type { AppInputs, ShareState } from '../cascade/share';

export const DEFAULT_INPUTS: AppInputs = {
  selectors: ['#nav a', '.menu .link:hover'],
  nesting: `.card, #promo {
  & .title {
    color: navy;
  }
  &:hover {
    outline: 2px solid;
  }
  @media (width > 40em) {
    padding: 2rem;
  }
}`,
  cascade: {
    property: 'color',
    layerOrder: ['base', 'components'],
    rows: [
      {
        selector: '#hero .title',
        value: 'navy',
        important: false,
        inline: false,
        layer: 'components',
        scope: null,
        order: 1,
      },
      {
        selector: 'h1',
        value: 'crimson',
        important: false,
        inline: false,
        layer: null,
        scope: null,
        order: 2,
      },
      {
        selector: '.title',
        value: 'teal',
        important: false,
        inline: false,
        layer: 'base',
        scope: null,
        order: 3,
      },
    ],
  },
};

export const DEFAULT_STATE: ShareState = { v: 1, mode: 'anatomy', inputs: DEFAULT_INPUTS };

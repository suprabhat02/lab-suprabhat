export type * from './types';
export { ok, err } from './types';
export { add, compareSpecificity, formatSpecificity, ZERO } from './math';
export { calculate, strongest, forgiveLists, MAX_SELECTOR_LENGTH } from './specificity';
export { compare, columnSentence, decidingColumn, columnIndex } from './compare';
export type { Column, Comparison, Contender } from './compare';
export { expandNesting, expandSelector, MAX_NESTING_LENGTH } from './nesting';
export type { ExpandedRule, NestingOutput } from './nesting';
export { resolveCascade, resolveLayerOrder, STEP_NAMES } from './cascade';
export type {
  CascadeDeclaration,
  CascadeInput,
  CascadeResult,
  CascadeStep,
  Context,
  Origin,
  ScopeInfo,
  StepNumber,
  StepOutcome,
} from './cascade';
export { suggestFixes, classesNeeded } from './suggest';
export type { Suggestion, SuggestionKind, SuggestInput, Ranked } from './suggest';
export { encodeState, decodeState, readState, SHARE_VERSION, MAX_SHARE_BYTES, MODES, LIMITS, LAYER_NAME } from './share';
export type { AppInputs, CascadeFormState, CascadeRow, Mode, ShareState } from './share';

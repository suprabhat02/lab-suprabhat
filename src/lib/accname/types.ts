export interface AccNode {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: ReadonlyArray<AccNode>;
  readonly text: string;
  readonly parent: AccNode | null;
  lookupId(id: string): AccNode | null;
}

export type StepId =
  | '1'
  | '2A'
  | '2B'
  | '2C'
  | '2D'
  | '2E'
  | '2F'
  | '2G'
  | '2H'
  | '2I'
  | 'description-1'
  | 'description-2'
  | 'description-3'
  | 'description-4';

export interface TraceStep {
  readonly id: StepId;
  readonly source: string;
  readonly outcome: 'used' | 'skipped' | 'not-reached' | 'empty';
  readonly explanation: string;
  readonly text: string;
  readonly children: ReadonlyArray<TraceStep>;
}

export interface Computation {
  readonly value: string;
  readonly source: string | null;
  readonly trace: ReadonlyArray<TraceStep>;
}

export interface Check {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
  readonly snippet: string;
  readonly wcag: '4.1.2' | '2.5.3' | null;
}

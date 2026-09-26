export type DifferenceStatus = 'same' | 'changed' | 'added' | 'removed' | 'misaligned';
export type DiffSide = 'left' | 'right';
export type DiffSegmentType = 'equal' | 'left-only' | 'right-only';
export type CharacterDifferenceKind = 'substitution' | 'left-only' | 'right-only';

export interface TextRange {
  text: string;
  start: number;
  end: number;
}

export interface DiffSegment extends TextRange {
  type: DiffSegmentType;
}

export interface CharacterDifference {
  kind: CharacterDifferenceKind;
  left?: TextRange;
  right?: TextRange;
}

export interface CharacterDiffResult {
  leftSegments: DiffSegment[];
  rightSegments: DiffSegment[];
  differences: CharacterDifference[];
  leftOnlyCharacterCount: number;
  rightOnlyCharacterCount: number;
}

export interface TextUnit {
  id: string;
  paragraphId: string;
  paragraphOrder: number;
  sentenceOrder: number;
  paragraphText: string;
  text: string;
}

export interface VersionDocument {
  id: string;
  name: string;
  source: string;
  createdAt: string;
  text: string;
  units: TextUnit[];
}

export interface AlignmentRow {
  id: string;
  left?: TextUnit;
  right?: TextUnit;
  status: DifferenceStatus;
  similarity: number;
  note: string;
  source: string;
  accepted: boolean;
  manuallyAdjusted: boolean;
}

export interface ComparisonRules {
  ignorePunctuation: boolean;
  ignoreVariants: boolean;
  candidateWindow: number;
}

export interface PersistedCollationState {
  versions: VersionDocument[];
  leftVersionId: string;
  rightVersionId: string;
  rows: AlignmentRow[];
  rules: ComparisonRules;
  selectedRowId: string;
}

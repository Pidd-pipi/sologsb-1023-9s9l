import type {
  CharacterDifference,
  CharacterDifferenceKind,
  CharacterDiffResult,
  ComparisonRules,
  DiffSegment,
  DiffSegmentType,
  TextRange
} from './types';

const variantMap: Record<string, string> = {
  為: '为',
  爲: '为',
  識: '识',
  強: '强',
  與: '与',
  猶: '犹',
  鄰: '邻',
  儼: '俨',
  渙: '涣',
  將: '将',
  樸: '朴',
  曠: '旷',
  濁: '浊',
  靜: '静',
  動: '动',
  玅: '妙',
  裏: '里',
  裡: '里',
  說: '说',
  國: '国'
};

const punctuationPattern = /[\s\p{P}\p{S}]/u;

interface ComparisonToken {
  text: string;
  index: number;
  key: string;
  ignored: boolean;
}

type DiffOperation =
  | { type: 'equal'; left: ComparisonToken; right: ComparisonToken }
  | { type: 'delete'; token: ComparisonToken }
  | { type: 'insert'; token: ComparisonToken };

function isIgnoredCharacter(character: string, rules: ComparisonRules) {
  if (rules.ignorePunctuation && punctuationPattern.test(character)) return true;
  return false;
}

export function normalizeForComparison(value: string, rules: ComparisonRules) {
  const source = value.toLocaleLowerCase().trim();
  return Array.from(source, (character) => {
    if (isIgnoredCharacter(character, rules)) return '';
    return rules.ignoreVariants ? variantMap[character] ?? character : character;
  }).join('');
}

function tokenize(value: string, rules: ComparisonRules): ComparisonToken[] {
  let offset = 0;
  return Array.from(value, (character) => {
    const index = offset;
    offset += character.length;
    const ignored = isIgnoredCharacter(character, rules);
    const key = !ignored && rules.ignoreVariants ? variantMap[character] ?? character : character;
    return {
      text: character,
      index,
      key: ignored ? '' : key.toLocaleLowerCase(),
      ignored
    };
  });
}

function shouldUseMyers(a: ComparisonToken[], b: ComparisonToken[]) {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength <= 900) return true;

  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix].key === b[prefix].key) prefix += 1;
  let suffix = 0;
  while (
    suffix < Math.min(a.length - prefix, b.length - prefix) &&
    a[a.length - 1 - suffix].key === b[b.length - 1 - suffix].key
  ) {
    suffix += 1;
  }
  if ((prefix + suffix) / maxLength >= 0.12) return true;

  const [shortTokens, longTokens] = a.length <= b.length ? [a, b] : [b, a];
  if (shortTokens.length < 3) return prefix + suffix > 0;
  const trigrams = new Set<string>();
  for (let i = 0; i + 2 < shortTokens.length; i += 1) {
    trigrams.add(`${shortTokens[i].key}|${shortTokens[i + 1].key}|${shortTokens[i + 2].key}`);
  }
  let matches = 0;
  for (let i = 0; i + 2 < longTokens.length; i += 1) {
    if (trigrams.has(`${longTokens[i].key}|${longTokens[i + 1].key}|${longTokens[i + 2].key}`)) {
      matches += 1;
    }
  }
  return matches / Math.max(1, longTokens.length - 2) >= 0.08;
}

function myersOperations(a: ComparisonToken[], b: ComparisonToken[]): DiffOperation[] {
  if (!shouldUseMyers(a, b)) {
    return [
      ...a.map((token) => ({ type: 'delete' as const, token })),
      ...b.map((token) => ({ type: 'insert' as const, token }))
    ];
  }

  const max = a.length + b.length;
  const trace: Record<number, number>[] = [];
  const frontier: Record<number, number> = {};
  let found = false;

  for (let d = 0; d <= max; d += 1) {
    trace.push({ ...frontier });
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (frontier[k - 1] ?? -1) < (frontier[k + 1] ?? -1))
        ? frontier[k + 1] ?? 0
        : (frontier[k - 1] ?? -1) + 1;
      let y = x - k;

      while (x < a.length && y < b.length && a[x].key === b[y].key) {
        x += 1;
        y += 1;
      }
      frontier[k] = x;
      if (x >= a.length && y >= b.length) {
        found = true;
        break;
      }
    }
    if (found) break;
  }

  const operations: DiffOperation[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d];
    const k = x - y;
    const previousK =
      k === -d || (k !== d && (v[k - 1] ?? -1) < (v[k + 1] ?? -1)) ? k + 1 : k - 1;
    const previousX = v[previousK] ?? 0;
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      operations.unshift({ type: 'equal', left: a[x - 1], right: b[y - 1] });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === previousX) {
        operations.unshift({ type: 'insert', token: b[y - 1] });
        y -= 1;
      } else {
        operations.unshift({ type: 'delete', token: a[x - 1] });
        x -= 1;
      }
    }
  }
  return operations;
}

export function similarity(left: string, right: string) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const previous = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(previous[j], previous[j - 1]);
      diagonal = old;
    }
  }
  return previous[b.length] / Math.max(a.length, b.length);
}

function mergeSegments(segments: DiffSegment[]) {
  const result: DiffSegment[] = [];
  segments.forEach((segment) => {
    const previous = result.at(-1);
    if (previous && previous.type === segment.type && previous.end === segment.start) {
      previous.end = segment.end;
      previous.text += segment.text;
    } else {
      result.push({ ...segment });
    }
  });
  return result;
}

function sideSegments(
  tokens: ComparisonToken[],
  side: 'left' | 'right',
  operations: DiffOperation[]
): DiffSegment[] {
  const segmentType = (operation: DiffOperation): DiffSegmentType => {
    if (operation.type === 'equal') return 'equal';
    if (operation.type === 'delete') return side === 'left' ? 'left-only' : 'equal';
    return side === 'right' ? 'right-only' : 'equal';
  };
  const tokenFor = (operation: DiffOperation): ComparisonToken => {
    if (operation.type === 'equal') return side === 'left' ? operation.left : operation.right;
    return operation.token;
  };

  const used = new Set<number>();
  const segments: DiffSegment[] = [];
  const addToken = (token: ComparisonToken, type: DiffSegmentType) => {
    if (used.has(token.index)) return;
    used.add(token.index);
    segments.push({
      type,
      text: token.text,
      start: token.index,
      end: token.index + Array.from(token.text).length
    });
  };

  operations.forEach((operation) => {
    const active =
      operation.type === 'equal' ||
      (operation.type === 'delete' && side === 'left') ||
      (operation.type === 'insert' && side === 'right');
    if (active) addToken(tokenFor(operation), segmentType(operation));
  });
  tokens.forEach((token) => addToken(token, 'equal'));
  segments.sort((a, b) => a.start - b.start);
  return mergeSegments(segments);
}

function rangeFromTokens(tokens: ComparisonToken[]): TextRange | undefined {
  if (!tokens.length) return undefined;
  const start = tokens[0].index;
  const end = tokens.at(-1)!.index + Array.from(tokens.at(-1)!.text).length;
  return {
    text: tokens.map((token) => token.text).join(''),
    start,
    end
  };
}

function meaningful(tokens: ComparisonToken[]) {
  return tokens.filter((token) => !token.ignored);
}

function buildDifferences(operations: DiffOperation[]): CharacterDifference[] {
  const differences: CharacterDifference[] = [];
  let index = 0;

  while (index < operations.length) {
    if (operations[index].type === 'equal') {
      index += 1;
      continue;
    }

    let end = index;
    while (end < operations.length && operations[end].type !== 'equal') end += 1;
    const group = operations.slice(index, end);
    const deleted = meaningful(group.filter((item): item is { type: 'delete'; token: ComparisonToken } => item.type === 'delete').map((item) => item.token));
    const inserted = meaningful(group.filter((item): item is { type: 'insert'; token: ComparisonToken } => item.type === 'insert').map((item) => item.token));
    const kind: CharacterDifferenceKind = deleted.length && inserted.length
      ? 'substitution'
      : deleted.length
        ? 'left-only'
        : 'right-only';
    differences.push({
      kind,
      left: rangeFromTokens(deleted),
      right: rangeFromTokens(inserted)
    });
    index = end;
  }
  return differences;
}

export function diffCharacterTexts(
  leftText: string,
  rightText: string,
  rules: ComparisonRules
): CharacterDiffResult {
  const leftTokens = tokenize(leftText, rules);
  const rightTokens = tokenize(rightText, rules);
  const operations = myersOperations(
    leftTokens.filter((token) => !token.ignored),
    rightTokens.filter((token) => !token.ignored)
  );
  const leftSegments = sideSegments(leftTokens, 'left', operations);
  const rightSegments = sideSegments(rightTokens, 'right', operations);
  const differences = buildDifferences(operations);

  return {
    leftSegments,
    rightSegments,
    differences,
    leftOnlyCharacterCount: differences.reduce((sum, item) => sum + (item.left ? Array.from(item.left.text).length : 0), 0),
    rightOnlyCharacterCount: differences.reduce((sum, item) => sum + (item.right ? Array.from(item.right.text).length : 0), 0)
  };
}

const diffCache = new Map<string, CharacterDiffResult>();

export function memoizedCharacterDiff(leftText: string, rightText: string, rules: ComparisonRules) {
  const key = JSON.stringify([leftText, rightText, rules.ignorePunctuation, rules.ignoreVariants]);
  const cached = diffCache.get(key);
  if (cached) return cached;
  const result = diffCharacterTexts(leftText, rightText, rules);
  if (diffCache.size >= 500) diffCache.clear();
  diffCache.set(key, result);
  return result;
}

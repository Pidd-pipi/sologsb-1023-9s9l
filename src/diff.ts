import type { ComparisonRules } from './types';

export const variantMap: Record<string, string> = {
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

const punctuationPattern = /[\s，。！？；：、“”‘’「」『』（）()《》〈〉·,.!?;:'"[\]{}<>—\-…]/;

export function normalized(value: string, rules: ComparisonRules) {
  let result = value.toLocaleLowerCase().trim();
  if (rules.ignoreVariants) {
    result = Array.from(result, (character) => variantMap[character] ?? character).join('');
  }
  if (rules.ignorePunctuation) {
    result = result.replace(
      /[\s，。！？；：、“”‘’「」『』（）()《》〈〉·,.!?;:'"[\]{}<>—\-…]/g,
      ''
    );
  }
  return result;
}

interface NormalizedWithMap {
  chars: string[];
  /** chars[i] 对应原文（Array.from 后）的字符下标 */
  map: number[];
}

/**
 * 与 normalized() 完全相同的归一化逻辑，但保留每个归一化字符
 * 到原始字符串（按字）下标的映射，便于把差异标回原文。
 */
function normalizeWithMap(value: string, rules: ComparisonRules): NormalizedWithMap {
  const original = Array.from(value);
  const chars: string[] = [];
  const map: number[] = [];
  original.forEach((character, index) => {
    let current = character.toLocaleLowerCase();
    if (rules.ignoreVariants) current = variantMap[current] ?? current;
    chars.push(current);
    map.push(index);
  });
  // 对应 normalized() 里的 trim()
  while (chars.length && /\s/.test(chars[0])) {
    chars.shift();
    map.shift();
  }
  while (chars.length && /\s/.test(chars[chars.length - 1])) {
    chars.pop();
    map.pop();
  }
  if (!rules.ignorePunctuation) return { chars, map };
  const keptChars: string[] = [];
  const keptMap: number[] = [];
  chars.forEach((character, index) => {
    if (punctuationPattern.test(character)) return;
    keptChars.push(character);
    keptMap.push(map[index]);
  });
  return { chars: keptChars, map: keptMap };
}

export type DiffSegmentType = 'same' | 'removed' | 'added';

export interface DiffSegment {
  text: string;
  /** same：双方相同；removed：底本独有；added：参校本独有 */
  type: DiffSegmentType;
}

export interface CharDiffResult {
  /** 底本原文切分后的片段序列 */
  left: DiffSegment[];
  /** 参校本原文切分后的片段序列 */
  right: DiffSegment[];
  /** 底本独有的连续字词片段（原文用字） */
  leftOnly: string[];
  /** 参校本独有的连续字词片段（原文用字） */
  rightOnly: string[];
}

function buildSegments(value: string, types: DiffSegmentType[]): { segments: DiffSegment[]; unique: string[] } {
  const characters = Array.from(value);
  const segments: DiffSegment[] = [];
  const unique: string[] = [];
  characters.forEach((character, index) => {
    const type = types[index] ?? 'same';
    const last = segments[segments.length - 1];
    const merged = Boolean(last && last.type === type);
    if (merged) {
      last!.text += character;
    } else {
      segments.push({ text: character, type });
    }
    if (type !== 'same') {
      // 相同类型的字符必然已并入同一片段，merged 即表示延续上一段异文
      if (merged) {
        unique[unique.length - 1] += character;
      } else {
        unique.push(character);
      }
    }
  });
  return { segments, unique };
}

/**
 * 字符级差异：在归一化后的文本上做 LCS 对齐（忽略标点 / 异体字的
 * 规则在此生效），再把差异映射回原文，得到可直接渲染的片段序列。
 */
export function computeCharDiff(leftText: string, rightText: string, rules: ComparisonRules): CharDiffResult {
  const left = normalizeWithMap(leftText, rules);
  const right = normalizeWithMap(rightText, rules);
  const leftTypes: DiffSegmentType[] = new Array(Array.from(leftText).length).fill('same');
  const rightTypes: DiffSegmentType[] = new Array(Array.from(rightText).length).fill('same');

  // 先去掉公共前后缀，缩小动态规划规模
  let prefix = 0;
  while (prefix < left.chars.length && prefix < right.chars.length && left.chars[prefix] === right.chars[prefix]) {
    prefix += 1;
  }
  let leftEnd = left.chars.length;
  let rightEnd = right.chars.length;
  while (leftEnd > prefix && rightEnd > prefix && left.chars[leftEnd - 1] === right.chars[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }

  const a = left.chars.slice(prefix, leftEnd);
  const b = right.chars.slice(prefix, rightEnd);
  const aMap = left.map.slice(prefix, leftEnd);
  const bMap = right.map.slice(prefix, rightEnd);
  const m = a.length;
  const n = b.length;

  if (m * n <= 600_000) {
    const width = n + 1;
    const dp = new Uint32Array((m + 1) * width);
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        dp[i * width + j] =
          a[i - 1] === b[j - 1]
            ? dp[(i - 1) * width + j - 1] + 1
            : Math.max(dp[(i - 1) * width + j], dp[i * width + j - 1]);
      }
    }
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        i -= 1;
        j -= 1;
      } else if (dp[i * width + j - 1] >= dp[(i - 1) * width + j]) {
        rightTypes[bMap[j - 1]] = 'added';
        j -= 1;
      } else {
        leftTypes[aMap[i - 1]] = 'removed';
        i -= 1;
      }
    }
    while (i > 0) {
      leftTypes[aMap[i - 1]] = 'removed';
      i -= 1;
    }
    while (j > 0) {
      rightTypes[bMap[j - 1]] = 'added';
      j -= 1;
    }
  } else {
    // 超长文本兜底：中段整体视为各自独有，避免界面卡死
    aMap.forEach((index) => {
      leftTypes[index] = 'removed';
    });
    bMap.forEach((index) => {
      rightTypes[index] = 'added';
    });
  }

  const leftResult = buildSegments(leftText, leftTypes);
  const rightResult = buildSegments(rightText, rightTypes);
  return {
    left: leftResult.segments,
    right: rightResult.segments,
    leftOnly: leftResult.unique,
    rightOnly: rightResult.unique
  };
}

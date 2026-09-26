<script setup lang="ts">
import { computed } from 'vue';
import { memoizedCharacterDiff } from '../textDiff';
import type { CharacterDiffResult, ComparisonRules, DiffSide, DiffSegment } from '../types';

const props = defineProps<{
  text: string;
  oppositeText?: string;
  side: DiffSide;
  rules: ComparisonRules;
  selectable?: boolean;
}>();

const emit = defineEmits<{
  select: [];
}>();

const diff = computed<CharacterDiffResult>(() =>
  memoizedCharacterDiff(props.text, props.oppositeText ?? '', props.rules)
);

const segments = computed(() =>
  props.side === 'left' ? diff.value.leftSegments : diff.value.rightSegments
);

const differenceCount = computed(() => diff.value.differences.length);

function segmentLabel(segment: DiffSegment) {
  const sideName = props.side === 'left' ? '底本' : '参校本';
  return `${sideName}独有“${segment.text}”，字符位置 ${segment.start + 1}-${segment.end}。点击选择本校勘行。`;
}
</script>

<template>
  <span class="character-diff">
    <template v-for="(segment, index) in segments" :key="`${segment.start}-${index}`">
      <mark
        v-if="segment.type !== 'equal'"
        class="diff-character"
        :class="[
          segment.type === 'left-only' ? 'left-only' : 'right-only',
          selectable ? 'is-selectable' : ''
        ]"
        :role="selectable ? 'button' : undefined"
        :tabindex="selectable ? 0 : undefined"
        :aria-label="selectable ? segmentLabel(segment) : undefined"
        @click="selectable && emit('select')"
        @keydown.enter.prevent="selectable && emit('select')"
        @keydown.space.prevent="selectable && emit('select')"
      >{{ segment.text }}</mark>
      <template v-else>{{ segment.text }}</template>
    </template>
    <span v-if="selectable" class="sr-only">{{ differenceCount }} 处字符差异</span>
  </span>
</template>

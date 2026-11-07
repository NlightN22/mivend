<script setup lang="ts">
import { computed } from 'vue';
import { MvFlaggedValue } from '@mivend/ui-kit';

const props = defineProps<{
    percent: number | null;
    maxPercent: number | null | undefined;
    overLimit: boolean;
}>();
const text = computed(() => (props.percent === null ? '—' : `${props.percent}%`));
</script>

<template>
    <MvFlaggedValue
        v-if="overLimit"
        severity="warning"
        :tooltip="`Discount above the allowed maximum (max ${maxPercent}%)`"
    >
        {{ text }}
    </MvFlaggedValue>
    <span v-else>{{ text }}</span>
</template>

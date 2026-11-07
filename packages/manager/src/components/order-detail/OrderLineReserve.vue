<script setup lang="ts">
import { computed } from 'vue';
import { MvFlaggedValue } from '@mivend/ui-kit';

const props = defineProps<{ reserved: number; needed: number; short: boolean }>();
const text = computed(() => `${props.reserved} / ${props.needed}`);
</script>

<template>
    <MvFlaggedValue
        v-if="short"
        severity="warning"
        :tooltip="`Reserved ${reserved} of ${needed}; stock for the rest is not held`"
    >
        {{ text }}
    </MvFlaggedValue>
    <span v-else>{{ text }}</span>
</template>

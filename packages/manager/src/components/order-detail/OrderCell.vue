<script setup lang="ts">
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { CellProblem } from '../../utils/orderLineProblems';
import OrderCellFlag from './OrderCellFlag.vue';

defineProps<{
    problem?: CellProblem;
    consequences: Map<string, FindingConsequence>;
    canConfirm: boolean;
    canReject: boolean;
}>();
defineEmits<{ confirm: []; reject: [] }>();
</script>

<template>
    <OrderCellFlag
        v-if="problem"
        :problem="problem"
        :consequences="consequences"
        :can-confirm="canConfirm"
        :can-reject="canReject"
        @confirm="$emit('confirm')"
        @reject="$emit('reject')"
    >
        <slot />
    </OrderCellFlag>
    <slot v-else />
</template>

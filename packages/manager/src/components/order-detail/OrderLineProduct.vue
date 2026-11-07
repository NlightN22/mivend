<script setup lang="ts">
import { computed } from 'vue';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { findingDetail, findingTitle } from '../../utils/orderCheckMessages';
import { listedFindings } from '../../utils/orderLineChecks';

const props = defineProps<{ name: string; sku: string; findings: OrderCheckFinding[] }>();
const listed = computed(() => listedFindings(props.findings));
</script>

<template>
    <strong class="line-product__name">{{ name }}</strong>
    <span class="line-product__sku">{{ sku }}</span>
    <em v-for="f in listed" :key="f.id" class="line-product__finding">
        {{ findingTitle(f.messageKey) }}
        <template v-if="findingDetail(f)">({{ findingDetail(f) }})</template>
    </em>
</template>

<style scoped>
.line-product__name,
.line-product__sku,
.line-product__finding {
    display: block;
}

.line-product__sku {
    color: var(--app-text-grey);
    font-size: 12px;
}

.line-product__finding {
    margin-top: 2px;
    color: var(--app-warn-fg);
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
}
</style>

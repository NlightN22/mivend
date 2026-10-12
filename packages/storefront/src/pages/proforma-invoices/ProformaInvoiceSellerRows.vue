<script setup lang="ts">
import { computed } from 'vue';

interface Seller {
    legalName: string;
    inn?: string | null;
    legalAddress?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    bankBik?: string | null;
}

const props = defineProps<{ seller?: Seller | null }>();
const bank = computed(() =>
    [props.seller?.bankName, props.seller?.bankAccount, props.seller?.bankBik]
        .filter(Boolean)
        .join(' · '),
);
</script>

<template>
    <div class="seller-row">
        <span>Seller</span>
        <span class="seller-val">{{ seller?.legalName ?? '—' }}</span>
    </div>
    <div v-if="seller?.inn" class="seller-row">
        <span>Tax ID</span><span class="seller-val">{{ seller.inn }}</span>
    </div>
    <div v-if="seller?.legalAddress" class="seller-row">
        <span>Address</span><span class="seller-val">{{ seller.legalAddress }}</span>
    </div>
    <div v-if="bank" class="seller-row">
        <span>Bank account</span><span class="seller-val">{{ bank }}</span>
    </div>
</template>

<style scoped>
.seller-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    padding: 5px 0;
    color: #344640;
}
.seller-val {
    font-weight: 850;
    text-align: right;
}
</style>

<script setup lang="ts">
import { ref } from 'vue';
import { MvPanel } from '@mivend/ui-kit';
import DiscountsList from '../discounts/DiscountsList.vue';
import DiscountGrantForm from '../discounts/DiscountGrantForm.vue';
import type { DiscountRow } from '../discounts/discountsRows';

defineProps<{ counterpartyId: string }>();

const list = ref<InstanceType<typeof DiscountsList> | null>(null);
const showForm = ref(false);
const renewFrom = ref<DiscountRow | null>(null);

function openForm(row: DiscountRow | null): void {
    renewFrom.value = row;
    showForm.value = true;
}
function handleSubmitted(): void {
    showForm.value = false;
    list.value?.reload();
}
</script>

<template>
    <MvPanel v-if="showForm" :title="renewFrom ? 'Renew discount grant' : 'New discount grant'">
        <DiscountGrantForm
            :renew-from="renewFrom"
            @submitted="handleSubmitted"
            @cancel="showForm = false"
        />
    </MvPanel>
    <DiscountsList
        ref="list"
        :counterparty-id="counterpartyId"
        url-prefix="discounts."
        @new="openForm(null)"
        @renew="openForm($event)"
    />
</template>

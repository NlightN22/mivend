<script setup lang="ts">
import { ref } from 'vue';
import { MvFilterChips, MvPanel } from '@mivend/ui-kit';
import { DISCOUNTS_SOURCES, useDiscountsSource } from '../../composables/useDiscountsSource';
import DiscountsList from './DiscountsList.vue';
import ErpDiscountsList from './ErpDiscountsList.vue';
import DiscountGrantForm from './DiscountGrantForm.vue';
import type { DiscountRow } from './discountsRows';

// The ERP discounts and the portal requests behind one switch; a set counterpartyId fixes both to that customer.
const props = withDefaults(defineProps<{ counterpartyId?: string; urlPrefix?: string }>(), {
    counterpartyId: '',
    urlPrefix: '',
});

const source = useDiscountsSource(props.urlPrefix);
const requests = ref<InstanceType<typeof DiscountsList> | null>(null);
const showForm = ref(false);
const renewFrom = ref<DiscountRow | null>(null);

function openForm(row: DiscountRow | null): void {
    renewFrom.value = row;
    showForm.value = true;
}
function handleSubmitted(): void {
    showForm.value = false;
    requests.value?.reload();
}
</script>

<template>
    <div class="discounts-workspace">
        <MvFilterChips
            :chips="DISCOUNTS_SOURCES"
            :active="source"
            @select="source = $event as typeof source"
        />

        <MvPanel
            v-if="showForm && source === 'requests'"
            :title="renewFrom ? 'Renew discount grant' : 'New discount grant'"
        >
            <DiscountGrantForm
                :renew-from="renewFrom"
                @submitted="handleSubmitted"
                @cancel="showForm = false"
            />
        </MvPanel>

        <DiscountsList
            v-if="source === 'requests'"
            ref="requests"
            :counterparty-id="props.counterpartyId"
            :url-prefix="props.urlPrefix"
            @new="openForm(null)"
            @renew="openForm($event)"
        />
        <ErpDiscountsList
            v-else
            :counterparty-id="props.counterpartyId"
            :url-prefix="props.urlPrefix"
        />
    </div>
</template>

<style scoped>
.discounts-workspace {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
</style>

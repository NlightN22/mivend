<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { IconCheck } from '@tabler/icons-vue';
import { MvModal } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';
import {
    MyTradingPointsForDeliverySelectorDocument,
    SetPreferredTradingPointForDeliverySelectorDocument,
    type MyTradingPointsForDeliverySelectorQuery,
} from '../../api/generated/graphql';

defineProps<{ addPointLink: { path: string; query: Record<string, string> } }>();
const emit = defineEmits<{ close: [] }>();

type PointOption = MyTradingPointsForDeliverySelectorQuery['myTradingPoints'][number];

const authStore = useAuthStore();
const points = ref<PointOption[]>([]);
const loadingPoints = ref(true);
const savingId = ref<string | null>(null);
const currentId = computed(() => authStore.customer?.customFields?.preferredTradingPointId ?? null);

onMounted(async () => {
    try {
        const result = await shopApi(MyTradingPointsForDeliverySelectorDocument);
        points.value = result.myTradingPoints ?? [];
    } finally {
        loadingPoints.value = false;
    }
});

async function selectPoint(id: string): Promise<void> {
    if (savingId.value) return;
    savingId.value = id;
    try {
        await shopApi(SetPreferredTradingPointForDeliverySelectorDocument, { id });
        await authStore.fetchCurrentCustomer();
        emit('close');
    } finally {
        savingId.value = null;
    }
}
</script>

<template>
    <MvModal :title="$t('delivery.selectPoint')" @close="emit('close')">
        <div v-if="loadingPoints" class="ds-modal-loading">{{ $t('common.loading') }}</div>
        <div v-else-if="!points.length" class="ds-modal-empty">
            {{ $t('delivery.noPoints') }}
            <RouterLink :to="addPointLink">{{ $t('delivery.addPoint') }}</RouterLink>
        </div>
        <ul v-else class="ds-point-list">
            <li
                v-for="pt in points"
                :key="pt.id"
                class="ds-point-item"
                :class="{
                    'ds-point-item--active': pt.id === currentId,
                    'ds-point-item--saving': savingId === pt.id,
                }"
                @click="selectPoint(pt.id)"
            >
                <div class="ds-point-item__check">
                    <IconCheck
                        v-if="pt.id === currentId"
                        :size="14"
                        stroke-width="3"
                        aria-hidden="true"
                    />
                </div>
                <div>
                    <div class="ds-point-item__name">{{ pt.name }}</div>
                    <div class="ds-point-item__addr">{{ pt.address }}</div>
                </div>
            </li>
        </ul>
    </MvModal>
</template>

<style scoped>
.ds-modal-loading,
.ds-modal-empty {
    text-align: center;
    padding: 24px 0;
    color: #66736e;
    font-size: 14px;
}

.ds-point-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
}

.ds-point-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #dde7e2;
    border-radius: 16px;
    cursor: pointer;
    transition: 0.14s ease;
}

.ds-point-item:hover {
    background: #f3f8f6;
    border-color: #b0ccbf;
}

.ds-point-item--active {
    border-color: #00a878;
    background: linear-gradient(135deg, #fff, #f3fff7);
}

.ds-point-item--saving {
    opacity: 0.6;
    pointer-events: none;
}

.ds-point-item__check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #dde7e2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #00a878;
    flex-shrink: 0;
}

.ds-point-item--active .ds-point-item__check {
    border-color: #00a878;
    background: #00a878;
    color: #fff;
}

.ds-point-item__name {
    font-size: 14px;
    font-weight: 800;
    color: #14231f;
    margin-bottom: 2px;
}

.ds-point-item__addr {
    font-size: 13px;
    color: #66736e;
}
</style>

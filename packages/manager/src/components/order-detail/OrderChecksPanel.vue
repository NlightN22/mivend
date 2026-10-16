<script setup lang="ts">
import { computed, onMounted, toRef, watch } from 'vue';
import { MvButton, MvNotice, MvStatusBadge } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useOrderChecks } from '../../composables/useOrderChecks';
import type { OrderDetailLine } from '../../api/orderDetail';
import { findingTitle, orgNames, severityVariant } from '../../utils/orderCheckMessages';
import OrderLineStockContext from './OrderLineStockContext.vue';

const props = defineProps<{ orderId: string; lines: OrderDetailLine[]; refreshOn?: unknown }>();
const authStore = useAuthStore();
const { findings, loading, recomputing, error, byLine, hasStale, computedAt, load, recompute } =
    useOrderChecks(toRef(props, 'orderId'));

const canRecompute = computed(() => authStore.hasPermission('ReadCheckResults'));
const lineById = computed(() => new Map(props.lines.map(l => [l.id, l])));
const failingLines = computed(() =>
    [...byLine.value.entries()].filter(([ref]) => ref !== '').map(([ref, f]) => ({ ref, f })),
);
const orderLevel = computed(() => byLine.value.get('') ?? []);

onMounted(load);
watch(() => props.refreshOn, load);
</script>

<template>
    <div class="order-checks">
        <p class="order-checks__lead">
            These are controls required by the ERP: the ERP will not post the order unless they
            pass. They are shown early so staff can fix the cause; the order itself is never refused
            here.
        </p>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <div class="order-checks__bar">
            <MvStatusBadge v-if="hasStale" variant="warning">Out of date</MvStatusBadge>
            <span v-if="computedAt" class="order-checks__time">
                Computed {{ new Date(computedAt).toLocaleString('en-US') }}
            </span>
            <MvButton
                v-if="canRecompute"
                variant="secondary"
                size="sm"
                :disabled="recomputing"
                @click="recompute"
            >
                {{ recomputing ? 'Recomputing…' : 'Recompute' }}
            </MvButton>
        </div>

        <p v-if="loading" class="order-checks__empty">Loading…</p>
        <p v-else-if="!findings.length" class="order-checks__empty">
            No ERP requirement findings for this order.
        </p>
        <template v-else>
            <ul v-for="entry in failingLines" :key="entry.ref" class="order-checks__line">
                <li class="order-checks__product">
                    {{ lineById.get(entry.ref)?.productVariant.name ?? `Line ${entry.ref}` }}
                    <span class="order-checks__sku">{{
                        lineById.get(entry.ref)?.productVariant.sku
                    }}</span>
                </li>
                <li v-for="f in entry.f" :key="f.id" class="order-checks__finding">
                    <div class="order-checks__head">
                        <MvStatusBadge :variant="severityVariant(f.severity)"
                            >Not met</MvStatusBadge
                        >
                        <span class="order-checks__code">{{ f.checkCode }}</span>
                        <MvStatusBadge v-if="f.stale" variant="warning">Out of date</MvStatusBadge>
                    </div>
                    <p class="order-checks__title">{{ findingTitle(f.messageKey) }}</p>
                    <dl class="order-checks__facts">
                        <dt>Storage organizations</dt>
                        <dd>{{ orgNames(f.facts.storageOrganizations) }}</dd>
                        <dt>Contract organizations</dt>
                        <dd>{{ orgNames(f.facts.contractOrganizations) }}</dd>
                        <template v-if="f.facts.needed !== undefined">
                            <dt>Needed / available</dt>
                            <dd>{{ f.facts.needed }} / {{ f.facts.available ?? 0 }}</dd>
                        </template>
                    </dl>
                </li>
            </ul>
            <ul v-if="orderLevel.length" class="order-checks__line">
                <li v-for="f in orderLevel" :key="f.id" class="order-checks__title">
                    {{ findingTitle(f.messageKey) }}
                </li>
            </ul>
        </template>

        <OrderLineStockContext
            :order-id="orderId"
            :lines="lines"
            :findings="findings"
            :refresh-on="refreshOn"
        />
    </div>
</template>

<style scoped>
.order-checks {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;
}

.order-checks__lead,
.order-checks__empty,
.order-checks__time {
    margin: 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.order-checks__bar {
    display: flex;
    align-items: center;
    gap: 10px;
}

.order-checks__bar :last-child {
    margin-left: auto;
}

.order-checks__line {
    list-style: none;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.order-checks__product {
    font-weight: 700;
}

.order-checks__sku,
.order-checks__code {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
    margin-left: 6px;
}

.order-checks__head {
    display: flex;
    align-items: center;
    gap: 8px;
}

.order-checks__title {
    margin: 4px 0;
}

.order-checks__facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px 14px;
    margin: 0;
}

.order-checks__facts dt {
    color: var(--el-text-color-secondary, #6b7280);
}

.order-checks__facts dd {
    margin: 0;
}
</style>

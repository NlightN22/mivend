<script setup lang="ts">
import type { PendingTradingPointChange } from '../../api/customers';

defineProps<{ change: PendingTradingPointChange; busy: boolean }>();
defineEmits<{ accept: []; reject: [] }>();
</script>

<template>
    <div class="tp-pending" data-testid="tp-pending-change">
        <strong>Change proposed by the customer</strong>
        <dl>
            <div>
                <dt>Name</dt>
                <dd>{{ change.name }}</dd>
            </div>
            <div>
                <dt>Address</dt>
                <dd>{{ change.address }}</dd>
            </div>
            <div>
                <dt>Location</dt>
                <dd>{{ change.latitude.toFixed(6) }}, {{ change.longitude.toFixed(6) }}</dd>
            </div>
            <div v-if="change.workingHours">
                <dt>Working hours</dt>
                <dd>{{ change.workingHours }}</dd>
            </div>
            <div v-if="change.contactName">
                <dt>Contact</dt>
                <dd>{{ change.contactName }} {{ change.contactPhone }}</dd>
            </div>
        </dl>
        <div class="tp-pending__actions">
            <button
                type="button"
                :disabled="busy"
                data-testid="tp-pending-accept"
                @click="$emit('accept')"
            >
                Accept
            </button>
            <button
                type="button"
                :disabled="busy"
                data-testid="tp-pending-reject"
                @click="$emit('reject')"
            >
                Reject
            </button>
        </div>
    </div>
</template>

<style scoped>
.tp-pending {
    flex-basis: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    border: 1px solid var(--el-color-warning, #e6a23c);
    border-radius: 6px;
    font-size: 13px;
}

.tp-pending dl {
    margin: 6px 0;
    display: grid;
    gap: 2px;
}

.tp-pending dl div {
    display: flex;
    gap: 8px;
}

.tp-pending dt {
    min-width: 110px;
    color: var(--el-text-color-secondary, #6b7280);
}

.tp-pending dd {
    margin: 0;
}

.tp-pending__actions {
    display: flex;
    gap: 8px;
}
</style>

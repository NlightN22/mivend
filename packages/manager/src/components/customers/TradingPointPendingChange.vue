<script setup lang="ts">
import { MvButton } from '@mivend/ui-kit';

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
            <MvButton
                size="sm"
                :loading="busy"
                data-testid="tp-pending-accept"
                @click="$emit('accept')"
            >
                Accept
            </MvButton>
            <MvButton
                size="sm"
                variant="secondary"
                :disabled="busy"
                data-testid="tp-pending-reject"
                @click="$emit('reject')"
            >
                Reject
            </MvButton>
        </div>
    </div>
</template>

<style scoped>
.tp-pending {
    flex-basis: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
    border-radius: var(--app-radius-md);
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
    opacity: 0.8;
}

.tp-pending dd {
    margin: 0;
}

.tp-pending__actions {
    display: flex;
    gap: 8px;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { MvButton, MvSelect, MvNotice } from '@mivend/ui-kit';
import type { ManagerOption } from '../../api/orders';

const props = defineProps<{
    escalatesTo: string[];
    managers: ManagerOption[];
    canDecide: boolean;
    // Only the requester may escalate; the server enforces it.
    canEscalate: boolean;
    disabledReason: string;
    busy: boolean;
}>();
const emit = defineEmits<{
    approve: [comment: string];
    reject: [comment: string];
    escalate: [administratorId: string];
}>();

const comment = ref('');
const error = ref('');
const showEscalate = ref(false);
const escalateToId = ref('');

const escalationCandidates = computed(() =>
    !props.canEscalate
        ? []
        : props.managers
              .filter(m => m.roleCodes.some(rc => props.escalatesTo.includes(rc)))
              .map(m => ({ value: m.id, label: m.name })),
);

function handleReject(): void {
    if (!comment.value.trim()) {
        error.value = 'A comment is required to reject a request';
        return;
    }
    error.value = '';
    emit('reject', comment.value);
}

function handleEscalate(): void {
    if (!escalateToId.value) return;
    emit('escalate', escalateToId.value);
}
</script>

<template>
    <div class="decision-actions">
        <label class="decision-actions__label">Comment</label>
        <textarea
            v-model="comment"
            class="decision-actions__comment"
            rows="3"
            placeholder="Optional for approve, required for reject"
            :disabled="!canDecide || busy"
        />
        <MvNotice v-if="!canDecide" variant="info">{{ disabledReason }}</MvNotice>
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <div class="decision-actions__buttons">
            <MvButton
                variant="primary"
                :disabled="!canDecide || busy"
                @click="emit('approve', comment)"
                >Approve</MvButton
            >
            <MvButton variant="danger" :disabled="!canDecide || busy" @click="handleReject"
                >Reject</MvButton
            >
            <button
                v-if="escalationCandidates.length"
                type="button"
                class="decision-actions__escalate-toggle"
                :disabled="busy"
                @click="showEscalate = !showEscalate"
            >
                Escalate to...
            </button>
        </div>

        <div v-if="showEscalate" class="decision-actions__escalate">
            <MvSelect
                v-model="escalateToId"
                :options="[{ value: '', label: 'Select a person' }, ...escalationCandidates]"
            />
            <MvButton size="sm" :disabled="!escalateToId" @click="handleEscalate"
                >Confirm escalation</MvButton
            >
        </div>
    </div>
</template>

<style scoped>
.decision-actions {
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

@media (max-width: 600px) {
    .decision-actions__buttons {
        flex-wrap: wrap;
    }
}

.decision-actions__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--app-text-grey);
}

.decision-actions__comment {
    border: 1px solid var(--app-row-border);
    border-radius: var(--app-radius-md, 12px);
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
    background: var(--app-surface);
    color: var(--app-text-deep);
}

.decision-actions__comment:disabled {
    background: var(--app-fill-faint);
    cursor: not-allowed;
}

.decision-actions__buttons {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
}

.decision-actions__escalate-toggle {
    background: none;
    border: none;
    color: var(--app-text-grey);
    font-size: 13px;
    text-decoration: underline;
    cursor: pointer;
    margin-left: auto;
}

.decision-actions__escalate {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
}
</style>

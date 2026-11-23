<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvStatusBadge } from '@mivend/ui-kit';
import { resendEmailConfirmation } from '../../api/counterpartyPortalAccess';
import { formatDateTime } from '../../i18n/format';
import { emailConfirmationIndicator, resendErrorKind } from '../../utils/emailConfirmation';

const props = defineProps<{
    customerId: string;
    pending: string | null;
    sentAt: string | null;
    canResend: boolean;
}>();
const emit = defineEmits<{ resent: [] }>();

const { t } = useI18n();
const indicator = computed(() => emailConfirmationIndicator(props.pending, props.sentAt));
const sending = ref(false);
const sent = ref(false);
const error = ref('');

async function resend(): Promise<void> {
    sending.value = true;
    sent.value = false;
    error.value = '';
    try {
        await resendEmailConfirmation(props.customerId);
        sent.value = true;
        emit('resent');
    } catch (e) {
        const kind = resendErrorKind(e instanceof Error ? e.message : '');
        error.value = t(`customers.portalUsers.emailPending.errors.${kind}`);
    } finally {
        sending.value = false;
    }
}
</script>

<template>
    <div v-if="indicator" class="portal-email-pending">
        <MvStatusBadge variant="warning">{{
            t('customers.portalUsers.emailPending.badge')
        }}</MvStatusBadge>
        <span class="portal-email-pending__detail">
            {{ indicator.address }}
            <template v-if="indicator.sentAt">
                ·
                {{
                    t('customers.portalUsers.emailPending.sentAt', {
                        at: formatDateTime(indicator.sentAt),
                    })
                }}
            </template>
        </span>
        <MvButton v-if="canResend" size="sm" variant="secondary" :loading="sending" @click="resend">
            {{ t('customers.portalUsers.emailPending.resend') }}
        </MvButton>
        <span v-if="sent" class="portal-email-pending__ok" role="status">{{
            t('customers.portalUsers.emailPending.resent')
        }}</span>
        <span v-if="error" class="portal-email-pending__error" role="alert">{{ error }}</span>
    </div>
</template>

<style scoped>
.portal-email-pending {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
    white-space: normal;
}

.portal-email-pending > * {
    max-width: 100%;
}

.portal-email-pending__detail {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
}

.portal-email-pending__ok {
    font-size: 12px;
    color: var(--el-color-success);
    overflow-wrap: anywhere;
}

.portal-email-pending__error {
    font-size: 12px;
    color: var(--el-color-danger);
    overflow-wrap: anywhere;
}
</style>

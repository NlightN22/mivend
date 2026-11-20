<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { useLegalStore } from '../stores/legal';
import LegalConsentChecks from './LegalConsentChecks.vue';

const emit = defineEmits<{ (e: 'done'): void; (e: 'left'): void }>();
const { t, locale } = useI18n();
const authStore = useAuthStore();
const legal = useLegalStore();

const pending = computed(() => legal.pending);
const checked = reactive<Record<string, boolean>>({});
const loading = ref(false);
const failed = ref(false);

const ready = computed(() => pending.value.filter(s => s.required).every(s => checked[s.kind]));

async function submit(): Promise<void> {
    loading.value = true;
    failed.value = false;
    try {
        await legal.accept(
            pending.value.map(s => ({
                kind: s.kind,
                version: s.version,
                accepted: !!checked[s.kind],
            })),
            locale.value,
        );
        emit('done');
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}

async function leave(): Promise<void> {
    await authStore.logout();
    legal.reset();
    emit('left');
}
</script>

<template>
    <div>
        <MvNotice v-if="failed" variant="error" class="legal-form__error">
            {{ t('legal.consent.failed') }}
        </MvNotice>
        <form class="legal-form" novalidate @submit.prevent="submit">
            <LegalConsentChecks
                :pending="pending"
                :checked="checked"
                @toggle="(kind, value) => (checked[kind] = value)"
            />
            <MvButton
                variant="primary"
                size="lg"
                :loading="loading"
                :disabled="!ready"
                class="legal-form__submit"
                native-type="submit"
                data-testid="legal-consent-submit"
            >
                {{ t('legal.consent.continue') }}
            </MvButton>
        </form>
        <button type="button" class="legal-form__leave" @click="leave">
            {{ t('legal.consent.leave') }}
        </button>
    </div>
</template>

<style scoped>
.legal-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
}

.legal-form__error {
    margin-bottom: 16px;
}

.legal-form__submit {
    width: 100%;
    min-height: 56px;
}

.legal-form__leave {
    display: block;
    margin: 14px auto 0;
    background: none;
    border: 0;
    color: var(--app-nav-accent);
    font-weight: 700;
    cursor: pointer;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvAuthShell, MvTwoFactorRecoveryForm, useTwoFactorRecovery } from '@mivend/ui-kit';
import { twoFactorRecoveryApi } from '../../api/twoFactor';
import { TWO_FACTOR_LABELS as labels } from './twoFactorLabels';

const route = useRoute();
const router = useRouter();

const token = typeof route.query.token === 'string' ? route.query.token : '';
void router.replace({ query: {} });
const referrerMeta = document.createElement('meta');
referrerMeta.name = 'referrer';
referrerMeta.content = 'no-referrer';
document.head.appendChild(referrerMeta);
onBeforeUnmount(() => referrerMeta.remove());

const recovery = useTwoFactorRecovery(token, twoFactorRecoveryApi);
const { view, error, loading } = recovery;

async function submit(password: string): Promise<void> {
    await recovery.submit(password);
    if (view.value === 'done') {
        await router.push({ path: '/login', query: { notice: 'two-factor-recovered' } });
    }
}
</script>

<template>
    <MvAuthShell>
        <MvTwoFactorRecoveryForm
            :invalid="view === 'invalid'"
            :error="error"
            :loading="loading"
            :labels="labels"
            @submit="submit"
            @to-sign-in="router.push('/login')"
        />
    </MvAuthShell>
</template>

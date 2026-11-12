<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter, useRoute } from 'vue-router';
import { readSiteIconUrl, readSiteName, MvLogo, MvButton, MvNotice } from '@mivend/ui-kit';
import { consumeOidcState } from '../../composables/oidcBinding';
import { completeOidcSignIn, openOidcSession } from '../../api/oidc';
import { useAuthStore } from '../../stores/auth';

const { t } = useI18n();
const siteName = readSiteName();
const siteIconUrl = readSiteIconUrl();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const failed = ref(false);
const code = String(route.query.code ?? '');
const state = String(route.query.state ?? '');

onMounted(async () => {
    // The one-time code is read once above; clearing the query keeps it out of the address bar and history.
    await router.replace({ query: {} });
    try {
        if (
            !code ||
            !state ||
            !consumeOidcState(state) ||
            !(await completeOidcSignIn(code, state))
        ) {
            failed.value = true;
        } else if (await openOidcSession(state)) {
            await authStore.completeSignIn();
            await router.replace('/');
        } else {
            failed.value = true;
        }
    } catch {
        failed.value = true;
    }
});
</script>

<template>
    <main class="oidc-page">
        <div class="oidc-wrap">
            <MvLogo :name="siteName" :icon-url="siteIconUrl" size="md" />
            <div class="oidc-card">
                <template v-if="failed">
                    <MvNotice variant="error">{{ t('auth.oidc.failed') }}</MvNotice>
                    <MvButton variant="primary" size="lg" @click="router.push('/login')">
                        {{ t('auth.oidc.backToLogin') }}
                    </MvButton>
                </template>
                <p v-else>{{ t('auth.oidc.checking') }}</p>
            </div>
        </div>
    </main>
</template>

<style scoped>
.oidc-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
}
.oidc-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}
.oidc-card {
    width: 340px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
</style>

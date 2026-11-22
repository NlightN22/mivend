import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { confirmEmailAddress } from '../../api/emailConfirmation';

export type ConfirmState = 'loading' | 'success' | 'invalid';

export function useConfirmEmail(): { state: Ref<ConfirmState> } {
    const route = useRoute();
    const router = useRouter();
    const token = typeof route.query.token === 'string' ? route.query.token : '';
    const state = ref<ConfirmState>(token ? 'loading' : 'invalid');
    // Keep the token in memory only: out of the address bar and history, and no Referer leak.
    void router.replace({ query: {} });
    const referrerMeta = document.createElement('meta');
    referrerMeta.name = 'referrer';
    referrerMeta.content = 'no-referrer';
    document.head.appendChild(referrerMeta);
    onBeforeUnmount(() => referrerMeta.remove());

    onMounted(async () => {
        if (!token) return;
        try {
            state.value = (await confirmEmailAddress(token)) ? 'success' : 'invalid';
        } catch {
            state.value = 'invalid';
        }
    });

    return { state };
}

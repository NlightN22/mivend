import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { shopErrorMessage } from '../../utils/shopErrorMessage';
import { canSubmit, isDeadLinkCode, isMismatch, isTooShort } from './passwordReset';

type ViewState = 'form' | 'success' | 'invalid';

export function useSetPassword(): {
    form: { password: string; confirm: string };
    state: Ref<ViewState>;
    error: Ref<string>;
    loading: Ref<boolean>;
    tooShort: ComputedRef<boolean>;
    mismatch: ComputedRef<boolean>;
    submittable: ComputedRef<boolean>;
    submit: () => Promise<void>;
} {
    const route = useRoute();
    const { t } = useI18n();
    const authStore = useAuthStore();
    const cartStore = useCartStore();

    const token = typeof route.query.token === 'string' ? route.query.token : '';
    const state = ref<ViewState>(token ? 'form' : 'invalid');
    const form = reactive({ password: '', confirm: '' });
    const error = ref('');
    const loading = ref(false);

    const tooShort = computed(() => isTooShort(form.password));
    const mismatch = computed(() => isMismatch(form.password, form.confirm));
    const submittable = computed(() => canSubmit(form.password, form.confirm));

    async function submit(): Promise<void> {
        if (!submittable.value || loading.value) return;
        loading.value = true;
        error.value = '';
        try {
            const errorCode = await authStore.resetPassword(token, form.password);
            if (!errorCode) {
                await cartStore.fetchCart();
                state.value = 'success';
            } else if (isDeadLinkCode(errorCode)) {
                state.value = 'invalid';
            } else {
                error.value = shopErrorMessage({ errorCode }, 'auth.setPassword.failed');
            }
        } catch {
            error.value = t('auth.setPassword.failed');
        } finally {
            loading.value = false;
        }
    }

    return { form, state, error, loading, tooShort, mismatch, submittable, submit };
}

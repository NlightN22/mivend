import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from '@mivend/ui-kit';
import { shopApi } from '../../api/client';
import { UpdateCustomerPasswordForSettingsDocument } from '../../api/generated/graphql';
import { shopErrorMessage } from '../../utils/shopErrorMessage';
import { passwordChangeErrorCode, passwordFormError, type PasswordForm } from './settingsForms';

export function usePasswordChange(onChanged: () => void): {
    form: Ref<PasswordForm>;
    error: Ref<string>;
    submitting: Ref<boolean>;
    submit: () => Promise<void>;
} {
    const { t } = useI18n();
    const form = ref<PasswordForm>({ current: '', next: '', confirm: '' });
    const error = ref('');
    const submitting = ref(false);

    async function submit(): Promise<void> {
        const invalid = passwordFormError(form.value);
        error.value = invalid ? t(invalid) : '';
        if (invalid) return;
        submitting.value = true;
        try {
            const result = await shopApi(UpdateCustomerPasswordForSettingsDocument, {
                currentPassword: form.value.current,
                newPassword: form.value.next,
            });
            const errorCode = passwordChangeErrorCode(result.updateCustomerPassword);
            if (errorCode) {
                error.value = shopErrorMessage({ errorCode }, 'settings.security.passwordFailed');
                return;
            }
            form.value = { current: '', next: '', confirm: '' };
            toast(t('settings.security.passwordChanged'), 'success');
            onChanged();
        } catch {
            error.value = t('settings.security.passwordFailed');
        } finally {
            submitting.value = false;
        }
    }

    return { form, error, submitting, submit };
}

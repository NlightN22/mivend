import { ref, type Ref } from 'vue';

import { captchaToken } from './signInRequest';

export interface CaptchaRequirement {
    required: boolean;
    siteKey: string | null;
    scriptUrl: string | null;
    widgetGlobal: string | null;
}

export interface SignInCaptcha {
    required: Ref<boolean>;
    siteKey: Ref<string>;
    scriptUrl: Ref<string>;
    widgetGlobal: Ref<string>;
    widgetKey: Ref<number>;
    onToken(token: string): void;
    refresh(login: string): Promise<void>;
    clear(): void;
}

// A token is single use, so every refresh drops it and remounts the widget.
export function useSignInCaptcha(
    fetchRequirement: (login: string) => Promise<CaptchaRequirement>,
): SignInCaptcha {
    const required = ref(false);
    const siteKey = ref('');
    const scriptUrl = ref('');
    const widgetGlobal = ref('');
    const widgetKey = ref(0);

    function clear(): void {
        captchaToken.value = '';
    }

    return {
        required,
        siteKey,
        scriptUrl,
        widgetGlobal,
        widgetKey,
        onToken: token => {
            captchaToken.value = token;
        },
        refresh: async login => {
            clear();
            try {
                const requirement = await fetchRequirement(login);
                required.value =
                    requirement.required && !!requirement.siteKey && !!requirement.scriptUrl;
                siteKey.value = requirement.siteKey ?? '';
                scriptUrl.value = requirement.scriptUrl ?? '';
                widgetGlobal.value = requirement.widgetGlobal ?? '';
            } catch {
                // best-effort: the server still decides, an unknown state must not block the form
                required.value = false;
            }
            widgetKey.value += 1;
        },
        clear,
    };
}

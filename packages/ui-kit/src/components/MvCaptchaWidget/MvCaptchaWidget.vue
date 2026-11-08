<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface TurnstileApi {
    render(
        el: HTMLElement,
        options: { sitekey: string; theme: string; callback: (token: string) => void },
    ): string;
    remove(widgetId: string): void;
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

const props = defineProps<{ siteKey: string }>();
const emit = defineEmits<{ token: [token: string] }>();
const host = ref<HTMLElement | null>(null);
let widgetId: string | null = null;

function turnstile(): TurnstileApi | undefined {
    return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

function loadScript(): Promise<void> {
    if (turnstile()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('CAPTCHA script blocked'));
        document.head.appendChild(script);
    });
}

onMounted(async () => {
    try {
        await loadScript();
        if (!host.value) return;
        widgetId =
            turnstile()?.render(host.value, {
                sitekey: props.siteKey,
                theme: 'auto',
                callback: token => emit('token', token),
            }) ?? null;
    } catch {
        // best-effort: a blocked script leaves the form usable, the server decides
    }
});

onBeforeUnmount(() => {
    if (widgetId) turnstile()?.remove(widgetId);
});
</script>

<template>
    <div ref="host" class="mv-captcha" />
</template>

<style scoped>
.mv-captcha {
    display: flex;
    justify-content: center;
    min-height: 0;
}
</style>

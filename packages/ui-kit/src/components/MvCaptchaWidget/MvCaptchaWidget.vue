<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface WidgetApi {
    render(
        el: HTMLElement,
        options: { sitekey: string; theme: string; callback: (token: string) => void },
    ): string;
    remove(widgetId: string): void;
}

const props = defineProps<{ siteKey: string; scriptUrl: string; widgetGlobal: string }>();
const emit = defineEmits<{ token: [token: string] }>();
const host = ref<HTMLElement | null>(null);
let widgetId: string | null = null;

function widget(): WidgetApi | undefined {
    return (window as unknown as Record<string, WidgetApi | undefined>)[props.widgetGlobal];
}

function loadScript(): Promise<void> {
    if (widget()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = props.scriptUrl;
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
            widget()?.render(host.value, {
                sitekey: props.siteKey,
                theme: 'auto',
                callback: token => emit('token', token),
            }) ?? null;
    } catch {
        // best-effort: a blocked script leaves the form usable, the server decides
    }
});

onBeforeUnmount(() => {
    if (widgetId) widget()?.remove(widgetId);
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

import { ref, type Ref } from 'vue';

const COPIED_MS = 1500;

export function useCopyToClipboard(): {
    copied: Ref<boolean>;
    copy: (text: string) => Promise<boolean>;
} {
    const copied = ref(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function copy(text: string): Promise<boolean> {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            console.error('[useCopyToClipboard]', e);
            return false;
        }
        copied.value = true;
        clearTimeout(timer);
        timer = setTimeout(() => (copied.value = false), COPIED_MS);
        return true;
    }

    return { copied, copy };
}

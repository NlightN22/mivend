import { ref, type Ref } from 'vue';

const COPIED_MS = 1500;

function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(area);
    }
}

export function useCopyToClipboard(): {
    copied: Ref<boolean>;
    failed: Ref<boolean>;
    copy: (text: string) => Promise<boolean>;
} {
    const copied = ref(false);
    const failed = ref(false);
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function copy(text: string): Promise<boolean> {
        let ok = false;
        try {
            await navigator.clipboard.writeText(text);
            ok = true;
        } catch {
            ok = legacyCopy(text);
        }
        copied.value = ok;
        failed.value = !ok;
        clearTimeout(timer);
        timer = setTimeout(() => {
            copied.value = false;
            failed.value = false;
        }, COPIED_MS);
        return ok;
    }

    return { copied, failed, copy };
}

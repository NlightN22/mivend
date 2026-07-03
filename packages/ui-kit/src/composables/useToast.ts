import { ref } from 'vue';
import type { NoticeVariant } from '../components/MvNotice/MvNotice.vue';

export interface ToastItem {
    id: string;
    message: string;
    variant: NoticeVariant;
}

const toasts = ref<ToastItem[]>([]);
let nextId = 0;

export function toast(message: string, variant: NoticeVariant = 'info', ttlMs = 4000): void {
    const id = String(nextId++);
    toasts.value.push({ id, message, variant });
    setTimeout(() => dismissToast(id), ttlMs);
}

export function dismissToast(id: string): void {
    toasts.value = toasts.value.filter(t => t.id !== id);
}

export function useToast(): {
    toasts: typeof toasts;
    toast: typeof toast;
    dismissToast: typeof dismissToast;
} {
    return { toasts, toast, dismissToast };
}

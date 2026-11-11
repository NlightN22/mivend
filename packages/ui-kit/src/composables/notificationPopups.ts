import { ref } from 'vue';
import type { NotificationKind } from './notificationTypes';

export interface PopupItem {
    id: string;
    title: string;
    message: string;
    kind: NotificationKind;
    // A kept popup flies into the bell when it goes away; a plain one just fades.
    persisted: boolean;
}

export const popups = ref<PopupItem[]>([]);
let nextId = 0;

export function dismissPopup(id: string): void {
    popups.value = popups.value.filter(p => p.id !== id);
}

export function showPopup(popup: Omit<PopupItem, 'id'>, ttlMs: number): void {
    const id = String(nextId++);
    popups.value.push({ id, ...popup });
    setTimeout(() => dismissPopup(id), ttlMs);
}

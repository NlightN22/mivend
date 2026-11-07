import { onBeforeUnmount, watch, type Ref } from 'vue';

let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

function lock(): void {
    if (locks++ > 0) return;
    const body = document.body;
    saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function unlock(): void {
    if (locks === 0 || --locks > 0) return;
    if (saved) {
        document.body.style.overflow = saved.overflow;
        document.body.style.paddingRight = saved.paddingRight;
    }
    saved = null;
}

export function useBodyScrollLock(active: Ref<boolean>): void {
    let held = false;
    watch(
        active,
        value => {
            if (value && !held) {
                lock();
                held = true;
            } else if (!value && held) {
                unlock();
                held = false;
            }
        },
        { immediate: true },
    );
    onBeforeUnmount(() => {
        if (held) unlock();
        held = false;
    });
}

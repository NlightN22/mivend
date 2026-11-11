<script setup lang="ts">
import MvNotificationPopup from './MvNotificationPopup.vue';
import { dismissPopup, popups } from '../../composables/notificationPopups';
import { flightVector } from '../../composables/notifyRules';

function visibleBell(): Element | null {
    const bells = Array.from(document.querySelectorAll('[data-notification-bell]'));
    return bells.find(b => b.getBoundingClientRect().width > 0) ?? null;
}

// A kept popup collapses toward the bell; a plain one, or reduced motion, keeps the default fade.
function onBeforeLeave(el: Element): void {
    const popup = el as HTMLElement;
    const bell = popup.dataset.persisted === 'true' ? visibleBell() : null;
    if (!bell || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const from = popup.getBoundingClientRect();
    const { x, y } = flightVector(from, bell.getBoundingClientRect());
    popup.style.setProperty('--fly-x', `${x}px`);
    popup.style.setProperty('--fly-y', `${y}px`);
    popup.style.width = `${from.width}px`;
    popup.classList.add('mv-popup--fly');
}
</script>

<template>
    <div class="mv-notification-popups">
        <TransitionGroup name="mv-popup" @before-leave="onBeforeLeave">
            <MvNotificationPopup
                v-for="p in popups"
                :key="p.id"
                :title="p.title"
                :message="p.message"
                :kind="p.kind"
                :persisted="p.persisted"
                @dismiss="dismissPopup(p.id)"
            />
        </TransitionGroup>
    </div>
</template>

<style scoped>
.mv-notification-popups {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: var(--mv-z-toast);
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

.mv-notification-popups :deep(.mv-notification-popup) {
    pointer-events: auto;
}

.mv-popup-move,
.mv-popup-enter-active,
.mv-popup-leave-active {
    transition:
        transform 0.2s ease,
        opacity 0.2s ease;
}

.mv-popup-enter-from,
.mv-popup-leave-to {
    opacity: 0;
    transform: translateX(24px);
}

.mv-popup-leave-active {
    position: absolute;
    right: 0;
}

.mv-popup-leave-active.mv-popup--fly {
    transition:
        transform 0.55s cubic-bezier(0.5, 0, 0.75, 0.4),
        opacity 0.55s ease-in;
}

.mv-popup-leave-to.mv-popup--fly {
    transform: translate(var(--fly-x), var(--fly-y)) scale(0.1);
}

@media (max-width: 640px) {
    .mv-notification-popups {
        top: 12px;
        left: 12px;
        right: 12px;
    }

    .mv-notification-popups :deep(.mv-notification-popup) {
        min-width: 0;
        max-width: none;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mv-popup-move,
    .mv-popup-enter-active,
    .mv-popup-leave-active {
        transition: opacity 0.2s ease;
    }

    .mv-popup-enter-from,
    .mv-popup-leave-to {
        transform: none;
    }
}
</style>

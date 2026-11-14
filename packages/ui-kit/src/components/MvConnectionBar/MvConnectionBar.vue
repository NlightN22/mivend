<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useUiLabels } from '../../utils/uiLabels';

// Past this, the message escalates and a manual relogin (full navigation to /login) appears.
const ESCALATE_AFTER_MS = 2 * 60 * 1000;

interface Props {
    since: number | null;
    // Server reachable but session dead: shown immediately with the relogin button, never auto-navigates.
    loggedOut?: boolean;
    reconnectingLabel?: string;
    unavailableLabel?: string;
    loggedOutLabel?: string;
    reloginLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
    loggedOut: false,
});
const emit = defineEmits<{ relogin: [] }>();
const label = useUiLabels();

const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    tickTimer = setInterval(() => {
        now.value = Date.now();
    }, 5000);
});
onBeforeUnmount(() => {
    if (tickTimer !== null) clearInterval(tickTimer);
});

const timedOut = computed(
    () => props.since !== null && now.value - props.since >= ESCALATE_AFTER_MS,
);
const escalated = computed(() => props.loggedOut || timedOut.value);

const message = computed(() => {
    if (props.loggedOut)
        return (
            props.loggedOutLabel ??
            label('connectionLoggedOut', 'Your session has ended — log in again when you’re ready.')
        );
    if (timedOut.value)
        return (
            props.unavailableLabel ??
            label('connectionUnavailable', 'Server unavailable for a while — try again later.')
        );
    return (
        props.reconnectingLabel ?? label('connectionReconnecting', 'Reconnecting to the server…')
    );
});
const relogin = computed(() => props.reloginLabel ?? label('connectionRelogin', 'Log in again'));
</script>

<template>
    <Transition name="mv-connection-bar-fade">
        <div class="mv-connection-bar" role="status" aria-live="polite">
            <div class="mv-connection-bar__track">
                <div
                    class="mv-connection-bar__stripe"
                    :class="{ 'mv-connection-bar__stripe--escalated': escalated }"
                />
            </div>
            <div
                class="mv-connection-bar__pill"
                :class="{ 'mv-connection-bar__pill--escalated': escalated }"
            >
                <span>{{ message }}</span>
                <button
                    v-if="escalated"
                    type="button"
                    class="mv-connection-bar__relogin"
                    @click="emit('relogin')"
                >
                    {{ relogin }}
                </button>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* Fixed to the viewport so it stays visible on scroll and never pushes page content down. */
.mv-connection-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--mv-z-connection-bar);
    display: flex;
    flex-direction: column;
    align-items: center;
}

.mv-connection-bar__track {
    width: 100%;
    height: 3px;
    overflow: hidden;
    background: var(--app-orange-glow);
    pointer-events: none;
}

.mv-connection-bar__stripe {
    height: 100%;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--app-accent-orange-hover), transparent);
    animation: mv-connection-bar-sweep 1.4s ease-in-out infinite;
}

.mv-connection-bar__stripe--escalated {
    background: linear-gradient(90deg, transparent, var(--app-danger-btn-hover), transparent);
}

.mv-connection-bar__pill {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 6px 14px;
    border-radius: 999px;
    background: var(--app-text-body2);
    color: var(--app-on-accent);
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 4px 12px var(--app-ink-14);
    pointer-events: auto;
}

.mv-connection-bar__pill--escalated {
    background: var(--app-danger-btn-active);
}

.mv-connection-bar__relogin {
    border: none;
    border-radius: 999px;
    padding: 4px 12px;
    background: var(--app-surface);
    color: var(--app-warn2-fg);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}

.mv-connection-bar__relogin:hover {
    filter: brightness(0.95);
}

@keyframes mv-connection-bar-sweep {
    0% {
        transform: translateX(-100%);
    }
    100% {
        transform: translateX(250%);
    }
}

.mv-connection-bar-fade-enter-active,
.mv-connection-bar-fade-leave-active {
    transition: opacity 0.2s ease;
}

.mv-connection-bar-fade-enter-from,
.mv-connection-bar-fade-leave-to {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .mv-connection-bar__stripe {
        animation: none;
    }
}
</style>

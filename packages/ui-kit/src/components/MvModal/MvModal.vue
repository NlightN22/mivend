<script setup lang="ts">
defineProps<{ title?: string }>();
defineEmits<{ close: [] }>();
</script>

<template>
    <Teleport to="body">
        <div class="mv-modal-overlay" @click.self="$emit('close')">
            <div class="mv-modal" role="dialog" aria-modal="true">
                <div class="mv-modal__head">
                    <span class="mv-modal__title">{{ title }}</span>
                    <button class="mv-modal__close" type="button" aria-label="Close" @click="$emit('close')">✕</button>
                </div>
                <div class="mv-modal__body">
                    <slot />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.mv-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(14, 28, 22, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
}

.mv-modal {
    background: #fff;
    border-radius: 24px;
    box-shadow: 0 24px 64px rgba(14, 28, 22, 0.18);
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.mv-modal__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 20px 16px;
    border-bottom: 1px solid #eef3f0;
    flex-shrink: 0;
}

.mv-modal__title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #14231f;
}

.mv-modal__close {
    border: 0;
    background: #f3f8f6;
    border-radius: 10px;
    width: 32px;
    height: 32px;
    font-size: 13px;
    cursor: pointer;
    color: #66736e;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.mv-modal__close:hover { background: #e6f0ec; color: #14231f; }

.mv-modal__body {
    overflow-y: auto;
    padding: 16px 20px 20px;
}
</style>

<script setup lang="ts">
import { useActingBanner } from '../composables/useActingBanner';

const { visible, label, finishing, finish } = useActingBanner();
</script>

<template>
    <MvNotice v-if="visible" variant="warning" class="acting-banner">
        <div class="acting-banner__row">
            <span>{{ label }}</span>
            <MvButton size="sm" :loading="finishing" @click="finish">{{
                $t('acting.finish')
            }}</MvButton>
        </div>
    </MvNotice>
</template>

<style scoped>
.acting-banner {
    border-radius: 0;
}

.acting-banner__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
</style>

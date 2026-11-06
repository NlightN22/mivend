<script setup lang="ts">
import { useActingEntry } from '../../composables/useActingEntry';

const { failed } = useActingEntry();
</script>

<template>
    <main class="acting-entry">
        <MvNotice v-if="failed" variant="error">
            <strong>{{ $t('acting.entryFailedTitle') }}</strong>
            <div>{{ $t('acting.entryFailedMessage') }}</div>
        </MvNotice>
        <p v-else class="acting-entry__loading">{{ $t('acting.entryLoading') }}</p>
    </main>
</template>

<style scoped>
.acting-entry {
    max-width: 480px;
    margin: 20vh auto 0;
    padding: 0 16px;
}

.acting-entry__loading {
    color: var(--app-nav-label);
    text-align: center;
}
</style>

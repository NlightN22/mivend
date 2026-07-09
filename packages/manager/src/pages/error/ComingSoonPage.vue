<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
    <div class="coming-soon">
        <h1>{{ route.meta.title ?? 'Coming soon' }}</h1>
        <p>This section of the manager portal is not built yet — it's on the roadmap.</p>
    </div>
</template>

<style scoped>
.coming-soon {
    padding: 40px 0;
    color: var(--el-text-color-secondary, #6b7280);
}

.coming-soon h1 {
    color: var(--el-text-color-primary, #17212b);
    font-size: 22px;
    margin: 0 0 8px;
}
</style>

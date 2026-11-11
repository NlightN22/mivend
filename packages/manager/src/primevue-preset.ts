import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

// Only primary color ramp and border radius are remapped; the rest keeps Aura defaults.
// Ties the PrimeVue table to tokens.css so it doesn't look foreign in the portal.
export const mivendPrimeVuePreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{emerald.50}',
            100: 'var(--el-color-primary-light-9)',
            200: 'var(--el-color-primary-light-8)',
            300: 'var(--el-color-primary-light-7)',
            400: 'var(--el-color-primary-light-5)',
            500: 'var(--el-color-primary)',
            600: 'var(--el-color-primary)',
            700: 'var(--el-color-primary-dark-2)',
            800: 'var(--el-color-primary-dark-2)',
            900: 'var(--el-color-primary-dark-2)',
            950: 'var(--el-color-primary-dark-2)',
        },
    },
});

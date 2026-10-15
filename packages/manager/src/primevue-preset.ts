import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

// Only primary color ramp and border radius are remapped; the rest keeps Aura defaults.
// Ties the PrimeVue table to tokens.css so it doesn't look foreign in the portal.
export const mivendPrimeVuePreset = definePreset(Aura, {
    semantic: {
        primary: {
            50: '{emerald.50}',
            100: '#F0FFFA',
            200: '#DDFBF4',
            300: '#C8F7EC',
            400: '#8AE8D4',
            500: '#00B894',
            600: '#00B894',
            700: '#008A70',
            800: '#008A70',
            900: '#006B57',
            950: '#004D3F',
        },
    },
});

import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';

// Maps PrimeVue's design tokens onto this project's own tokens.css values (--el-color-primary
// etc. — see packages/ui-kit/src/styles/tokens.css) so the PrimeVue-based OrdersDataTable reads
// as part of the same portal, not a visually foreign component dropped in. Only the primary
// color ramp and border radius are remapped — everything else keeps Aura's sensible defaults.
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

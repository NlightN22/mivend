import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import '@mivend/ui-kit/src/styles/tokens.css';

import {
    MvButton,
    MvStatusTag,
    MvAmountDisplay,
    MvSearchInput,
    MvTable,
    MvPageHeader,
    MvFormField,
    MvInput,
    MvPasswordInput,
    MvNotice,
    MvLogo,
    MvProductCard,
    MvProductRow,
    MvStockBadge,
    MvQtyStepper,
    MvCard,
    MvBreadcrumbs,
} from '@mivend/ui-kit';

import App from './App.vue';
import { router } from './router';
import ru from './i18n/ru';

const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    messages: { ru },
});

const app = createApp(App);

for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component);
}

app.component('MvButton', MvButton);
app.component('MvStatusTag', MvStatusTag);
app.component('MvAmountDisplay', MvAmountDisplay);
app.component('MvSearchInput', MvSearchInput);
app.component('MvTable', MvTable);
app.component('MvPageHeader', MvPageHeader);
app.component('MvFormField', MvFormField);
app.component('MvInput', MvInput);
app.component('MvPasswordInput', MvPasswordInput);
app.component('MvNotice', MvNotice);
app.component('MvLogo', MvLogo);
app.component('MvProductCard', MvProductCard);
app.component('MvProductRow', MvProductRow);
app.component('MvStockBadge', MvStockBadge);
app.component('MvQtyStepper', MvQtyStepper);
app.component('MvCard', MvCard);
app.component('MvBreadcrumbs', MvBreadcrumbs);

app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(ElementPlus);

app.mount('#app');

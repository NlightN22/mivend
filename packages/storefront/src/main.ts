import { createApp } from 'vue';
import { createPinia } from 'pinia';
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
    MvCatalogDropdown,
    layers,
    AMOUNT_FORMATTER,
} from '@mivend/ui-kit';

import App from './App.vue';
import { router } from './router';
import { i18n, initLocale } from './i18n';
import { formatAmount } from './i18n/format';

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
app.component('MvCatalogDropdown', MvCatalogDropdown);

app.provide(AMOUNT_FORMATTER, formatAmount);

app.use(createPinia());
app.use(router);
app.use(i18n);
app.use(ElementPlus, { zIndex: layers.popover });

void initLocale().finally(() => app.mount('#app'));

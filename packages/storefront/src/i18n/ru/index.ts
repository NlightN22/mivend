import account from './account';
import cart from './cart';
import catalog from './catalog';
import company from './company';
import checkout from './checkout';
import common from './common';
import finance from './finance';
import orders from './orders';

export default {
    ...common,
    ...catalog,
    ...cart,
    ...checkout,
    ...orders,
    ...account,
    ...company,
    ...finance,
};

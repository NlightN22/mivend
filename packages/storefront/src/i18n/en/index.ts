import account from './account';
import balance from './balance';
import cart from './cart';
import catalog from './catalog';
import documents from './documents';
import company from './company';
import checkout from './checkout';
import common from './common';
import finance from './finance';
import orders from './orders';
import requests from './requests';
import demo from './demo';

export default {
    ...common,
    ...catalog,
    ...cart,
    ...checkout,
    ...orders,
    ...account,
    ...company,
    ...finance,
    ...balance,
    ...documents,
    ...requests,
    ...demo,
};

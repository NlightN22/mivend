export default {
    terms: {
        title: 'Terms of supply',
        edition: 'Edition of {date}',
        intro: 'These terms do not replace the supply contract: anything not stated here is governed by the contract with the buyer and, where the contract is silent, by applicable law.',
        sections: {
            general: {
                title: 'General provisions',
                items: [
                    'These terms describe how orders placed through the portal are made and fulfilled. Orders are accepted only from registered buyers with a supply contract.',
                    'If these terms differ from the supply contract, the contract applies.',
                    'By placing an order, the buyer confirms that they act on behalf of their organization (or as a sole proprietor) and are authorized to do so. The buyer is responsible for all actions made under their account and does not share access credentials with third parties.',
                    'The terms may change. A new edition takes effect when published on the portal and applies to orders placed after that. The edition date is shown on this page.',
                ],
            },
            orders: {
                title: 'Orders, prices and availability',
                items: [
                    'An order in the portal is the buyer’s request for a supply under the contract. Each order gets a number that identifies it in the account and for the manager.',
                    'Prices and discounts are calculated under the buyer’s terms and fixed when the order is placed. The quantity, assortment and price of each batch are shown in the proforma invoice and the shipping documents.',
                    'Availability shown in the portal is for information. Goods are held for the buyer once they are reserved. If there is not enough stock, the supplier may ship a smaller quantity or offer a replacement only with the buyer’s consent.',
                    'The quantity in an order must be a multiple of the minimum shipping multiplicity shown on the product card.',
                    'If the content or total of an order changes after placement, a new version of the proforma invoice is issued; the previous one is kept and marked as superseded.',
                ],
            },
            payment: {
                title: 'Payment',
                items: [
                    'The available payment forms (proforma invoice with bank transfer, online card payment, cash) depend on the contract and the buyer’s settings. The payment term and deferred payment terms are set by the contract.',
                    'A proforma invoice is paid when the money reaches the supplier’s bank account. State the proforma invoice or order number in the payment purpose.',
                    'For card payments the payment goes through a payment service and card data is not passed to the supplier. The receipt is sent to the email or phone given before payment.',
                    'An order that exceeds the buyer’s credit limit waits for a manager’s confirmation. If the buyer explicitly acknowledged the excess at checkout and it is allowed, the order is accepted. A card payment covers the excess and the order is confirmed automatically.',
                    'A proforma invoice is a payment request, not an accounting document. The sale is recorded by the sales invoice that the supplier issues at shipment.',
                ],
            },
            reservation: {
                title: 'Reservation',
                items: [
                    'Goods are reserved when the order is placed, after the payment is confirmed, or after a manager confirms the order, depending on the payment form.',
                    'The reservation period is set by the buyer’s supply terms and shown in the order.',
                    'If payment does not arrive before the reservation ends, the reservation is released and the goods return to free stock. Paying after the release does not guarantee availability: the supplier either reserves the goods again or refunds the money.',
                ],
            },
            receiving: {
                title: 'Receiving goods',
                items: [
                    'Goods are handed over by pickup from the chosen branch or delivered to the trading point address given in the order. Delivery terms and cost are set by the contract with the buyer.',
                    'The buyer is notified when the order is ready.',
                    'On receipt the buyer or their authorized representative checks the quantity, assortment and quality of the goods and signs the shipping documents. The representative shows an identity document and a power of attorney.',
                    'Ownership and risk pass to the buyer as set by the contract.',
                ],
            },
            claims: {
                title: 'Claims and returns',
                items: [
                    'Claims about quantity and quality are made in writing, in the way and within the terms set by the contract.',
                    'Returns of goods and money are processed under the contract and recorded in the supplier’s accounting system. Money is returned the same way it was paid.',
                    'An order can be cancelled before shipment through a manager. The reservation is released and any prepayment is returned.',
                ],
            },
            documents: {
                title: 'Documents and notifications',
                items: [
                    'Documents for an order (proforma invoices, shipping documents) are exchanged as set by the contract, including electronically.',
                    'Order status notifications go to the account and to the contacts in the profile. The buyer keeps them up to date.',
                ],
            },
        },
    },
};

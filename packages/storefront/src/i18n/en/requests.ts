export default {
    requests: {
        title: 'Requests',
        subtitle: 'Questions about orders, returns, documents, payments, and customer service.',
        templates: 'Request templates',
        create: 'Create request',
        assignee: 'Assignee',
        notice: {
            title: 'A request can be linked to an order, document, or payment.',
            text: "This way the customer doesn't need to re-explain the context, and the manager can resolve it faster.",
        },
        status: {
            all: 'All requests',
            new: 'New',
            'in-progress': 'In progress',
            awaiting: 'Awaiting reply',
            resolved: 'Resolved',
            closed: 'Closed',
        },
        topics: {
            order: 'Order',
            payment: 'Payment',
            documents: 'Documents',
            return: 'Return',
            delivery: 'Delivery',
        },
        quickTopics: {
            order: 'Order question',
            payment: 'Payment',
            documents: 'Documents',
            return: 'Return',
        },
        assignees: {
            sales: 'Sales manager',
            accounting: 'Accounting',
            finance: 'Finance dept.',
            service: 'Service dept.',
        },
        actions: {
            open: 'Open',
            reply: 'Reply',
            order: 'Order',
            documents: 'Documents',
            payments: 'Payments',
            repeat: 'Repeat request',
        },
        toolbar: {
            searchPlaceholder: 'Search by request, order, document or message text',
            newest: 'Newest first',
            oldest: 'Oldest first',
            byStatus: 'By status',
            quick: 'Quick request',
            topic: 'Topic',
            message: 'Message',
            messagePlaceholder: 'Briefly describe your question',
            send: 'Send',
        },
        demo: {
            r1048: {
                title: 'One item missing from shipment',
                meta: 'Request #1048 · Order #348744 · created today at 15:12',
                preview:
                    'Order arrived with 11 of 12 items. Customer asks to check whether the item was excluded during picking or will be shipped separately.',
                author: 'Manager',
                time: '15:28',
                message:
                    "Checking with the warehouse. Preliminary info: item went into a separate reserve, we'll confirm after reconciliation.",
            },
            r1042: {
                title: 'Reconciliation report for June needed',
                meta: 'Request #1042 · Documents · created yesterday at 11:40',
                preview:
                    'Customer requested a reconciliation report for the main contract and all trading points for the current month.',
                author: 'Accounting',
                time: 'yesterday at 13:05',
                message:
                    'Report is being generated. After review it will appear in the Documents section and will be sent by email.',
            },
            r1037: {
                title: 'Partial payment for order',
                meta: 'Request #1037 · Order #348921 · created June 24',
                preview:
                    'Customer asked whether a partial advance payment is possible and how it would be allocated across orders.',
                author: 'Finance dept.',
                time: 'June 24 at 17:20',
                message:
                    'Payment accepted as advance. Allocation across orders will be handled internally.',
            },
            r1029: {
                title: 'Return request for antifreeze',
                meta: 'Request #1029 · Return · created June 21',
                preview: 'Return approved, documents generated, goods accepted at warehouse.',
                author: '',
                time: '',
                message: '',
            },
        },
    },
};

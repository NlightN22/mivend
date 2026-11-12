export default {
    page: { breadcrumb: 'Workspace', title: 'Notifications' },
    views: { all: 'All', unread: 'Unread', read: 'Read', resolved: 'Resolved' },
    status: { any: 'All statuses', unread: 'Unread', read: 'Read', resolved: 'Resolved' },
    columns: {
        title: 'Notification',
        createdAt: 'Date',
        status: 'Status',
        sourceType: 'Source',
        message: 'Message',
    },
    table: {
        titleFilter: 'Title contains…',
        searchPlaceholder: 'Search notifications…',
        empty: 'No notifications match your filters',
    },
    actions: {
        markRead: 'Mark read',
        resolve: 'Resolve',
        resolutionNote: 'Resolution note',
        confirm: 'OK',
    },
    errors: {
        markReadFailed: 'Could not mark notification as read',
        resolveFailed: 'Could not resolve notification',
    },
};

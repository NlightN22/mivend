import { useRef, useState } from 'react';
import { AnyRoute } from '@tanstack/react-router';
import { Button, ListPage } from '@vendure/dashboard';

import { notificationRetentionListDocument } from './notification-retention.graphql.js';
import { RetentionDialog, EditableRetentionRule } from './retention-dialog.js';
import { describeDays, describeType } from './retention-form.js';

export function NotificationRetentionPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});
    const [editing, setEditing] = useState<EditableRetentionRule | null>(null);

    return (
        <>
            <ListPage
                pageId="notification-retention-list"
                title="Notification retention"
                listQuery={notificationRetentionListDocument}
                route={route}
                onSearchTermChange={searchTerm =>
                    searchTerm ? { sourceType: { contains: searchTerm } } : {}
                }
                defaultSort={[{ id: 'sourceType', desc: false }]}
                defaultVisibility={{ sourceType: true, readDays: true, unreadDays: true }}
                defaultColumnOrder={['sourceType', 'readDays', 'unreadDays']}
                customizeColumns={{
                    sourceType: {
                        header: 'Source type',
                        cell: ({ row }) => (
                            <Button
                                variant="link"
                                className="h-auto p-0"
                                onClick={() => setEditing(row.original)}
                            >
                                {describeType(row.original.sourceType)}
                            </Button>
                        ),
                    },
                    readDays: {
                        header: 'Read or resolved',
                        cell: ({ row }) => describeDays(row.original.readDays),
                    },
                    unreadDays: {
                        header: 'Unread',
                        cell: ({ row }) => describeDays(row.original.unreadDays),
                    },
                }}
                registerRefresher={refresher => {
                    refreshRef.current = refresher;
                }}
            />
            <RetentionDialog
                editing={editing}
                onOpenChange={open => {
                    if (!open) setEditing(null);
                }}
                onSaved={() => refreshRef.current()}
            />
        </>
    );
}

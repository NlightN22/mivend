import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { Badge, Button, ListPage, PermissionGuard, api, graphql, toast } from '@vendure/dashboard';

import { CopyIdButton } from './copy-id-button.js';
import { statusBadge, summarizeReplay } from './issue-actions.js';

const inboxIssuesDocument = graphql(`
    query IntegrationInboxIssuesForDashboard($options: IntegrationInboxIssueListOptions) {
        integrationInboxIssues(options: $options) {
            items {
                id
                stream
                entityId
                status
                attempts
                firstFailedAt
                lastError
                updatedAt
                outcome
                outcomeReason
                replayable
                dismissable
            }
            totalItems
        }
    }
`);

const replayDocument = graphql(`
    mutation ReplayFailedIntegrationInboxFromDashboard($ids: [ID!]!) {
        replayFailedIntegrationInbox(ids: $ids) {
            id
            outcome
            message
        }
    }
`);

const dismissDocument = graphql(`
    mutation DismissFailedIntegrationInboxFromDashboard($id: ID!, $reason: String!) {
        dismissFailedIntegrationInbox(id: $id, reason: $reason)
    }
`);

export function InboxIssuesPage({ route }: Readonly<{ route: AnyRoute }>) {
    const refreshRef = useRef<() => void>(() => {});

    async function replay(id: string): Promise<void> {
        try {
            const data = await api.mutate(replayDocument, { ids: [id] });
            const summary = summarizeReplay(data.replayFailedIntegrationInbox);
            if (summary.ok) toast.success(summary.message);
            else toast.error(summary.message);
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not request replay');
        }
    }

    async function dismiss(id: string): Promise<void> {
        const reason = window.prompt('Reason for dismissing this inbox row:');
        if (!reason || !reason.trim()) return;
        try {
            await api.mutate(dismissDocument, { id, reason });
            toast.success('Row dismissed.');
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not dismiss the row');
        }
    }

    return (
        <ListPage
            pageId="integration-inbox-issues-list"
            title="Integration inbox issues"
            listQuery={inboxIssuesDocument}
            route={route}
            onSearchTermChange={term =>
                term ? { entityId: { contains: term }, lastError: { contains: term } } : {}
            }
            transformVariables={variables => ({
                options: { ...variables.options, filterOperator: 'OR' },
            })}
            defaultSort={[{ id: 'updatedAt', desc: true }]}
            defaultVisibility={{
                stream: true,
                entityId: true,
                status: true,
                attempts: true,
                firstFailedAt: true,
                lastError: true,
                outcomeReason: true,
                updatedAt: true,
                actions: true,
            }}
            defaultColumnOrder={[
                'stream',
                'entityId',
                'status',
                'attempts',
                'lastError',
                'outcomeReason',
                'firstFailedAt',
                'updatedAt',
                'actions',
            ]}
            facetedFilters={{
                status: {
                    title: 'Status',
                    options: [
                        { label: 'failed', value: 'failed' },
                        { label: 'replay requested', value: 'replay_requested' },
                    ],
                },
            }}
            customizeColumns={{
                status: {
                    cell: ({ row }) => (
                        <Badge variant={statusBadge(row.original).variant}>
                            {statusBadge(row.original).label}
                        </Badge>
                    ),
                },
                entityId: {
                    cell: ({ row }) => (
                        <span className="flex items-center gap-1 font-mono text-xs">
                            {row.original.entityId}
                            <CopyIdButton value={row.original.entityId} />
                        </span>
                    ),
                },
                lastError: {
                    cell: ({ row }) => (
                        <span className="block max-w-96 whitespace-normal break-words text-destructive">
                            {row.original.lastError ?? ''}
                        </span>
                    ),
                },
            }}
            additionalColumns={{
                actions: {
                    meta: { dependencies: ['id', 'replayable', 'dismissable'] },
                    header: 'Actions',
                    cell: ({ row }) => (
                        <PermissionGuard requires={['RecoverIntegrationEvents']}>
                            <div className="flex items-center gap-1">
                                {row.original.replayable ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void replay(row.original.id)}
                                    >
                                        Replay
                                    </Button>
                                ) : null}
                                {row.original.dismissable ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void dismiss(row.original.id)}
                                    >
                                        Dismiss
                                    </Button>
                                ) : null}
                            </div>
                        </PermissionGuard>
                    ),
                },
            }}
            registerRefresher={refresher => {
                refreshRef.current = refresher;
            }}
            includeSelectionColumn={false}
        />
    );
}

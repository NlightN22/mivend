import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { Badge, Button, ListPage, PermissionGuard, api, graphql, toast } from '@vendure/dashboard';

import { CopyIdButton } from './copy-id-button.js';
import { summarizeReplay } from './issue-actions.js';

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

    return (
        <ListPage
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
            customizeColumns={{
                status: {
                    cell: ({ row }) => (
                        <Badge
                            variant={row.original.status === 'failed' ? 'destructive' : 'secondary'}
                        >
                            {row.original.status === 'failed'
                                ? 'failed'
                                : (row.original.outcome ?? row.original.status)}
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
                    meta: { dependencies: ['id', 'replayable'] },
                    header: 'Actions',
                    cell: ({ row }) =>
                        row.original.replayable ? (
                            <PermissionGuard requires={['RecoverIntegrationEvents']}>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void replay(row.original.id)}
                                >
                                    Replay
                                </Button>
                            </PermissionGuard>
                        ) : null,
                },
            }}
            registerRefresher={refresher => {
                refreshRef.current = refresher;
            }}
            includeSelectionColumn={false}
        />
    );
}

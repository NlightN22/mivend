import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { Badge, Button, ListPage, PermissionGuard, api, graphql, toast } from '@vendure/dashboard';

import { CopyIdButton } from './copy-id-button.js';
import { summarizeRebuild, summarizeRequeue } from './issue-actions.js';

const outboundProblemsDocument = graphql(`
    query IntegrationOutboxProblemsForDashboard($options: IntegrationOutboxProblemListOptions) {
        integrationOutboxProblems(options: $options) {
            items {
                id
                eventId
                eventType
                status
                retryCount
                lastError
                lastErrorAt
                createdAt
                subjectId
            }
            totalItems
        }
    }
`);

const requeueDocument = graphql(`
    mutation RequeueFailedIntegrationOutboxFromDashboard($ids: [ID!]!) {
        requeueFailedIntegrationOutbox(ids: $ids)
    }
`);

const rebuildDocument = graphql(`
    mutation RebuildSkippedIntegrationOutboxFromDashboard($id: ID!) {
        rebuildSkippedIntegrationOutbox(id: $id)
    }
`);

export function OutboundProblemsPage({ route }: Readonly<{ route: AnyRoute }>) {
    const refreshRef = useRef<() => void>(() => {});

    async function run(action: () => Promise<{ ok: boolean; message: string }>): Promise<void> {
        try {
            const summary = await action();
            if (summary.ok) toast.success(summary.message);
            else toast.error(summary.message);
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'The action failed');
        }
    }

    return (
        <ListPage
            title="Integration outbound problems"
            listQuery={outboundProblemsDocument}
            route={route}
            onSearchTermChange={term =>
                term ? { eventId: { contains: term }, lastError: { contains: term } } : {}
            }
            transformVariables={variables => ({
                options: { ...variables.options, filterOperator: 'OR' },
            })}
            defaultSort={[{ id: 'createdAt', desc: true }]}
            defaultVisibility={{
                eventType: true,
                subjectId: true,
                status: true,
                retryCount: true,
                lastError: true,
                lastErrorAt: true,
                createdAt: true,
                eventId: false,
                actions: true,
            }}
            defaultColumnOrder={[
                'eventType',
                'subjectId',
                'status',
                'retryCount',
                'lastError',
                'lastErrorAt',
                'createdAt',
                'eventId',
                'actions',
            ]}
            customizeColumns={{
                status: {
                    cell: ({ row }) => (
                        <Badge
                            variant={row.original.status === 'failed' ? 'destructive' : 'secondary'}
                        >
                            {row.original.status}
                        </Badge>
                    ),
                },
                subjectId: {
                    cell: ({ row }) =>
                        row.original.subjectId ? (
                            <span className="flex items-center gap-1 font-mono text-xs">
                                {row.original.subjectId}
                                <CopyIdButton value={row.original.subjectId} />
                            </span>
                        ) : null,
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
                    meta: { dependencies: ['id', 'status'] },
                    header: 'Actions',
                    cell: ({ row }) => (
                        <PermissionGuard requires={['RecoverIntegrationEvents']}>
                            {row.original.status === 'failed' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        void run(async () =>
                                            summarizeRequeue(
                                                (
                                                    await api.mutate(requeueDocument, {
                                                        ids: [row.original.id],
                                                    })
                                                ).requeueFailedIntegrationOutbox,
                                            ),
                                        )
                                    }
                                >
                                    Requeue
                                </Button>
                            )}
                            {row.original.status === 'skipped' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        void run(async () =>
                                            summarizeRebuild(
                                                (
                                                    await api.mutate(rebuildDocument, {
                                                        id: row.original.id,
                                                    })
                                                ).rebuildSkippedIntegrationOutbox,
                                            ),
                                        )
                                    }
                                >
                                    Rebuild
                                </Button>
                            )}
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

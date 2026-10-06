import { AnyRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { api, Badge, Button, graphql, ListPage, toast } from '@vendure/dashboard';

const problemPhotosDocument = graphql(`
    query ProblemProductPhotosForDashboard($options: ProductPhotoListOptions) {
        problemProductPhotos(options: $options) {
            items {
                id
                updatedAt
                externalId
                productExternalId
                position
                status
                lastError
                replayAttempts
                lastReplayAt
            }
            totalItems
        }
    }
`);

const replayDocument = graphql(`
    mutation ReplayProductPhotoFromDashboard($id: ID!) {
        replayProductPhoto(id: $id) {
            id
            status
        }
    }
`);

export function ProductPhotosPage({ route }: { route: AnyRoute }) {
    const refreshRef = useRef<() => void>(() => {});

    async function handleReplay(id: string): Promise<void> {
        try {
            await api.mutate(replayDocument, { id });
            toast.success('Replay requested; the photo will be re-downloaded shortly.');
            refreshRef.current();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not request replay');
        }
    }

    return (
        <ListPage
            pageId="product-photos-list"
            title="Product photos"
            listQuery={problemPhotosDocument}
            route={route}
            onSearchTermChange={searchTerm =>
                searchTerm
                    ? {
                          externalId: { contains: searchTerm },
                          productExternalId: { contains: searchTerm },
                      }
                    : {}
            }
            transformVariables={variables => ({
                options: { ...variables.options, filterOperator: 'OR' },
            })}
            defaultSort={[{ id: 'updatedAt', desc: true }]}
            defaultVisibility={{
                externalId: true,
                productExternalId: true,
                status: true,
                replayAttempts: true,
                lastError: true,
                updatedAt: true,
                actions: true,
            }}
            defaultColumnOrder={[
                'status',
                'productExternalId',
                'externalId',
                'lastError',
                'replayAttempts',
                'updatedAt',
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
            }}
            additionalColumns={{
                actions: {
                    meta: { dependencies: ['id'] },
                    header: 'Actions',
                    cell: ({ row }) => (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleReplay(row.original.id)}
                        >
                            Replay
                        </Button>
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

import { RefreshCw } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@vendure/dashboard';

export function RefreshIconButton({
    loading,
    onRefresh,
}: Readonly<{ loading: boolean; onRefresh: () => void }>) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={loading}
                        onClick={onRefresh}
                    />
                }
            >
                <RefreshCw className={loading ? 'animate-rotate' : ''} />
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
    );
}

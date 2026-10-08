import { Copy } from 'lucide-react';
import { Button, toast } from '@vendure/dashboard';

export function CopyIdButton({ value }: Readonly<{ value: string }>) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="Copy"
            onClick={() => {
                navigator.clipboard
                    .writeText(value)
                    .then(() => toast.success('Copied'))
                    .catch(() => toast.error('Could not copy'));
            }}
        >
            <Copy />
        </Button>
    );
}

import { Badge } from '@vendure/dashboard';

export function CountLink({
    count,
    href,
    destructive = false,
}: Readonly<{ count: number; href: string; destructive?: boolean }>) {
    if (count === 0) return <>0</>;
    return (
        <a href={href} title="Show these rows">
            <Badge variant={destructive ? 'destructive' : 'secondary'}>{count}</Badge>
        </a>
    );
}

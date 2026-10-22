// A private vhost keeps the test server's sync queues away from every running contour's queues.
interface RabbitTarget {
    amqpUrl: string;
    managementUrl: string;
    authorization: string;
}

function target(vhost: string): RabbitTarget {
    const base = new URL(process.env.RABBITMQ_URL ?? 'amqp://mivend:mivend@localhost:5672');
    const user = decodeURIComponent(base.username);
    const password = decodeURIComponent(base.password);
    const managementPort = process.env.RABBITMQ_MANAGEMENT_PORT ?? '15672';
    return {
        amqpUrl: `amqp://${base.username}:${base.password}@${base.host}/${encodeURIComponent(vhost)}`,
        managementUrl: `http://${base.hostname}:${managementPort}/api`,
        authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
    };
}

async function call(
    rabbit: RabbitTarget,
    method: string,
    path: string,
    body?: unknown,
): Promise<void> {
    const response = await fetch(`${rabbit.managementUrl}${path}`, {
        method,
        headers: { authorization: rabbit.authorization, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok && response.status !== 404)
        throw new Error(`RabbitMQ management ${method} ${path}: ${response.status}`);
}

export async function createVhost(vhost: string): Promise<string> {
    const rabbit = target(vhost);
    const user = decodeURIComponent(new URL(rabbit.amqpUrl).username);
    await call(rabbit, 'PUT', `/vhosts/${encodeURIComponent(vhost)}`);
    await call(
        rabbit,
        'PUT',
        `/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(user)}`,
        {
            configure: '.*',
            write: '.*',
            read: '.*',
        },
    );
    return rabbit.amqpUrl;
}

export async function deleteVhost(vhost: string): Promise<void> {
    await call(target(vhost), 'DELETE', `/vhosts/${encodeURIComponent(vhost)}`);
}

export async function listVhosts(): Promise<string[]> {
    const rabbit = target('/');
    const response = await fetch(`${rabbit.managementUrl}/vhosts`, {
        headers: { authorization: rabbit.authorization },
    });
    if (!response.ok) throw new Error(`RabbitMQ management GET /vhosts: ${response.status}`);
    return ((await response.json()) as { name: string }[]).map(v => v.name);
}

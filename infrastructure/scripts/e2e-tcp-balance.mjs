// Forwards each TCP connection to one backend port on localhost, picked by the "e2e-inst=<n>" token in the first
// request's User-Agent (n modulo the backend count; untagged goes to the first). Usage: node e2e-tcp-balance.mjs <listen> <backend>...
import { connect, createServer } from 'node:net';

const [listenPort, ...backends] = process.argv.slice(2).map(Number);

function pickBackend(head) {
    const tag = /e2e-inst=(\d+)/.exec(head);
    return backends[(tag ? Number(tag[1]) : 0) % backends.length];
}

createServer(client => {
    let buffered = Buffer.alloc(0);
    const close = upstream => {
        client.destroy();
        upstream?.destroy();
    };
    client.on('error', () => close());
    client.on('data', function onFirst(chunk) {
        buffered = Buffer.concat([buffered, chunk]);
        const head = buffered.toString('latin1');
        if (!head.includes('\r\n\r\n') && buffered.length < 16384) return;
        client.pause();
        client.off('data', onFirst);
        const upstream = connect(pickBackend(head), '127.0.0.1', () => {
            upstream.write(buffered);
            client.pipe(upstream);
            upstream.pipe(client);
            client.resume();
        });
        upstream.on('error', () => close(upstream));
        upstream.on('close', () => close(upstream));
        client.on('close', () => close(upstream));
    });
}).listen(listenPort, '0.0.0.0');

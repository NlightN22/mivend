# Request to system administrators: server for the first production deployment

DRAFT: sizing rests on an empty-catalog measurement plus configured limits (`docs/deployment-sizing.md`); confirm after a run with realistic data.

We need one virtual server to run a containerised web application (Docker Compose, about 10
containers).

**Resources (provisional):** 4 vCPU, 8 GB RAM (12 GB if search runs on the same host), 100 GB SSD,
1 Gbit network.

**Software:** a current LTS Linux, Docker Engine 25+ with the Compose plugin v2.

**Network:**
- inbound 443/tcp from the internet through a TLS-terminating entry point (reverse proxy or
  load balancer) to three internal web endpoints (customer portal, manager portal, staff
  dashboard); the application ports themselves stay on loopback;
- three DNS names for those portals, with certificates;
- outbound access to the message broker and schema registry of the integration service (hosts and
  ports will be sent separately) and to the container registry;
- SSH for the deployment engineers from a fixed address range.

**Backups:** a target for nightly database dumps and a weekly copy of two data volumes (about the
size of the data plus 20%), retention 14 days; a restore test once after setup.

**Monitoring:** host CPU/RAM/disk alerts, disk above 80%, and a check of the portal URLs.

**Logs:** container logs rotate on the host (10 MB x 5 per container); forward them to your log
system if you have one.

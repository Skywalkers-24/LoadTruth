# Running the app locally (LoadTruth)

The app always runs through Docker Compose on the standard ports. Do not start
servers outside Docker.

## Rules

- Frontend: http://localhost:3000. Backend: http://localhost:8000. Both come
  from `docker compose` (see `docker-compose.yml`).
- Never run `next dev`, `npm run dev`, or a local `uvicorn` for viewing or
  verifying changes, and never use an alternate port such as 3001.
- To see code changes, rebuild only the service you changed:
  - `docker compose up -d --build frontend`
  - `docker compose up -d --build backend`
  - Or `make up` to rebuild and start everything, `make down` to stop.
- Builds are slow. Start them in the background with the output in a
  `scratch/*.log` file (see the shell-commands rule) and poll the log.
- Point screenshot and measurement scripts (`scratch/shots/*.mjs`) at
  http://localhost:3000.
- Tests and linters (`make check`, `make test`) still run on the host; only the
  running app lives in Docker.

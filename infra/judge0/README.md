# Local Judge0 for PrepWise demos

This runs Judge0 CE **v1.13.1** (the code execution sandbox) on your own machine so PrepWise can run student code
without a paid service. Nothing here has been run by the PrepWise authors on a real host; treat it as a tested-by-reading
starting point and confirm with the smoke test below.

## Read this first: it needs cgroup v1

Judge0 1.13.1 uses the `isolate` sandbox, which needs **cgroup v1**.

- **Ubuntu 22.04 (or similar) works** once cgroup v1 is enabled. Edit `/etc/default/grub`, add
  `systemd.unified_cgroup_hierarchy=0` to `GRUB_CMDLINE_LINUX`, run `sudo update-grub`, reboot.
- **Docker Desktop on Windows (WSL2) and recent macOS Docker may not work.** Those use cgroup v2 and Judge0 1.13.1 then
  fails with isolate errors. Some people get it working by forcing cgroup v1 for WSL2 (`.wslconfig` kernel command line
  `cgroup_no_v1=` / `systemd.unified_cgroup_hierarchy=0`), but this is not guaranteed. If it does not work for you, use a
  hosted option below or a small Linux VM.
- The containers run `privileged`. Run this on a throwaway or demo machine, never on a server that holds anything else.

## Run it

```bash
cd infra/judge0
cp .env.example .env        # then edit .env: set POSTGRES_PASSWORD and REDIS_PASSWORD to long random strings
docker compose up -d
docker compose logs -f server   # wait for "Listening on tcp://0.0.0.0:2358"
```

The API is published on `127.0.0.1:2358` only. Other machines cannot reach it. `ALLOW_ENABLE_NETWORK=false` and
`ENABLE_NETWORK=false` mean submitted code has no network access.

Smoke test (should print `hello`):

```bash
curl -s -X POST "http://127.0.0.1:2358/submissions?base64_encoded=false&wait=true" \
  -H "Content-Type: application/json" \
  -d '{"language_id":63,"source_code":"console.log(\"hello\")"}'
```

Then point PrepWise at it in `server/.env`:

```
EXECUTION_PROVIDER=judge0
JUDGE0_URL=http://127.0.0.1:2358
```

Check it from PrepWise with `npm run validate:seed -- --only digit-sum` (run inside `server/`).

Stop with `docker compose down` (add `-v` to delete the database volume).

## Hosted alternatives (no cgroup problems)

Set `EXECUTION_PROVIDER=judge0` and:

| Service | `JUDGE0_URL` | Extra variables |
|---|---|---|
| Judge0 on RapidAPI | `https://judge0-ce.p.rapidapi.com` | `JUDGE0_API_KEY=<your RapidAPI key>`, `JUDGE0_API_HOST=judge0-ce.p.rapidapi.com` |
| judge0.com hosted (paid plans) | the URL shown in your Judge0 dashboard | `JUDGE0_API_KEY=<your auth token>` (leave `JUDGE0_API_HOST` empty; it is sent as `X-Auth-Token`) |
| Self-hosted CE elsewhere | `https://your-host:2358` | `JUDGE0_API_KEY` only if you put an auth header in front |

Hosted services may number their languages differently from CE 1.13.1. If a language fails, set `JUDGE0_LANGUAGE_IDS`
to a JSON object, for example `{"python":92,"javascript":93}`, using the ids from `GET <JUDGE0_URL>/languages`.

Backup provider: `EXECUTION_PROVIDER=jdoodle` with `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET`. JDoodle returns only
combined output, so PrepWise infers verdicts from the text; prefer Judge0.

If the provider is unreachable PrepWise reports "execution unavailable" and records no score. It never invents output.

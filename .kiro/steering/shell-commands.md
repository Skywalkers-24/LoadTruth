---
inclusion: always
---

# Running shell commands in this workspace

The inline/foreground shell in this environment frequently hangs until timeout
on pipes, slow commands, dev servers, or curl calls. Do NOT wait on the
foreground shell for real work.

## Default workflow: background job + log file

1. Write the commands into a small script under `scratch/` that redirects all
   output to a log and prints a sentinel when done:
   ```sh
   # scratch/task.sh
   { your commands here; } > scratch/task.log 2>&1
   echo "DONE $?" >> scratch/task.log
   ```
2. Start it with the background-process tool (`control_bash_process`, action
   `start`) and return immediately.
3. Read results with the file-read tool on `scratch/task.log`. A `DONE <code>`
   line means it finished.
4. Use a unique command string per run (the tool reuses a process for the same
   command + cwd); add an argument like `run2` to force a fresh run.
5. Poll the log periodically; never `sleep` in the foreground shell.

## Long-lived servers

- Start `uvicorn`, `npm run dev`, watchers, etc. with `control_bash_process`
  (action `start`), redirecting output to a `scratch/*.log` file, and read that
  log instead of blocking.
- Stop them with `control_bash_process` (action `stop`) and the terminalId.

## Inline shell: only trivial, instant commands

If the foreground shell must be used, keep it to a single fast command, append
`< /dev/null`, avoid pipes into pagers, and do not chain long work.

## Housekeeping

- Keep throwaway scripts/logs in `scratch/` and remove them when done.

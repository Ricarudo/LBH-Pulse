# Sandbox Command Guidelines

Codex should prefer commands that keep output and traversal bounded, especially on Windows PowerShell where broad recursive directory commands can walk into large generated folders.

## Current Sandbox Observation

On 2026-05-11, the Codex sandbox runner repeatedly failed before command output with:

```text
windows sandbox: timed out after 15000ms connecting runner pipe-in
```

The failing sandbox commands included simple non-piped probes:

```text
pwd
Get-Location
Get-Date
rg --version
```

Because these commands do not traverse the repository, wait for stdin, or use shell pipes, the likely cause is the Windows sandbox runner failing during process/pipe startup rather than a specific slow search command.

## Safer Search Patterns

Use `rg` with an explicit target directory and generated-folder exclusions:

```text
rg "dropdown|select|form-control|input" apps/web/src -n --glob '!node_modules' --glob '!dist' --glob '!build' --glob '!.angular' --glob '!coverage' --glob '!.next'
```

Prefer direct file reads over command pipelines:

```text
Get-Content apps\web\src\app\globals.css
$lines = Get-Content apps\web\src\app\globals.css; $lines[2248..2268]
```

Avoid broad recursive commands over the repo root unless generated folders are excluded. In this repo, `apps/web/node_modules`, `apps/web/.next`, `backend/node_modules`, and `gui/node_modules` dominate local size.

Avoid fragile pipe-shortening patterns such as:

```text
grep ... | head
cat ... | grep
find ... | xargs ...
rg ... | head
```

Use `rg` path filters, `--glob` exclusions, or PowerShell object filters instead.

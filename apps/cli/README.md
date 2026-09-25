# aura — AURA developer CLI

The developer's terminal interface to AURA: Tasks, their git worktrees, the Coding Council,
gate decisions, and commits/pushes as yourself. A thin client of `apps/api` via
`@aura/client` - it has no privilege the web app doesn't.

```bash
make cli                 # from the repo root: build + `pnpm link --global`
aura login               # paste a token from the web app: Profile → Access tokens
aura --help
```

Inside the web terminal (Project Files) `aura` is already signed in - no login.

| Command | Does |
|---|---|
| `aura tasks --epic KAN-36` | the Epic's Tasks and status |
| `aura open [TASK] [--code\|--path]` | the Task's worktree - print it, `cd "$(aura open KAN-45 --path)"`, or open in VS Code |
| `aura code [TASK] [--epic E] [-p council\|mastra] [-n note]` | draft the coding run → Gate 5 (offers to decide it right there) |
| `aura approve [ID]` · `aura reject [ID] -r "why"` · `aura revise "feedback"` | decide the pending gate; an approved council run streams its discussion live |
| `aura say "text"` | a note for the Coding Council's next round |
| `aura status [TASK]` | gates waiting on you, today's model usage |
| `aura diff [--stat] [--uncommitted]` | what the Task changed since it branched |
| `aura commit [-m msg] [--no-squash]` | one commit **authored by you**, council checkpoints folded in, `AURA-Task`/`AURA-Run` trailers |
| `aura push [--pr]` | push `feature/<TASK>` with your own credentials; `--pr` opens a PR with `gh` |
| `aura whoami` · `aura logout` | |

Inside a Task worktree the Task key comes from the `feature/<TASK>` branch, so most commands
need no argument. `AURA_TOKEN` / `AURA_API_URL` override the stored login (CI, scripts).
Config: `~/.config/aura/config.json` (mode 0600).

Develop: `pnpm --filter aura-cli dev -- <args>` runs from source; `pnpm --filter aura-cli build`.

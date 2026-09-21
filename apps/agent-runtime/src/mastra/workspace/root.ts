// The single shared workspace root, one Epic per top-level folder, so there is one place to
// look for everything AURA has produced about an Epic instead of three separate roots:
// <root>/<epicKey>/architecture/  - Architect's design docs (Mastra Workspace)
// <root>/<epicKey>/dev/<discipline>/ - Dev/Coding agents' real scaffolded app (plain host path)
// <root>/<epicKey>/qa/            - QA's test plan + Playwright source (Mastra Workspace)
// Architecture and QA still use Mastra's Workspace/LocalFilesystem wrapper (containment + the
// HTTP viewer API); Dev stays a plain path since Docker needs to bind-mount it directly - this
// only unifies where they live on disk, not how each is written to.
export const AURA_WORKSPACE_ROOT = process.env.AURA_WORKSPACE_ROOT || '.workspaces';

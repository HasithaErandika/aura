import { useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { auditApi } from "./api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Field, Input, Select } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { SkeletonRows } from "../../shared/ui/Skeleton.tsx";
import { Table, TBody, TD, TH, THead, TR } from "../../shared/ui/Table.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { AuditIcon } from "../../shared/icons/index.tsx";
import { formatDateTime } from "../../shared/lib/format.ts";
import { roleLabel } from "../../shared/lib/roles.ts";
import type { AuditEntry } from "../../types/api.ts";

const ENTITY_TYPES = ["", "workflow_run", "approval_request", "thread", "user"];

function MetadataCell({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  if (!entry.metadata || Object.keys(entry.metadata).length === 0) return <span className="text-ink-400">none</span>;
  return (
    <button type="button" onClick={() => setOpen((v) => !v)} className="text-left text-xs text-ink-600 hover:text-ink-900">
      {open ? <pre className="font-mono whitespace-pre-wrap">{JSON.stringify(entry.metadata, null, 2)}</pre> : `${Object.keys(entry.metadata).length} fields`}
    </button>
  );
}

export function AuditPage() {
  const [filters, setFilters] = useState({ action: "", entityType: "", entityId: "" });
  const [applied, setApplied] = useState(filters);
  const [pages, setPages] = useState<AuditEntry[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const state = useAsync(async () => {
    const result = await auditApi.list({ ...applied, before: cursor ?? undefined });
    setPages((prev) => (cursor ? [...prev, result.entries] : [result.entries]));
    return result;
  }, [applied, cursor]);

  const entries = pages.flat();

  return (
    <>
      <PageHeader title="Audit Explorer" description="Append-only record of every consequential action: runs requested, gates raised, decisions made, accounts changed." />
      <Card className="p-4">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setCursor(null);
            setPages([]);
            setApplied(filters);
          }}
        >
          <Field label="Action prefix">
            <Input placeholder="approval." value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} />
          </Field>
          <Field label="Entity type">
            <Select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t || "Any"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Entity id">
            <Input placeholder="uuid" value={filters.entityId} onChange={(e) => setFilters({ ...filters, entityId: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary" className="w-full">
              Apply filters
            </Button>
          </div>
        </form>
      </Card>

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Card>
        {state.loading && entries.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon={<AuditIcon className="size-5" />} title="No audit entries match" />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Action</TH>
                  <TH>Actor</TH>
                  <TH>Entity</TH>
                  <TH>Metadata</TH>
                </TR>
              </THead>
              <TBody>
                {entries.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(entry.createdAt)}</TD>
                    <TD>
                      <Badge tone="outline">{entry.action}</Badge>
                    </TD>
                    <TD>
                      {entry.actor ? (
                        <>
                          <span className="block text-sm text-ink-800">{entry.actor.fullName ?? entry.actor.email}</span>
                          <span className="block text-xs text-ink-500">{roleLabel(entry.actorRole)}</span>
                        </>
                      ) : (
                        <span className="text-xs text-ink-500">system</span>
                      )}
                    </TD>
                    <TD className="text-xs">
                      {entry.entityType ? (
                        <>
                          <span className="block text-ink-700">{entry.entityType}</span>
                          <span className="block font-mono text-ink-500">{entry.entityId}</span>
                        </>
                      ) : null}
                    </TD>
                    <TD>
                      <MetadataCell entry={entry} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {state.data?.nextBefore ? (
              <div className="border-t border-line px-5 py-3 text-center">
                <Button variant="secondary" size="sm" loading={state.loading} onClick={() => setCursor(state.data!.nextBefore)}>
                  Load older entries
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

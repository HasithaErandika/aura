import { useAsync } from "@/shared/hooks/useAsync.ts";
import { TicketIcon } from "@/shared/icons/index.tsx";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { Card } from "@/shared/ui/Card.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { jiraApi } from "./api.ts";
import { JiraBrowser } from "./components/JiraBrowser.tsx";

export function JiraPage() {
  const status = useAsync(() => jiraApi.status(), []);

  return (
    <>
      <PageHeader title="Jira" description="Epics, Stories and Tasks read live from Jira. Agents file work only after a person approves it at a gate." />
      <AsyncView state={status}>
        {({ configured }) =>
          configured ? (
            <JiraBrowser />
          ) : (
            <Card>
              <EmptyState
                icon={<TicketIcon className="size-5" />}
                title="Jira is not connected"
                description="Ask an admin to set the Jira connection in the API environment, then reload."
                action={<Button onClick={() => void status.reload()}>Try again</Button>}
              />
            </Card>
          )
        }
      </AsyncView>
    </>
  );
}

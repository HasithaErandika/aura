import { WEBHOOK_HANDLERS } from "../webhooks/index.js";
import { offerReadyTask } from "./task-ready.js";
import { recordPrEvent } from "./task-prs.service.js";

// Registered on import (task-prs/index.ts): GitHub pull request events update the Task's row;
// Jira issue updates can offer a ready Task to its assignee.
WEBHOOK_HANDLERS["github:pull_request"] = (payload) => recordPrEvent(payload);
WEBHOOK_HANDLERS["jira:jira:issue_updated"] = (payload) => offerReadyTask(payload);

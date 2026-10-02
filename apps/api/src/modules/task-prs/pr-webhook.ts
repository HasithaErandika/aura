import { WEBHOOK_HANDLERS } from "../webhooks/index.js";
import { recordPrEvent } from "./task-prs.service.js";

// Registered on import (task-prs/index.ts): GitHub pull request events update the Task's row.
WEBHOOK_HANDLERS["github:pull_request"] = (payload) => recordPrEvent(payload);

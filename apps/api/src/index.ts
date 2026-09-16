import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./env.js";
import { apiRouter } from "./routes/index.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.webOrigin, credentials: true }));
app.use(express.json());
app.use(apiRouter);

app.listen(env.port, () => {
  console.log(`aura-api listening on :${env.port} (${env.nodeEnv})`);
});

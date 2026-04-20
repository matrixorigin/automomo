import { serve } from "@hono/node-server";
import { createApp } from "./app";

const port = Number.parseInt(process.env.PORT ?? "8000", 10);

serve(
  {
    fetch: createApp().fetch,
    port
  },
  (info) => {
    console.log(`automomo API listening on http://localhost:${info.port}`);
  }
);

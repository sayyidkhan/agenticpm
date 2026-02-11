import { data } from "react-router";
import type { Route } from "./+types/api.projects.$fileName.lock";
import { acquireSessionLock, releaseSessionLock, refreshSessionLock } from "~/lib/session-lock";

// POST /api/projects/:fileName/lock — acquire or refresh lock
// DELETE /api/projects/:fileName/lock — release lock
export async function action({ params, request }: Route.ActionArgs) {
  const { fileName } = params;
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const body = await request.json();
    const { sessionId, _method, username } = body as { sessionId: string; _method?: string; username?: string };
    if (!sessionId) {
      return data({ error: "sessionId is required" }, { status: 400 });
    }
    // sendBeacon can only POST, so support _method: "DELETE" override
    if (_method === "DELETE") {
      releaseSessionLock(fileName, sessionId);
      return data({ success: true });
    }
    const result = acquireSessionLock(fileName, sessionId, username);
    return data(result);
  }

  if (method === "DELETE") {
    const body = await request.json();
    const { sessionId } = body as { sessionId: string };
    if (!sessionId) {
      return data({ error: "sessionId is required" }, { status: 400 });
    }
    releaseSessionLock(fileName, sessionId);
    return data({ success: true });
  }

  return data({ error: "Method not allowed" }, { status: 405 });
}

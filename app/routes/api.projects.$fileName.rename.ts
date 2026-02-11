import { data } from "react-router";
import type { Route } from "./+types/api.projects.$fileName.rename";
import { renameProject } from "~/lib/excel";

// POST /api/projects/:fileName/rename
export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const { fileName } = params;
  const body = await request.json();
  const { newName } = body as { newName: string };
  if (!newName?.trim()) {
    return data({ error: "New name is required" }, { status: 400 });
  }
  const meta = renameProject(fileName, newName.trim());
  if (!meta) {
    return data({ error: "Project not found" }, { status: 404 });
  }
  return data({ meta });
}

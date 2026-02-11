import { data } from "react-router";
import type { Route } from "./+types/api.projects";
import { listProjects, createProject } from "~/lib/excel.server";

// GET /api/projects — list all projects
export async function loader() {
  const projects = await listProjects();
  return data({ projects });
}

// POST /api/projects — create new project
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const { name } = body as { name: string };
  if (!name?.trim()) {
    return data({ error: "Project name is required" }, { status: 400 });
  }
  const meta = await createProject(name.trim());
  return data({ project: meta });
}

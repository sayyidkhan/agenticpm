import { data } from "react-router";
import type { Route } from "./+types/api.projects.$fileName";
import { readProject, writeProject, updateProjectSheets, deleteProject, renameProject } from "~/lib/excel";
import { parseProjectText } from "~/lib/parser";

// GET /api/projects/:fileName — read project
export async function loader({ params }: Route.LoaderArgs) {
  const { fileName } = params;
  const project = await readProject(fileName);
  if (!project) {
    return data({ error: "Project not found" }, { status: 404 });
  }
  return data({ project });
}

// POST/PUT/DELETE /api/projects/:fileName
export async function action({ params, request }: Route.ActionArgs) {
  const { fileName } = params;
  const method = request.method.toUpperCase();

  // DELETE — delete project
  if (method === "DELETE") {
    const success = await deleteProject(fileName);
    if (!success) {
      return data({ error: "Project not found" }, { status: 404 });
    }
    return data({ success: true });
  }

  // PUT — full save
  if (method === "PUT") {
    const body = await request.json();
    const { canonicalText, projectData, projectName } = body as {
      canonicalText: string;
      projectData: import("~/types/project").ProjectData;
      projectName?: string;
    };
    const meta = await writeProject(fileName, projectData, canonicalText, projectName);
    return data({ meta });
  }

  // PATCH — partial update (specific sheets only)
  if (method === "PATCH") {
    const body = await request.json();
    const { changes } = body as {
      changes: {
        source?: string;
        people?: import("~/types/project").Person[];
        tasks?: import("~/types/project").Task[];
        timeline?: import("~/types/project").TimelineEntry[];
        projectName?: string;
      };
    };
    const meta = await updateProjectSheets(fileName, changes);
    if (!meta) {
      return data({ error: "Project not found" }, { status: 404 });
    }
    return data({ meta });
  }

  return data({ error: "Method not allowed" }, { status: 405 });
}

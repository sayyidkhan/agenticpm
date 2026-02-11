import type { ProjectData, ProjectMeta, Person, Task, TimelineEntry } from "~/types/project";

// --- Projects ---

export async function fetchProjects(): Promise<ProjectMeta[]> {
  const res = await fetch("/api/projects");
  const data = await res.json();
  return data.projects || [];
}

export async function createProjectFile(name: string): Promise<ProjectMeta> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  return data.project;
}

export async function fetchProject(fileName: string): Promise<{
  meta: ProjectMeta;
  data: ProjectData;
  canonicalText: string;
} | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(fileName)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.project;
}

export async function saveProjectFull(
  fileName: string,
  canonicalText: string,
  projectData: ProjectData,
  projectName?: string
): Promise<ProjectMeta> {
  const res = await fetch(`/api/projects/${encodeURIComponent(fileName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canonicalText, projectData, projectName }),
  });
  const data = await res.json();
  return data.meta;
}

export async function saveProjectSheets(
  fileName: string,
  changes: {
    source?: string;
    people?: Person[];
    tasks?: Task[];
    timeline?: TimelineEntry[];
    info?: string;
    projectName?: string;
  }
): Promise<ProjectMeta> {
  const res = await fetch(`/api/projects/${encodeURIComponent(fileName)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
  const data = await res.json();
  return data.meta;
}

export async function deleteProjectFile(fileName: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${encodeURIComponent(fileName)}`, {
    method: "DELETE",
  });
  return res.ok;
}

export async function renameProjectFile(
  oldFileName: string,
  newName: string
): Promise<ProjectMeta | null> {
  const res = await fetch(`/api/projects/${encodeURIComponent(oldFileName)}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.meta;
}

// --- Session Lock ---

export async function acquireLock(fileName: string, sessionId: string): Promise<{ success: boolean; lockedBy?: string }> {
  const res = await fetch(`/api/projects/${encodeURIComponent(fileName)}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  return res.json();
}

export async function releaseLock(fileName: string, sessionId: string): Promise<void> {
  await fetch(`/api/projects/${encodeURIComponent(fileName)}/lock`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

// --- AI ---

export async function aiCreateProject(prompt: string): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "create", prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

export async function aiUpdateProject(currentText: string, prompt: string, currentSprint?: string): Promise<string> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "update", prompt, currentText, currentSprint }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

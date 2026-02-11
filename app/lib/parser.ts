import type { ProjectData, Person, Task, TimelineEntry } from "~/types/project";

export function parseProjectText(text: string): ProjectData {
  const lines = text.split("\n");
  const project: ProjectData = {
    title: "",
    people: [],
    timeline: [],
    tasks: [],
  };

  let currentSection: "none" | "people" | "timeline" | "tasks" | "sprint" = "none";

  for (const line of lines) {
    const trimmed = line.trim();

    // Project title: # Project: <name>
    const titleMatch = trimmed.match(/^#\s+Project:\s*(.+)$/i);
    if (titleMatch) {
      project.title = titleMatch[1].trim();
      continue;
    }

    // Section headers
    if (/^##\s+People/i.test(trimmed)) {
      currentSection = "people";
      continue;
    }
    if (/^##\s+Timeline/i.test(trimmed)) {
      currentSection = "timeline";
      continue;
    }
    if (/^##\s+Tasks/i.test(trimmed)) {
      currentSection = "tasks";
      continue;
    }
    if (/^##\s+Sprint\s+Configuration/i.test(trimmed)) {
      currentSection = "sprint";
      if (!project.sprintConfig) {
        project.sprintConfig = { duration: 2 };
      }
      continue;
    }
    // Any other H2 resets section
    if (/^##\s+/.test(trimmed)) {
      currentSection = "none";
      continue;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse list items
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (!listMatch) continue;
    const content = listMatch[1];

    switch (currentSection) {
      case "people":
        project.people.push(parsePerson(content));
        break;
      case "timeline":
        project.timeline.push(parseTimelineEntry(content));
        break;
      case "tasks":
        project.tasks.push(parseTask(content));
        break;
      case "sprint":
        parseSprintConfig(content, project);
        break;
    }
  }

  // Normalize tasks to ensure remarks are properly extracted
  project.tasks = project.tasks.map(normalizeTask);

  return project;
}

// Normalize task by extracting remarks from title if they're embedded
function normalizeTask(task: Task): Task {
  if (task.remarks) {
    return task; // Already has remarks extracted
  }

  // Check if title contains remarks in angle brackets
  const remarksMatch = task.title.match(/<([^>]+)>\s*$/);
  if (remarksMatch) {
    return {
      ...task,
      remarks: remarksMatch[1].trim(),
      title: task.title.slice(0, remarksMatch.index).trim(),
    };
  }

  return task;
}

function parseSprintConfig(content: string, project: ProjectData) {
  if (!project.sprintConfig) {
    project.sprintConfig = { duration: 2 };
  }
  
  // Duration: X weeks
  const durationMatch = content.match(/Duration:\s*(\d+)\s*weeks?/i);
  if (durationMatch) {
    project.sprintConfig.duration = parseInt(durationMatch[1], 10);
  }
  
  // Start Date: YYYY-MM-DD
  const startDateMatch = content.match(/Start\s+Date:\s*(\d{4}-\d{2}-\d{2})/i);
  if (startDateMatch) {
    project.sprintConfig.startDate = startDateMatch[1];
  }
  
  // Active Sprint: Sprint Name (which sprint the project is on)
  const activeSprintMatch = content.match(/Active\s+Sprint:\s*(.+)$/i);
  if (activeSprintMatch) {
    project.sprintConfig.activeSprint = activeSprintMatch[1].trim();
  }
  
  // Current Sprint: Sprint Name (chat context)
  const currentSprintMatch = content.match(/Current\s+Sprint:\s*(.+)$/i);
  if (currentSprintMatch) {
    project.currentSprint = currentSprintMatch[1].trim();
  }
}

function parsePerson(content: string): Person {
  const colonIndex = content.indexOf(":");
  if (colonIndex === -1) {
    return { name: content.trim(), responsibilities: [] };
  }
  const name = content.slice(0, colonIndex).trim();
  const responsibilities = content
    .slice(colonIndex + 1)
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  return { name, responsibilities };
}

function parseTimelineEntry(content: string): TimelineEntry {
  const colonIndex = content.indexOf(":");
  if (colonIndex === -1) {
    return { label: content.trim(), description: "" };
  }
  
  const label = content.slice(0, colonIndex).trim();
  let description = content.slice(colonIndex + 1).trim();
  
  const entry: TimelineEntry = { label, description };
  
  // Extract percentage [50%]
  const percentMatch = description.match(/\[(\d+)%\]/);
  if (percentMatch) {
    entry.percentage = parseInt(percentMatch[1], 10);
    description = description.replace(percentMatch[0], "").trim();
  }
  
  // Extract actual dates {actual: YYYY-MM-DD to YYYY-MM-DD}
  const actualDateMatch = description.match(/\{actual:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\}/);
  if (actualDateMatch) {
    entry.actualStartDate = actualDateMatch[1];
    entry.actualEndDate = actualDateMatch[2];
    description = description.replace(actualDateMatch[0], "").trim();
  }
  
  // Extract planned dates (YYYY-MM-DD to YYYY-MM-DD)
  const dateMatch = description.match(/\((\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\)/);
  if (dateMatch) {
    entry.startDate = dateMatch[1];
    entry.endDate = dateMatch[2];
    description = description.replace(dateMatch[0], "").trim();
  }
  
  entry.description = description;
  return entry;
}

function parseTask(content: string): Task {
  let assignee: string | null = null;
  let status: Task["status"] = "todo";
  let sprint: string | undefined = undefined;
  let remarks: string | undefined = undefined;
  let title = content;

  // Extract status [done], [in-progress], [todo], [pending], [not started], etc.
  const statusMatch = title.match(/\[([^\]]+)\]\s*$/);
  if (statusMatch) {
    const raw = statusMatch[1].toLowerCase().trim();
    if (raw === "done" || raw === "completed" || raw === "complete") {
      status = "done";
    } else if (raw === "in-progress" || raw === "in progress" || raw === "wip" || raw === "active") {
      status = "in-progress";
    } else {
      status = "todo"; // pending, not started, todo, etc.
    }
    title = title.slice(0, statusMatch.index).trim();
  }

  // Extract remarks <remarks text> - must come before sprint extraction
  const remarksMatch = title.match(/<([^>]+)>\s*$/);
  if (remarksMatch) {
    remarks = remarksMatch[1].trim();
    title = title.slice(0, remarksMatch.index).trim();
  }

  // Extract sprint {Sprint 1} or {Phase 1}
  const sprintMatch = title.match(/\{([^}]+)\}\s*$/);
  if (sprintMatch) {
    sprint = sprintMatch[1].trim();
    title = title.slice(0, sprintMatch.index).trim();
  }

  // Extract assignee (Name) - must be the LAST parentheses pair at the end
  const assigneeMatch = title.match(/\(([^)]+)\)\s*$/);
  if (assigneeMatch) {
    assignee = assigneeMatch[1].trim();
    title = title.slice(0, assigneeMatch.index).trim();
  }

  return { title, assignee, status, dependencies: [], sprint, remarks: remarks || undefined };
}

export function serializeProject(project: ProjectData): string {
  const lines: string[] = [];

  if (project.title) {
    lines.push(`# Project: ${project.title}`);
    lines.push("");
  }

  if (project.people.length > 0) {
    lines.push("## People");
    for (const person of project.people) {
      if (person.responsibilities.length > 0) {
        lines.push(`- ${person.name}: ${person.responsibilities.join(", ")}`);
      } else {
        lines.push(`- ${person.name}`);
      }
    }
    lines.push("");
  }

  if (project.timeline.length > 0) {
    lines.push("## Timeline");
    for (const entry of project.timeline) {
      let line = `- ${entry.label}:`;
      
      // Add planned dates if present
      if (entry.startDate && entry.endDate) {
        line += ` (${entry.startDate} to ${entry.endDate})`;
      }
      
      // Add percentage if present
      if (entry.percentage !== undefined) {
        line += ` [${entry.percentage}%]`;
      }
      
      // Add actual dates if present
      if (entry.actualStartDate && entry.actualEndDate) {
        line += ` {actual: ${entry.actualStartDate} to ${entry.actualEndDate}}`;
      }
      
      // Add description
      if (entry.description) {
        line += ` ${entry.description}`;
      }
      
      lines.push(line);
    }
    lines.push("");
  }
  
  // Add sprint config if present
  if (project.sprintConfig) {
    lines.push("## Sprint Configuration");
    lines.push(`- Duration: ${project.sprintConfig.duration} weeks`);
    if (project.sprintConfig.startDate) {
      lines.push(`- Start Date: ${project.sprintConfig.startDate}`);
    }
    if (project.sprintConfig.activeSprint) {
      lines.push(`- Active Sprint: ${project.sprintConfig.activeSprint}`);
    }
    if (project.currentSprint) {
      lines.push(`- Current Sprint: ${project.currentSprint}`);
    }
    lines.push("");
  }

  if (project.tasks.length > 0) {
    lines.push("## Tasks");
    for (const task of project.tasks) {
      let line = `- ${task.title}`;
      if (task.assignee) {
        line += ` (${task.assignee})`;
      }
      if (task.sprint) {
        line += ` {${task.sprint}}`;
      }
      if (task.remarks) {
        line += ` <${task.remarks}>`;
      }
      if (task.status !== "todo") {
        line += ` [${task.status}]`;
      }
      lines.push(line);
    }
    lines.push("");
  }

  return lines.join("\n");
}

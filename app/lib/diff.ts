import type { ProjectData } from "~/types/project";

export interface ChangeSummary {
  changes: string[];
}

export function diffProjects(oldData: ProjectData, newData: ProjectData): ChangeSummary {
  const changes: string[] = [];

  // Title
  if (oldData.title !== newData.title) {
    changes.push(`Renamed project from "${oldData.title}" to "${newData.title}"`);
  }

  // People
  const oldPeople = new Set(oldData.people.map(p => p.name));
  const newPeople = new Set(newData.people.map(p => p.name));
  for (const name of newPeople) {
    if (!oldPeople.has(name)) changes.push(`Added person: ${name}`);
  }
  for (const name of oldPeople) {
    if (!newPeople.has(name)) changes.push(`Removed person: ${name}`);
  }
  // Responsibility changes for existing people
  for (const np of newData.people) {
    const op = oldData.people.find(p => p.name === np.name);
    if (op) {
      const oldResp = op.responsibilities.join(", ");
      const newResp = np.responsibilities.join(", ");
      if (oldResp !== newResp) {
        changes.push(`Updated ${np.name}'s responsibilities`);
      }
    }
  }

  // Timeline
  const oldTimeline = new Map(oldData.timeline.map(t => [t.label, t]));
  const newTimeline = new Map(newData.timeline.map(t => [t.label, t]));
  for (const [label] of newTimeline) {
    if (!oldTimeline.has(label)) changes.push(`Added timeline entry: ${label}`);
  }
  for (const [label] of oldTimeline) {
    if (!newTimeline.has(label)) changes.push(`Removed timeline entry: ${label}`);
  }
  // Changes to existing timeline entries
  for (const [label, nt] of newTimeline) {
    const ot = oldTimeline.get(label);
    if (ot) {
      if (ot.percentage !== nt.percentage) {
        changes.push(`${label}: progress ${ot.percentage ?? 0}% → ${nt.percentage ?? 0}%`);
      }
      if (ot.description !== nt.description) {
        changes.push(`${label}: updated description`);
      }
      if (ot.startDate !== nt.startDate || ot.endDate !== nt.endDate) {
        changes.push(`${label}: updated planned dates`);
      }
      if (ot.actualStartDate !== nt.actualStartDate || ot.actualEndDate !== nt.actualEndDate) {
        changes.push(`${label}: updated actual dates`);
      }
      // North Stars
      const oldNS = JSON.stringify(ot.northStars || []);
      const newNS = JSON.stringify(nt.northStars || []);
      if (oldNS !== newNS) {
        changes.push(`${label}: updated north stars`);
      }
    }
  }

  // Tasks
  const oldTasks = oldData.tasks;
  const newTasks = newData.tasks;
  const oldTaskTitles = new Map(oldTasks.map(t => [t.title, t]));
  const newTaskTitles = new Map(newTasks.map(t => [t.title, t]));

  const addedTasks = newTasks.filter(t => !oldTaskTitles.has(t.title));
  const removedTasks = oldTasks.filter(t => !newTaskTitles.has(t.title));

  if (addedTasks.length > 0) {
    if (addedTasks.length <= 3) {
      for (const t of addedTasks) changes.push(`Added task: ${t.title}`);
    } else {
      changes.push(`Added ${addedTasks.length} tasks`);
    }
  }
  if (removedTasks.length > 0) {
    if (removedTasks.length <= 3) {
      for (const t of removedTasks) changes.push(`Removed task: ${t.title}`);
    } else {
      changes.push(`Removed ${removedTasks.length} tasks`);
    }
  }

  // Status/assignee/sprint changes for existing tasks
  let statusChanges = 0;
  let assigneeChanges = 0;
  let sprintChanges = 0;
  let remarkChanges = 0;
  for (const nt of newTasks) {
    const ot = oldTaskTitles.get(nt.title);
    if (ot) {
      if (ot.status !== nt.status) statusChanges++;
      if (ot.assignee !== nt.assignee) assigneeChanges++;
      if (ot.sprint !== nt.sprint) sprintChanges++;
      if (ot.remarks !== nt.remarks) remarkChanges++;
    }
  }
  if (statusChanges > 0) changes.push(`Updated status on ${statusChanges} task${statusChanges > 1 ? "s" : ""}`);
  if (assigneeChanges > 0) changes.push(`Reassigned ${assigneeChanges} task${assigneeChanges > 1 ? "s" : ""}`);
  if (sprintChanges > 0) changes.push(`Moved ${sprintChanges} task${sprintChanges > 1 ? "s" : ""} to different sprint${sprintChanges > 1 ? "s" : ""}`);
  if (remarkChanges > 0) changes.push(`Updated remarks on ${remarkChanges} task${remarkChanges > 1 ? "s" : ""}`);

  // Sprint config
  if (oldData.sprintConfig?.activeSprint !== newData.sprintConfig?.activeSprint) {
    changes.push(`Active sprint changed to: ${newData.sprintConfig?.activeSprint || "none"}`);
  }
  if (oldData.sprintConfig?.duration !== newData.sprintConfig?.duration) {
    changes.push(`Sprint duration changed to ${newData.sprintConfig?.duration} weeks`);
  }

  if (changes.length === 0) {
    changes.push("No significant changes detected");
  }

  return { changes };
}

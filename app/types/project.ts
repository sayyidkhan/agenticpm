export interface Person {
  name: string;
  responsibilities: string[];
}

export interface Task {
  title: string;
  assignee: string | null;
  status: "todo" | "in-progress" | "done";
  dependencies: string[];
  sprint?: string; // Sprint/phase assignment (e.g., "Sprint 1", "Phase 1")
  remarks?: string; // Additional notes or comments about the task
}

export interface TimelineEntry {
  label: string;
  description: string;
  percentage?: number; // 0-100
  startDate?: string; // Planned start date (ISO date string)
  endDate?: string; // Planned end date (ISO date string)
  actualStartDate?: string; // Actual start date (ISO date string)
  actualEndDate?: string; // Actual end date (ISO date string)
}

export interface SprintConfig {
  duration: number; // in weeks, default 2
  startDate?: string; // Project start date
  activeSprint?: string; // Which sprint the project is currently on (e.g., "Sprint 2")
}

export interface ProjectData {
  title: string;
  people: Person[];
  timeline: TimelineEntry[];
  tasks: Task[];
  info?: string; // Project info markdown
  sprintConfig?: SprintConfig;
  currentSprint?: string; // Currently active sprint/phase
}

export interface ProjectState {
  canonicalText: string;
  parsed: ProjectData | null;
  history: string[];
  isLoading: boolean;
  error: string | null;
}

export interface ProjectMeta {
  name: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SheetChanges {
  source?: boolean;
  people?: boolean;
  tasks?: boolean;
  timeline?: boolean;
  info?: boolean;
}

export const EMPTY_PROJECT: ProjectData = {
  title: "",
  people: [],
  timeline: [],
  tasks: [],
};

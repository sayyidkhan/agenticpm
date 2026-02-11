import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from "react";
import type { ProjectData, ProjectMeta, Person, Task, TimelineEntry } from "~/types/project";
import { parseProjectText, serializeProject } from "~/lib/parser";
import {
  fetchProjects,
  fetchProject,
  createProjectFile,
  saveProjectFull,
  saveProjectSheets,
  deleteProjectFile,
  acquireLock,
  releaseLock,
  aiCreateProject,
  aiUpdateProject,
} from "~/lib/api.client";

interface ProjectContextType {
  // State
  canonicalText: string;
  parsed: ProjectData | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  isLocked: boolean;

  // Active project
  activeFileName: string | null;
  activeProjectName: string | null;

  // Project list
  projects: ProjectMeta[];
  refreshProjects: () => Promise<void>;

  // Actions
  setCanonicalText: (text: string) => void;
  setCurrentSprint: (sprint: string | null) => Promise<void>;
  loadProject: (fileName: string) => Promise<void>;
  createNewProject: () => void;
  deleteProject: (fileName: string) => Promise<void>;
  renameProject: (fileName: string, newName: string) => Promise<void>;
  undo: () => void;

  // Save
  saveAll: () => Promise<void>;
  saveSheet: (sheet: "source" | "people" | "tasks" | "timeline") => Promise<void>;

  // AI
  createFromPrompt: (prompt: string) => Promise<void>;
  updateFromPrompt: (instruction: string) => Promise<void>;

  // Session
  sessionId: string;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [canonicalText, setCanonicalTextRaw] = useState("");
  const [parsed, setParsed] = useState<ProjectData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  // Undo history (stored in localStorage, cleared on mount)
  const [undoHistory, setUndoHistory] = useState<Array<{ text: string; parsed: ProjectData }>>(() => {
    // Clear undo history on mount (fresh session)
    if (typeof window !== "undefined") {
      localStorage.removeItem("pm_undo_history");
    }
    return [];
  });

  // Change detection: snapshot of last saved state
  const lastSavedRef = useRef<{
    canonicalText: string;
    people: Person[];
    tasks: Task[];
    timeline: TimelineEntry[];
  }>({ canonicalText: "", people: [], tasks: [], timeline: [] });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Session ID (persisted per browser tab)
  const [sessionId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem("pm_session_id");
      if (!id) {
        id = generateSessionId();
        sessionStorage.setItem("pm_session_id", id);
      }
      return id;
    }
    return generateSessionId();
  });

  // Auto-save debounce timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project list
  const refreshProjects = useCallback(async () => {
    try {
      const list = await fetchProjects();
      setProjects(list);
    } catch {
      // silent
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshProjects();
    // Restore last active project
    const lastActive = localStorage.getItem("pm_active_file");
    if (lastActive) {
      loadProjectInternal(lastActive);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh lock periodically to keep it active
  useEffect(() => {
    if (!activeFileName) return;

    // Refresh lock every 30 seconds
    const refreshInterval = setInterval(async () => {
      try {
        await fetch(`/api/projects/${encodeURIComponent(activeFileName)}/lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Ignore refresh errors
      }
    }, 30 * 1000);

    return () => clearInterval(refreshInterval);
  }, [activeFileName, sessionId]);

  // Release lock on unload
  useEffect(() => {
    const handleUnload = () => {
      if (activeFileName) {
        navigator.sendBeacon(
          `/api/projects/${encodeURIComponent(activeFileName)}/lock`,
          JSON.stringify({ sessionId, _method: "DELETE" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [activeFileName, sessionId]);

  // Check for unsaved changes
  const checkUnsavedChanges = useCallback(() => {
    if (!parsed || !activeFileName) {
      setHasUnsavedChanges(false);
      return;
    }
    const saved = lastSavedRef.current;
    const changed =
      canonicalText !== saved.canonicalText ||
      JSON.stringify(parsed.people) !== JSON.stringify(saved.people) ||
      JSON.stringify(parsed.tasks) !== JSON.stringify(saved.tasks) ||
      JSON.stringify(parsed.timeline) !== JSON.stringify(saved.timeline);
    setHasUnsavedChanges(changed);
  }, [canonicalText, parsed, activeFileName]);

  useEffect(() => {
    checkUnsavedChanges();
  }, [checkUnsavedChanges]);

  // Auto-save with debounce (2 seconds after last change)
  useEffect(() => {
    if (!hasUnsavedChanges || !activeFileName) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveAllInternal();
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedChanges, canonicalText, activeFileName]);

  // Snapshot saved state
  const snapshotSavedState = useCallback((text: string, data: ProjectData) => {
    lastSavedRef.current = {
      canonicalText: text,
      people: JSON.parse(JSON.stringify(data.people)),
      tasks: JSON.parse(JSON.stringify(data.tasks)),
      timeline: JSON.parse(JSON.stringify(data.timeline)),
    };
    setHasUnsavedChanges(false);
  }, []);

  // Internal load
  const loadProjectInternal = async (fileName: string) => {
    setIsLoading(true);
    setError(null);
    setIsLocked(false);
    try {
      // Acquire lock
      const lockResult = await acquireLock(fileName, sessionId);
      if (!lockResult.success) {
        setError(`Project is locked by another session.`);
        setIsLocked(true);
        setIsLoading(false);
        return;
      }

      const result = await fetchProject(fileName);
      if (!result) {
        setError("Failed to load project");
        setIsLoading(false);
        return;
      }

      setActiveFileName(fileName);
      setActiveProjectName(result.meta.name);
      setCanonicalTextRaw(result.canonicalText);
      setParsed(result.data);
      snapshotSavedState(result.canonicalText, result.data);
      localStorage.setItem("pm_active_file", fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setIsLoading(false);
    }
  };

  // Save all (full write)
  const saveAllInternal = async () => {
    if (!activeFileName || !parsed) return;
    setIsSaving(true);
    try {
      await saveProjectFull(activeFileName, canonicalText, parsed, activeProjectName || undefined);
      snapshotSavedState(canonicalText, parsed);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Public API ---

  // Use refs to avoid stale closures in setCanonicalText
  const canonicalTextRef = useRef(canonicalText);
  const parsedRef = useRef(parsed);
  useEffect(() => { canonicalTextRef.current = canonicalText; }, [canonicalText]);
  useEffect(() => { parsedRef.current = parsed; }, [parsed]);

  const setCanonicalText = useCallback((text: string) => {
    // Save current state to undo history before changing
    const currentText = canonicalTextRef.current;
    const currentParsed = parsedRef.current;
    if (currentText && currentParsed) {
      setUndoHistory(prev => {
        const newHistory = [...prev, { text: currentText, parsed: JSON.parse(JSON.stringify(currentParsed)) }];
        const trimmed = newHistory.slice(-10);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("pm_undo_history", JSON.stringify(trimmed));
          } catch {
            // Ignore storage errors
          }
        }
        return trimmed;
      });
    }
    
    setCanonicalTextRaw(text);
    try {
      const result = parseProjectText(text);
      setParsed(result);
      setError(null);
    } catch {
      setError("Failed to parse project text");
    }
  }, []);

  const undo = useCallback(() => {
    setUndoHistory(prev => {
      if (prev.length === 0) return prev;
      
      const newHistory = [...prev];
      const previousState = newHistory.pop();
      
      if (previousState) {
        setCanonicalTextRaw(previousState.text);
        setParsed(previousState.parsed);
        
        // Update localStorage
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("pm_undo_history", JSON.stringify(newHistory));
          } catch {
            // Ignore storage errors
          }
        }
      }
      
      return newHistory;
    });
  }, []);

  const loadProject = useCallback(async (fileName: string) => {
    // Release old lock
    if (activeFileName && activeFileName !== fileName) {
      await releaseLock(activeFileName, sessionId).catch(() => {});
    }
    await loadProjectInternal(fileName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileName, sessionId]);

  const createNewProject = useCallback(() => {
    // Release old lock
    if (activeFileName) {
      releaseLock(activeFileName, sessionId).catch(() => {});
    }
    setActiveFileName(null);
    setActiveProjectName(null);
    setCanonicalTextRaw("");
    setParsed(null);
    setError(null);
    setHasUnsavedChanges(false);
    localStorage.removeItem("pm_active_file");
  }, [activeFileName, sessionId]);

  const deleteProject = useCallback(async (fileName: string) => {
    await deleteProjectFile(fileName);
    if (activeFileName === fileName) {
      createNewProject();
    }
    await refreshProjects();
  }, [activeFileName, createNewProject, refreshProjects]);

  const renameProject = useCallback(async (fileName: string, newName: string) => {
    if (!newName.trim()) return;
    // Use PATCH to update project name in metadata
    const meta = await saveProjectSheets(fileName, { projectName: newName.trim() });
    if (meta && activeFileName === fileName) {
      setActiveProjectName(newName.trim());
    }
    await refreshProjects();
  }, [activeFileName, refreshProjects]);

  const saveAll = useCallback(async () => {
    await saveAllInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileName, parsed, canonicalText, activeProjectName]);

  const saveSheet = useCallback(async (sheet: "source" | "people" | "tasks" | "timeline") => {
    if (!activeFileName || !parsed) return;
    setIsSaving(true);
    try {
      const changes: Record<string, unknown> = {};
      // Always include source so the Source sheet stays in sync
      changes.source = canonicalText;
      if (sheet === "people") changes.people = parsed.people;
      if (sheet === "tasks") changes.tasks = parsed.tasks;
      if (sheet === "timeline") {
        changes.timeline = parsed.timeline;
        changes.sprintConfig = parsed.sprintConfig;
      }

      await saveProjectSheets(activeFileName, changes as Parameters<typeof saveProjectSheets>[1]);
      // Update snapshot for the saved sheet (source is always saved)
      const saved = lastSavedRef.current;
      saved.canonicalText = canonicalText;
      if (sheet === "people") saved.people = JSON.parse(JSON.stringify(parsed.people));
      if (sheet === "tasks") saved.tasks = JSON.parse(JSON.stringify(parsed.tasks));
      if (sheet === "timeline") saved.timeline = JSON.parse(JSON.stringify(parsed.timeline));
      checkUnsavedChanges();
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [activeFileName, parsed, canonicalText, checkUnsavedChanges, refreshProjects]);

  const createFromPrompt = useCallback(async (prompt: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const text = await aiCreateProject(prompt);
      const result = parseProjectText(text);
      const name = result.title || prompt.slice(0, 40).trim();

      // Create file on backend
      const meta = await createProjectFile(name);

      // Save full data to it
      await saveProjectFull(meta.fileName, text, result, name);

      // Lock and set as active
      await acquireLock(meta.fileName, sessionId);

      setActiveFileName(meta.fileName);
      setActiveProjectName(meta.name);
      setCanonicalTextRaw(text);
      setParsed(result);
      snapshotSavedState(text, result);
      localStorage.setItem("pm_active_file", meta.fileName);

      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, refreshProjects, snapshotSavedState]);

  const updateFromPrompt = useCallback(async (instruction: string) => {
    if (!canonicalText) {
      setError("No project to update. Create one first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const currentSprint = parsed?.currentSprint;
      const newText = await aiUpdateProject(canonicalText, instruction, currentSprint);
      const result = parseProjectText(newText);
      setCanonicalTextRaw(newText);
      setParsed(result);
      // Auto-save will trigger via useEffect
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setIsLoading(false);
    }
  }, [canonicalText, parsed]);

  const setCurrentSprint = useCallback(async (sprint: string | null) => {
    if (!parsed) return;
    const updated = { ...parsed, currentSprint: sprint || undefined };
    setCanonicalTextRaw(serializeProject(updated));
    setParsed(updated);
    await saveSheet("source");
  }, [parsed, saveSheet]);

  return (
    <ProjectContext.Provider
      value={{
        canonicalText,
        parsed,
        isLoading,
        error,
        isSaving,
        hasUnsavedChanges,
        canUndo: undoHistory.length > 0,
        activeFileName,
        activeProjectName,
        projects,
        isLocked,
        refreshProjects,
        setCanonicalText,
        setCurrentSprint,
        loadProject,
        createNewProject,
        deleteProject,
        renameProject,
        undo,
        saveAll,
        saveSheet,
        createFromPrompt,
        updateFromPrompt,
        sessionId,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

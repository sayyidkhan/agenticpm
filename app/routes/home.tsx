import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/home";
import { ProjectProvider, useProject } from "~/context/ProjectContext";
import { ProjectHistory } from "~/components/ProjectHistory";
import { EmptyState } from "~/components/EmptyState";
import { PromptPanel, type PromptPanelHandle } from "~/components/PromptPanel";
import { TextEditorView } from "~/components/views/TextEditorView";
import { PeopleView } from "~/components/views/PeopleView";
import { TaskListView } from "~/components/views/TaskListView";
import { TimelineView } from "~/components/views/TimelineView";
import { MatrixView } from "~/components/views/MatrixView";
import { InfoView } from "~/components/views/InfoView";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { Button } from "~/components/ui/button";
import {
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  Save,
  FileText,
  Users,
  ListTodo,
  Calendar,
  Grid3X3,
  Info,
  Loader2,
  Circle,
  LogOut,
  ChevronDown,
  Undo,
} from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Agentic PM" },
    { name: "description", content: "AI-powered project management" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check authentication on mount
    const sessionToken = localStorage.getItem("auth_session_token");
    const username = localStorage.getItem("auth_username");

    if (!sessionToken || !username) {
      navigate("/login");
    } else {
      setIsAuthenticated(true);
    }
    setIsChecking(false);
  }, [navigate]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ProjectProvider>
      <AppLayout />
    </ProjectProvider>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const { parsed, error, isSaving, hasUnsavedChanges, canUndo, undo, saveAll, activeFileName, activeProjectName, setCurrentSprint, isLocked, isReadOnly, sessionId } = useProject();
  const promptPanelRef = useRef<PromptPanelHandle>(null);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dark_mode") === "true";
    }
    return false;
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_open") !== "false";
    }
    return true;
  });
  const [tabsOpen, setTabsOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("tabs_open") !== "false";
    }
    return true;
  });

  const handlePromptSelect = (prompt: string) => {
    promptPanelRef.current?.setPrompt(prompt);
  };

  const handleLogout = async () => {
    // Release project lock before logging out
    if (activeFileName) {
      try {
        await fetch(`/api/projects/${encodeURIComponent(activeFileName)}/lock`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Ignore lock release errors
      }
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      // Ignore errors
    }
    // Clear session
    localStorage.removeItem("auth_session_token");
    localStorage.removeItem("auth_username");
    navigate("/login");
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("dark_mode", String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("sidebar_open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem("tabs_open", String(tabsOpen));
  }, [tabsOpen]);

  const hasProject = !!parsed && !!activeFileName;

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-tight">Agentic PM</h1>
          {activeProjectName && (
            <span className="text-xs text-muted-foreground">/ {activeProjectName}</span>
          )}
          {/* Sprint Selector */}
          {hasProject && parsed?.timeline && parsed.timeline.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Context:</span>
              <select
                value={parsed.currentSprint || ""}
                onChange={(e) => setCurrentSprint(e.target.value || null)}
                className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors font-medium"
                title="Select current sprint for AI context"
              >
                <option value="">No Sprint</option>
                {parsed.timeline.map((t) => (
                  <option key={t.label} value={t.label}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
          {hasUnsavedChanges && (
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <Circle className="h-2 w-2 fill-current" />
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasProject && !isReadOnly && (
            <>
              <Button
                variant={hasUnsavedChanges ? "default" : "outline"}
                size="sm"
                onClick={() => saveAll()}
                disabled={isSaving || !hasUnsavedChanges}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!canUndo}
                title="Undo last change"
              >
                <Undo className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} title="Toggle theme">
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`border-r transition-all duration-300 ease-in-out overflow-hidden flex flex-col ${
            sidebarOpen ? "w-64" : "w-0"
          }`}
        >
          <ProjectHistory />
        </div>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-8 border-r bg-background hover:bg-muted transition-colors flex items-center justify-center shrink-0 cursor-pointer"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          type="button"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!hasProject ? (
            <EmptyState onPromptSelect={handlePromptSelect} />
          ) : (
            <Tabs defaultValue="source" className="flex flex-1 flex-col min-h-0">
              <div className={`border-b transition-all duration-300 ease-in-out overflow-hidden ${tabsOpen ? "h-auto" : "h-0"}`}>
                <div className="px-4 pt-2 pb-2 flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="source" className="gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Source
                    </TabsTrigger>
                    <TabsTrigger value="people" className="gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      People
                    </TabsTrigger>
                    <TabsTrigger value="tasks" className="gap-1.5">
                      <ListTodo className="h-3.5 w-3.5" />
                      Tasks
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Timeline
                    </TabsTrigger>
                    <TabsTrigger value="matrix" className="gap-1.5">
                      <Grid3X3 className="h-3.5 w-3.5" />
                      Matrix
                    </TabsTrigger>
                    <TabsTrigger value="info" className="gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      Info
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
              <button
                onClick={() => setTabsOpen(!tabsOpen)}
                className="h-8 border-b bg-background hover:bg-muted transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                title={tabsOpen ? "Collapse tabs" : "Expand tabs"}
                type="button"
              >
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${tabsOpen ? "rotate-180" : ""}`} />
              </button>
              <TabsContent value="source" className="flex-1 overflow-hidden">
                <TextEditorView />
              </TabsContent>
              <TabsContent value="people" className="flex-1 overflow-hidden">
                <PeopleView />
              </TabsContent>
              <TabsContent value="tasks" className="flex-1 overflow-hidden">
                <TaskListView />
              </TabsContent>
              <TabsContent value="timeline" className="flex-1 overflow-hidden">
                <TimelineView />
              </TabsContent>
              <TabsContent value="matrix" className="flex-1 overflow-hidden">
                <MatrixView />
              </TabsContent>
              <TabsContent value="info" className="flex-1 overflow-hidden">
                <InfoView />
              </TabsContent>
            </Tabs>
          )}

          {/* Read-only banner */}
          {isReadOnly && (
            <div className="border-t border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span><strong>Read-only mode</strong> — This project is being edited by another user. You can view but not edit.</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="border-t border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Prompt panel */}
          <PromptPanel ref={promptPanelRef} />
        </div>
      </div>

    </div>
  );
}

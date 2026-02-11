import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { Grid3X3, CheckCircle2, Clock, Circle, Calendar, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button";

export function MatrixView() {
  const { parsed } = useProject();

  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pm_collapsed_matrix_sprints");
      if (saved) {
        try {
          return new Set(JSON.parse(saved));
        } catch {
          return new Set();
        }
      }
    }
    return new Set();
  });

  const toggleSprintCollapse = (sprint: string) => {
    setCollapsedSprints(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sprint)) {
        newSet.delete(sprint);
      } else {
        newSet.add(sprint);
      }
      
      if (typeof window !== "undefined") {
        localStorage.setItem("pm_collapsed_matrix_sprints", JSON.stringify(Array.from(newSet)));
      }
      
      return newSet;
    });
  };

  if (!parsed) return null;

  const { people, tasks } = parsed;

  if (people.length === 0 || tasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Grid3X3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Need both people and tasks to show the matrix</p>
        </div>
      </div>
    );
  }

  // Group tasks by sprint
  const sprintGroups = new Map<string, typeof tasks>();
  const noSprintTasks: typeof tasks = [];
  
  tasks.forEach(task => {
    if (task.sprint) {
      if (!sprintGroups.has(task.sprint)) {
        sprintGroups.set(task.sprint, []);
      }
      sprintGroups.get(task.sprint)!.push(task);
    } else {
      noSprintTasks.push(task);
    }
  });

  // Get task number
  const getTaskNumber = (task: typeof tasks[0]): number => {
    return tasks.findIndex(t => t === task) + 1;
  };

  const allCollapsed = sprintGroups.size > 0 && collapsedSprints.size === sprintGroups.size;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Responsibility Matrix</h2>
        </div>
        {sprintGroups.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (allCollapsed) {
                setCollapsedSprints(new Set());
                if (typeof window !== "undefined") {
                  localStorage.setItem("pm_collapsed_matrix_sprints", JSON.stringify([]));
                }
              } else {
                const allSprints = new Set(sprintGroups.keys());
                setCollapsedSprints(allSprints);
                if (typeof window !== "undefined") {
                  localStorage.setItem("pm_collapsed_matrix_sprints", JSON.stringify(Array.from(allSprints)));
                }
              }
            }}
            className="text-xs"
          >
            {allCollapsed ? "Expand All" : "Collapse All"}
          </Button>
        )}
      </div>

      <div className="space-y-6">
        {/* Tasks grouped by sprint */}
        {Array.from(sprintGroups.entries()).map(([sprint, sprintTasks]) => {
          const isCollapsed = collapsedSprints.has(sprint);
          return (
            <div key={sprint} className="rounded-lg border overflow-hidden">
              <button
                onClick={() => toggleSprintCollapse(sprint)}
                className="w-full bg-primary/10 px-4 py-2 border-b flex items-center gap-2 hover:bg-primary/20 transition-colors cursor-pointer text-left"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                <Calendar className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">{sprint}</span>
                <span className="text-xs text-muted-foreground">({sprintTasks.length} tasks)</span>
              </button>
              {!isCollapsed && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium w-12">#</th>
                    <th className="text-left p-3 font-medium">Task</th>
                    {people.map((p) => (
                      <th key={p.name} className="text-center p-3 font-medium min-w-[100px]">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sprintTasks.map((task, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-3 text-xs text-muted-foreground font-semibold">
                        #{getTaskNumber(task)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {task.status === "done" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : task.status === "in-progress" ? (
                            <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                      </td>
                      {people.map((p) => {
                        const assignees = task.assignee ? task.assignee.split(',').map(a => a.trim()) : [];
                        return (
                        <td key={p.name} className="text-center p-3">
                          {assignees.includes(p.name) ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              )}
            </div>
          );
        })}

        {/* Tasks without sprint assignment */}
        {noSprintTasks.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm text-muted-foreground">Unassigned</span>
              <span className="text-xs text-muted-foreground">({noSprintTasks.length} tasks)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium w-12">#</th>
                    <th className="text-left p-3 font-medium">Task</th>
                    {people.map((p) => (
                      <th key={p.name} className="text-center p-3 font-medium min-w-[100px]">
                        {p.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {noSprintTasks.map((task, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="p-3 text-xs text-muted-foreground font-semibold">
                        #{getTaskNumber(task)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {task.status === "done" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : task.status === "in-progress" ? (
                            <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                      </td>
                      {people.map((p) => {
                        const assignees = task.assignee ? task.assignee.split(',').map(a => a.trim()) : [];
                        return (
                        <td key={p.name} className="text-center p-3">
                          {assignees.includes(p.name) ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

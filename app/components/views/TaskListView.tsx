import { useState, useRef, useEffect, useCallback } from "react";
import { useProject } from "~/context/ProjectContext";
import { serializeProject } from "~/lib/parser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select } from "~/components/ui/select";
import type { Task, ProjectData } from "~/types/project";
import { ListTodo, Plus, X, Edit2, Save, Circle, CheckCircle2, Clock, Calendar, ChevronRight } from "lucide-react";

const STATUS_ICON: Record<Task["status"], React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  "in-progress": <Clock className="h-4 w-4 text-yellow-500" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
};

function RemarksInput({ value, onChange, onSave }: { value: string; onChange: (text: string) => void; onSave: () => void }) {
  const [localValue, setLocalValue] = useState(value);
  const syncedRef = useRef(value);

  // Sync from parent when parent value changes externally (e.g. undo)
  useEffect(() => {
    if (value !== syncedRef.current) {
      setLocalValue(value);
      syncedRef.current = value;
    }
  }, [value]);

  return (
    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          const newVal = e.target.value;
          setLocalValue(newVal);
          syncedRef.current = newVal;
          onChange(newVal);
        }}
        onBlur={() => {
          onSave();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
        placeholder="Add remarks..."
        className="text-xs w-full px-2 py-1 rounded border bg-muted/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

export function TaskListView() {
  const { parsed, setCanonicalText, saveSheet } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const [editTasks, setEditTasks] = useState<Task[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: "",
    assignee: "",
    sprint: "",
    remarks: "",
    status: "todo" as Task["status"],
  });
  
  // Collapsible sprint sections state
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pm_collapsed_sprints");
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
      
      // Persist to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("pm_collapsed_sprints", JSON.stringify(Array.from(newSet)));
      }
      
      return newSet;
    });
  };

  if (!parsed) return null;

  const startEditing = () => {
    setEditTasks(JSON.parse(JSON.stringify(parsed.tasks)));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditTasks([]);
  };

  const saveChanges = async () => {
    const updated = { ...parsed, tasks: editTasks };
    setCanonicalText(serializeProject(updated));
    await saveSheet("tasks");
    setIsEditing(false);
  };

  const toggleTaskStatus = async (taskIndex: number) => {
    const task = parsed.tasks[taskIndex];
    let newStatus: Task["status"];
    
    // Cycle through: todo -> in-progress -> done -> todo
    if (task.status === "todo") {
      newStatus = "in-progress";
    } else if (task.status === "in-progress") {
      newStatus = "done";
    } else {
      newStatus = "todo";
    }
    
    const updatedTasks = [...parsed.tasks];
    updatedTasks[taskIndex] = { ...task, status: newStatus };
    
    const updated = { ...parsed, tasks: updatedTasks };
    setCanonicalText(serializeProject(updated));
    await saveSheet("tasks");
  };

  const updateTaskAssignee = async (taskIndex: number, newAssignee: string | null) => {
    const task = parsed.tasks[taskIndex];
    const updatedTasks = [...parsed.tasks];
    updatedTasks[taskIndex] = { ...task, assignee: newAssignee };
    
    const updated = { ...parsed, tasks: updatedTasks };
    setCanonicalText(serializeProject(updated));
    await saveSheet("tasks");
  };

  const addTask = () => {
    setEditTasks([...editTasks, { title: "", assignee: null, status: "todo", dependencies: [] }]);
  };

  const removeTask = (index: number) => {
    setEditTasks(editTasks.filter((_, i) => i !== index));
  };

  const updateTask = (index: number, field: keyof Task, value: string) => {
    const copy = [...editTasks];
    if (field === "assignee") {
      copy[index] = { ...copy[index], assignee: value || null };
    } else if (field === "status") {
      copy[index] = { ...copy[index], status: value as Task["status"] };
    } else if (field === "title") {
      copy[index] = { ...copy[index], title: value };
    } else if (field === "remarks") {
      copy[index] = { ...copy[index], remarks: value || undefined };
    }
    setEditTasks(copy);
  };

  // Group tasks by sprint first, then by status within each sprint
  const sprintGroups = new Map<string, Task[]>();
  const noSprintTasks: Task[] = [];
  
  parsed.tasks.forEach(task => {
    if (task.sprint) {
      if (!sprintGroups.has(task.sprint)) {
        sprintGroups.set(task.sprint, []);
      }
      sprintGroups.get(task.sprint)!.push(task);
    } else {
      noSprintTasks.push(task);
    }
  });

  // Create a map of task to its global number
  const getTaskNumber = (task: Task): number => {
    return parsed.tasks.findIndex(t => t === task) + 1;
  };

  // Get timeline labels for sprint dropdown
  const sprintOptions = parsed.timeline.map(t => t.label);

  const allCollapsed = parsed.tasks.length > 0 && Array.from(collapsedSprints).length === Array.from(sprintGroups.keys()).length;
  const anyCollapsed = collapsedSprints.size > 0;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Tasks</h2>
          <span className="text-sm text-muted-foreground">({parsed.tasks.length} tasks)</span>
        </div>
        <div className="flex items-center gap-2">
          {sprintGroups.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (allCollapsed) {
                  setCollapsedSprints(new Set());
                  if (typeof window !== "undefined") {
                    localStorage.setItem("pm_collapsed_sprints", JSON.stringify([]));
                  }
                } else {
                  const allSprints = new Set(sprintGroups.keys());
                  setCollapsedSprints(allSprints);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("pm_collapsed_sprints", JSON.stringify(Array.from(allSprints)));
                  }
                }
              }}
              className="text-xs"
            >
              {allCollapsed ? "Expand All" : "Collapse All"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddModal(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </Button>
        </div>
      </div>

      {parsed.tasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ListTodo className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No tasks defined yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tasks grouped by sprint */}
          {Array.from(sprintGroups.entries()).map(([sprint, tasks]) => {
            const isCollapsed = collapsedSprints.has(sprint);
            return (
              <div key={sprint} className="space-y-3">
                <button
                  onClick={() => toggleSprintCollapse(sprint)}
                  className="w-full text-base font-semibold text-foreground flex items-center gap-2 border-b pb-2 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                  <Calendar className="h-4 w-4 text-primary" />
                  {sprint} ({tasks.length} tasks)
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 pl-2">
                {tasks.map((task, i) => {
                  const originalIndex = parsed.tasks.findIndex(t => t === task);
                  const taskNumber = getTaskNumber(task);
                  return (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-card group">
                      {/* Task Number */}
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded w-8 text-center">
                        #{taskNumber}
                      </span>
                      
                      {/* Status Icon */}
                      <button
                        onClick={() => toggleTaskStatus(originalIndex)}
                        className="shrink-0 hover:scale-110 transition-transform cursor-pointer"
                        title={`Click to change status (currently: ${task.status})`}
                      >
                        {STATUS_ICON[task.status]}
                      </button>
                      
                      {/* Task Title and Remarks */}
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => {
                            const updatedTasks = [...parsed.tasks];
                            updatedTasks[originalIndex] = { ...task, title: e.target.value };
                            const updated = { ...parsed, tasks: updatedTasks };
                            setCanonicalText(serializeProject(updated));
                          }}
                          onBlur={() => saveSheet("tasks")}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          onKeyUp={(e) => e.stopPropagation()}
                          onKeyPress={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm w-full px-2 py-1 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary mb-1"
                        />
                        <RemarksInput
                          value={task.remarks || ""}
                          onChange={(text: string) => {
                            const updatedTasks = [...parsed.tasks];
                            updatedTasks[originalIndex] = { ...task, remarks: text || undefined };
                            const updated = { ...parsed, tasks: updatedTasks };
                            setCanonicalText(serializeProject(updated));
                          }}
                          onSave={() => saveSheet("tasks")}
                        />
                      </div>
                      
                      {/* Status Dropdown */}
                      <select
                        value={task.status}
                        onChange={(e) => {
                          const updatedTasks = [...parsed.tasks];
                          updatedTasks[originalIndex] = { ...task, status: e.target.value as Task["status"] };
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-28"
                        title="Change task status"
                      >
                        <option value="todo">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                      
                      {/* Sprint Dropdown */}
                      <select
                        value={task.sprint || ""}
                        onChange={(e) => {
                          const updatedTasks = [...parsed.tasks];
                          updatedTasks[originalIndex] = { ...task, sprint: e.target.value || undefined };
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-24"
                        title="Assign to sprint/phase"
                      >
                        <option value="">No Sprint</option>
                        {sprintOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      
                      {/* Assignee Dropdown */}
                      <select
                        value={task.assignee || ""}
                        onChange={(e) => updateTaskAssignee(originalIndex, e.target.value || null)}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-28"
                        title="Assign task to team member"
                      >
                        <option value="">Unassigned</option>
                        {parsed.people.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                      
                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          const updatedTasks = parsed.tasks.filter((_, idx) => idx !== originalIndex);
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Tasks without sprint assignment */}
          {noSprintTasks.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-muted-foreground flex items-center gap-2 border-b pb-2">
                <ListTodo className="h-4 w-4" />
                Unassigned ({noSprintTasks.length} tasks)
              </h3>
              <div className="space-y-2 pl-2">
                {noSprintTasks.map((task, i) => {
                  const originalIndex = parsed.tasks.findIndex(t => t === task);
                  const taskNumber = getTaskNumber(task);
                  return (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-lg border bg-card group">
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground bg-muted px-2 py-1 rounded w-8 text-center">
                        #{taskNumber}
                      </span>
                      <button
                        onClick={() => toggleTaskStatus(originalIndex)}
                        className="shrink-0 hover:scale-110 transition-transform cursor-pointer"
                        title={`Click to change status (currently: ${task.status})`}
                      >
                        {STATUS_ICON[task.status]}
                      </button>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => {
                            const updatedTasks = [...parsed.tasks];
                            updatedTasks[originalIndex] = { ...task, title: e.target.value };
                            const updated = { ...parsed, tasks: updatedTasks };
                            setCanonicalText(serializeProject(updated));
                          }}
                          onBlur={() => saveSheet("tasks")}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          onKeyUp={(e) => e.stopPropagation()}
                          onKeyPress={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm w-full px-2 py-1 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary mb-1"
                        />
                        <RemarksInput
                          value={task.remarks || ""}
                          onChange={(text: string) => {
                            const updatedTasks = [...parsed.tasks];
                            updatedTasks[originalIndex] = { ...task, remarks: text || undefined };
                            const updated = { ...parsed, tasks: updatedTasks };
                            setCanonicalText(serializeProject(updated));
                          }}
                          onSave={() => saveSheet("tasks")}
                        />
                      </div>
                      <select
                        value={task.status}
                        onChange={(e) => {
                          const updatedTasks = [...parsed.tasks];
                          updatedTasks[originalIndex] = { ...task, status: e.target.value as Task["status"] };
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-28"
                        title="Change task status"
                      >
                        <option value="todo">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                      <select
                        value={task.sprint || ""}
                        onChange={(e) => {
                          const updatedTasks = [...parsed.tasks];
                          updatedTasks[originalIndex] = { ...task, sprint: e.target.value || undefined };
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-24"
                        title="Assign to sprint/phase"
                      >
                        <option value="">No Sprint</option>
                        {sprintOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <select
                        value={task.assignee || ""}
                        onChange={(e) => updateTaskAssignee(originalIndex, e.target.value || null)}
                        className="text-xs px-2 py-1 rounded-md border bg-background cursor-pointer hover:bg-muted transition-colors w-28"
                        title="Assign task to team member"
                      >
                        <option value="">Unassigned</option>
                        {parsed.people.map((p) => (
                          <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                      </select>
                      
                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          const updatedTasks = parsed.tasks.filter((_, idx) => idx !== originalIndex);
                          const updated = { ...parsed, tasks: updatedTasks };
                          setCanonicalText(serializeProject(updated));
                          saveSheet("tasks");
                        }}
                        className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete task"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add New Task</h2>
            
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-sm font-medium block mb-1">Task Title *</label>
                <input
                  type="text"
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  placeholder="Enter task title"
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>

              {/* Assignee */}
              <div>
                <label className="text-sm font-medium block mb-1">Assignee</label>
                <select
                  value={newTaskForm.assignee}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, assignee: e.target.value })}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Unassigned</option>
                  {parsed.people.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Sprint */}
              <div>
                <label className="text-sm font-medium block mb-1">Sprint/Phase</label>
                <select
                  value={newTaskForm.sprint}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, sprint: e.target.value })}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">No Sprint</option>
                  {parsed.timeline.map((t) => (
                    <option key={t.label} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium block mb-1">Status</label>
                <select
                  value={newTaskForm.status}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, status: e.target.value as Task["status"] })}
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="todo">To Do</option>
                  <option value="in-progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-sm font-medium block mb-1">Remarks</label>
                <input
                  type="text"
                  value={newTaskForm.remarks}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, remarks: e.target.value })}
                  placeholder="Add remarks (optional)"
                  className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewTaskForm({ title: "", assignee: "", sprint: "", remarks: "", status: "todo" });
                }}
                className="flex-1 px-4 py-2 rounded border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newTaskForm.title.trim()) {
                    alert("Task title is required");
                    return;
                  }
                  const newTask: Task = {
                    title: newTaskForm.title,
                    assignee: newTaskForm.assignee || null,
                    status: newTaskForm.status,
                    sprint: newTaskForm.sprint || undefined,
                    remarks: newTaskForm.remarks || undefined,
                    dependencies: [],
                  };
                  const updatedTasks = [...parsed.tasks, newTask];
                  const updated = { ...parsed, tasks: updatedTasks };
                  setCanonicalText(serializeProject(updated));
                  saveSheet("tasks");
                  setShowAddModal(false);
                  setNewTaskForm({ title: "", assignee: "", sprint: "", remarks: "", status: "todo" });
                }}
                className="flex-1 px-4 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

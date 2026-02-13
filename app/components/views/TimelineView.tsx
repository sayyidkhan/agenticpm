import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { serializeProject } from "~/lib/parser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { TimelineEntry, SprintConfig } from "~/types/project";
import { Calendar, Plus, X, Edit2, Save, Settings } from "lucide-react";

export function TimelineView() {
  const { parsed, setCanonicalText, saveSheet, isReadOnly } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const [editEntries, setEditEntries] = useState<TimelineEntry[]>([]);
  const [editSprintConfig, setEditSprintConfig] = useState<SprintConfig>({ duration: 2 });
  const [showSprintConfig, setShowSprintConfig] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; label: string; taskCount: number } | null>(null);

  if (!parsed) return null;

  const startEditing = () => {
    setEditEntries(JSON.parse(JSON.stringify(parsed.timeline)));
    setEditSprintConfig(parsed.sprintConfig ? JSON.parse(JSON.stringify(parsed.sprintConfig)) : { duration: 2 });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditEntries([]);
    setDeleteConfirm(null);
  };

  const saveChanges = async () => {
    // Get list of timeline labels that still exist
    const remainingLabels = new Set(editEntries.map(e => e.label));
    
    // Filter out tasks that are assigned to deleted timeline entries
    const filteredTasks = parsed.tasks.filter(task => {
      if (!task.sprint) return true; // Keep tasks without sprint
      return remainingLabels.has(task.sprint); // Keep tasks with valid sprint
    });
    
    const updated = { 
      ...parsed, 
      timeline: editEntries, 
      sprintConfig: editSprintConfig,
      tasks: filteredTasks 
    };
    setCanonicalText(serializeProject(updated));
    await saveSheet("timeline");
    setIsEditing(false);
  };

  const addEntry = () => {
    setEditEntries([...editEntries, { label: "", description: "", percentage: 0 }]);
  };

  const removeEntry = (index: number) => {
    const entryLabel = editEntries[index].label;
    // Count tasks associated with this timeline entry
    const associatedTasks = parsed.tasks.filter(task => task.sprint === entryLabel);
    
    if (associatedTasks.length > 0) {
      // Show confirmation dialog
      setDeleteConfirm({
        index,
        label: entryLabel,
        taskCount: associatedTasks.length
      });
    } else {
      // No tasks, delete immediately
      setEditEntries(editEntries.filter((_, i) => i !== index));
    }
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    
    const entryLabel = editEntries[deleteConfirm.index].label;
    
    // Remove the timeline entry
    setEditEntries(editEntries.filter((_, i) => i !== deleteConfirm.index));
    
    // Also need to remove associated tasks when saving
    // We'll update the save function to handle this
    
    setDeleteConfirm(null);
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const updateEntry = (index: number, field: keyof TimelineEntry, value: string | number) => {
    const copy = [...editEntries];
    if (field === 'percentage') {
      copy[index] = { ...copy[index], [field]: typeof value === 'string' ? parseInt(value, 10) || 0 : value };
    } else {
      copy[index] = { ...copy[index], [field]: value as string };
    }
    setEditEntries(copy);
  };

  const totalEntries = parsed.timeline.length;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Timeline</h2>
          <span className="text-sm text-muted-foreground">({totalEntries} entries)</span>
        </div>
        {!isEditing ? (
          !isReadOnly && <Button variant="outline" size="sm" onClick={startEditing}>
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelEditing}>Cancel</Button>
            <Button size="sm" onClick={saveChanges}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Sprint Configuration */}
      {!isEditing && parsed.sprintConfig && (
        <div className="mb-4 p-3 rounded-lg border bg-muted/50 flex flex-wrap items-center gap-4 text-sm">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span>Sprint Duration: <strong>{parsed.sprintConfig.duration} weeks</strong></span>
          {parsed.sprintConfig.startDate && (
            <span>Start Date: <strong>{parsed.sprintConfig.startDate}</strong></span>
          )}
          <span className="flex items-center gap-1">
            Active Sprint: {parsed.sprintConfig.activeSprint ? (
              <strong className="text-primary">{parsed.sprintConfig.activeSprint}</strong>
            ) : (
              <span className="text-muted-foreground italic">Not set (use Edit to configure)</span>
            )}
          </span>
        </div>
      )}

      {/* Gantt Chart with Day-by-Day Grid */}
      {!isEditing && parsed.timeline.length > 0 && (() => {
        // Calculate overall date range from all entries
        const allDates: Date[] = [];
        parsed.timeline.forEach(e => {
          if (e.startDate) allDates.push(new Date(e.startDate));
          if (e.endDate) allDates.push(new Date(e.endDate));
          if (e.actualStartDate) allDates.push(new Date(e.actualStartDate));
          if (e.actualEndDate) allDates.push(new Date(e.actualEndDate));
        });
        
        if (allDates.length < 2) return null;
        
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        
        // Pad by 1 day on each side
        minDate.setDate(minDate.getDate() - 1);
        maxDate.setDate(maxDate.getDate() + 1);
        
        // Generate all days in range
        const days: Date[] = [];
        const dayCursor = new Date(minDate);
        while (dayCursor <= maxDate) {
          days.push(new Date(dayCursor));
          dayCursor.setDate(dayCursor.getDate() + 1);
        }
        
        const DAY_WIDTH = 36; // px per day column
        const LABEL_WIDTH = 100; // px for sprint label column
        const PROGRESS_WIDTH = 90; // px for progress column
        const chartWidth = days.length * DAY_WIDTH;
        
        // Group days by month for the top header
        const months: { label: string; span: number }[] = [];
        let currentMonth = "";
        for (const day of days) {
          const monthLabel = day.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          if (monthLabel !== currentMonth) {
            months.push({ label: monthLabel, span: 1 });
            currentMonth = monthLabel;
          } else {
            months[months.length - 1].span++;
          }
        }
        
        const getDayIndex = (dateStr: string) => {
          const d = new Date(dateStr);
          return Math.round((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        };
        
        const getDaysDiff = (planned?: string, actual?: string) => {
          if (!planned || !actual) return null;
          return Math.round((new Date(actual).getTime() - new Date(planned).getTime()) / (1000 * 60 * 60 * 24));
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayIndex = Math.round((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return (
          <div className="mb-8 rounded-lg border bg-card p-4">
            {/* Legend */}
            <div className="flex items-center gap-4 mb-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary/30 border border-primary/50"></div>
                <span className="text-muted-foreground">Planned</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-300/60"></div>
                <span className="text-muted-foreground">Remaining</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span className="text-muted-foreground">Done</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span className="text-muted-foreground">Behind schedule</span>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <div className="flex" style={{ minWidth: `${LABEL_WIDTH + chartWidth + PROGRESS_WIDTH}px` }}>
                {/* Left: Sprint labels column */}
                <div className="shrink-0" style={{ width: `${LABEL_WIDTH}px` }}>
                  {/* Month header spacer */}
                  <div className="h-5"></div>
                  {/* Day header spacer */}
                  <div className="h-8 border-b"></div>
                  {/* Sprint label rows */}
                  {parsed.timeline.map((entry, i) => (
                    <div key={i} className="h-[52px] flex items-center justify-end pr-3">
                      <span className="text-[11px] font-medium truncate">{entry.label}</span>
                    </div>
                  ))}
                </div>
                
                {/* Center: Day grid */}
                <div className="flex-1 min-w-0" style={{ width: `${chartWidth}px` }}>
                  {/* Month header row */}
                  <div className="flex h-5">
                    {months.map((m, i) => (
                      <div
                        key={i}
                        className="text-[9px] font-semibold text-muted-foreground text-center border-l border-muted-foreground/15 flex items-center justify-center"
                        style={{ width: `${m.span * DAY_WIDTH}px` }}
                      >
                        {m.label}
                      </div>
                    ))}
                  </div>
                  
                  {/* Day header row */}
                  <div className="flex h-8 border-b">
                    {days.map((day, i) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = i === todayIndex;
                      const dayNum = day.getDate();
                      const dayName = day.toLocaleDateString("en-US", { weekday: "narrow" });
                      return (
                        <div
                          key={i}
                          className={`flex flex-col items-center justify-center border-l text-center ${
                            isToday
                              ? "bg-primary/15 border-l-primary/40 font-bold"
                              : isWeekend
                              ? "bg-muted/40 border-l-muted-foreground/10"
                              : "border-l-muted-foreground/10"
                          }`}
                          style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                        >
                          <span className={`text-[8px] leading-none ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dayName}</span>
                          <span className={`text-[10px] leading-tight font-medium ${isToday ? "text-primary" : isWeekend ? "text-muted-foreground/60" : "text-foreground"}`}>{dayNum}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Sprint bar rows */}
                  {parsed.timeline.map((entry, i) => {
                    const progress = entry.percentage ?? 0;
                    const endVariance = getDaysDiff(entry.endDate, entry.actualEndDate);
                    
                    const plannedStart = entry.startDate ? getDayIndex(entry.startDate) : null;
                    const plannedEnd = entry.endDate ? getDayIndex(entry.endDate) : null;
                    const actualStart = entry.actualStartDate ? getDayIndex(entry.actualStartDate) : null;
                    const actualEnd = entry.actualEndDate ? getDayIndex(entry.actualEndDate) : null;
                    
                    return (
                      <div key={i} className="flex h-[52px] relative">
                        {/* Day cell backgrounds */}
                        {days.map((day, j) => {
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          const isToday = j === todayIndex;
                          return (
                            <div
                              key={j}
                              className={`border-l border-b ${
                                isToday
                                  ? "bg-primary/5 border-l-primary/30"
                                  : isWeekend
                                  ? "bg-muted/30 border-l-muted-foreground/10 border-b-muted-foreground/10"
                                  : "border-l-muted-foreground/10 border-b-muted-foreground/10"
                              }`}
                              style={{ width: `${DAY_WIDTH}px`, minWidth: `${DAY_WIDTH}px` }}
                            />
                          );
                        })}
                        
                        {/* Planned bar */}
                        {plannedStart !== null && plannedEnd !== null && (
                          <div
                            className="absolute top-1.5 h-[18px] rounded bg-primary/15 border border-primary/25"
                            style={{
                              left: `${plannedStart * DAY_WIDTH}px`,
                              width: `${Math.max((plannedEnd - plannedStart + 1) * DAY_WIDTH, DAY_WIDTH)}px`,
                            }}
                            title={`Planned: ${entry.startDate} → ${entry.endDate}`}
                          />
                        )}
                        
                        {/* Actual bar */}
                        {actualStart !== null && actualEnd !== null && (
                          <div
                            className={`absolute bottom-1.5 h-[18px] rounded ${
                              endVariance !== null && endVariance > 0
                                ? "bg-red-300/50"
                                : "bg-green-300/50"
                            }`}
                            style={{
                              left: `${actualStart * DAY_WIDTH}px`,
                              width: `${Math.max((actualEnd - actualStart + 1) * DAY_WIDTH, DAY_WIDTH)}px`,
                            }}
                            title={`Actual: ${entry.actualStartDate} → ${entry.actualEndDate}`}
                          >
                            {progress > 0 && (
                              <div
                                className={`h-full ${progress < 100 ? "rounded-l" : "rounded"} ${
                                  endVariance !== null && endVariance > 0
                                    ? "bg-red-500/70"
                                    : "bg-green-500/70"
                                }`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            )}
                          </div>
                        )}
                        
                        {/* If no actual bar, show progress on planned range */}
                        {actualStart === null && plannedStart !== null && plannedEnd !== null && progress > 0 && (
                          <div
                            className="absolute bottom-1.5 h-[18px] rounded bg-primary/60"
                            style={{
                              left: `${plannedStart * DAY_WIDTH}px`,
                              width: `${Math.max((plannedEnd - plannedStart + 1) * DAY_WIDTH * (progress / 100), 4)}px`,
                            }}
                            title={`Progress: ${progress}%`}
                          />
                        )}
                        
                        {/* Today marker line */}
                        {todayIndex >= 0 && todayIndex < days.length && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-primary/50 z-10"
                            style={{ left: `${todayIndex * DAY_WIDTH + DAY_WIDTH / 2}px` }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Right: Progress column */}
                <div className="shrink-0" style={{ width: `${PROGRESS_WIDTH}px` }}>
                  {/* Month header spacer */}
                  <div className="h-5"></div>
                  {/* Day header spacer */}
                  <div className="h-8 border-b"></div>
                  {/* Progress rows */}
                  {parsed.timeline.map((entry, i) => {
                    const progress = entry.percentage ?? 0;
                    const endVariance = getDaysDiff(entry.endDate, entry.actualEndDate);
                    return (
                      <div key={i} className="h-[52px] flex items-center justify-end pr-2">
                        <span className="text-[11px] font-semibold">{progress}%</span>
                        {endVariance !== null && (
                          <span className={`text-[10px] ml-1 font-medium ${
                            endVariance > 0 ? "text-red-500" : endVariance < 0 ? "text-green-500" : "text-muted-foreground"
                          }`}>
                            {endVariance > 0 ? `+${endVariance}d` : endVariance < 0 ? `${endVariance}d` : "on time"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {isEditing ? (
        <div className="space-y-4">
          {/* Sprint Configuration Editor */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Sprint Configuration
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Sprint Duration (weeks)</label>
                <Input
                  type="number"
                  min="1"
                  value={editSprintConfig.duration}
                  onChange={(e) => setEditSprintConfig({ ...editSprintConfig, duration: parseInt(e.target.value, 10) || 2 })}
                  placeholder="2"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project Start Date</label>
                <Input
                  type="date"
                  value={editSprintConfig.startDate || ""}
                  onChange={(e) => setEditSprintConfig({ ...editSprintConfig, startDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Active Sprint</label>
                <select
                  value={editSprintConfig.activeSprint || ""}
                  onChange={(e) => setEditSprintConfig({ ...editSprintConfig, activeSprint: e.target.value || undefined })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Not Set</option>
                  {parsed.timeline.map((t) => (
                    <option key={t.label} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Timeline Entries */}
          {editEntries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-card">
              <div className="flex-1 space-y-2">
                <Input
                  value={entry.label}
                  onChange={(e) => updateEntry(i, "label", e.target.value)}
                  placeholder="Period (e.g. Phase 1, Sprint 1)"
                  className="font-medium"
                />
                <Input
                  value={entry.description}
                  onChange={(e) => updateEntry(i, "description", e.target.value)}
                  placeholder="Description"
                  className="text-sm"
                />
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Progress %</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={entry.percentage ?? 0}
                      onChange={(e) => updateEntry(i, "percentage", e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Planned Start</label>
                    <Input
                      type="date"
                      value={entry.startDate || ""}
                      onChange={(e) => updateEntry(i, "startDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Planned End</label>
                    <Input
                      type="date"
                      value={entry.endDate || ""}
                      onChange={(e) => updateEntry(i, "endDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Actual Start</label>
                    <Input
                      type="date"
                      value={entry.actualStartDate || ""}
                      onChange={(e) => updateEntry(i, "actualStartDate", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Actual End</label>
                    <Input
                      type="date"
                      value={entry.actualEndDate || ""}
                      onChange={(e) => updateEntry(i, "actualEndDate", e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeEntry(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addEntry} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      ) : parsed.timeline.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No timeline entries defined yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {parsed.timeline.map((entry, i) => {
            const endVariance = (entry.endDate && entry.actualEndDate)
              ? Math.round((new Date(entry.actualEndDate).getTime() - new Date(entry.endDate).getTime()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <div key={i} className="flex items-start gap-4 p-5 rounded-lg border bg-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <h3 className="font-semibold text-base">{entry.label}</h3>
                    {entry.percentage !== undefined && (
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-32 h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              entry.percentage === 100 ? 'bg-green-500' : entry.percentage > 0 ? 'bg-primary' : 'bg-muted'
                            }`}
                            style={{ width: `${entry.percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-primary min-w-fit">{entry.percentage}%</span>
                      </div>
                    )}
                  </div>
                  {entry.description && <p className="text-sm text-muted-foreground mb-3">{entry.description}</p>}
                  
                  {/* Dates section */}
                  <div className="space-y-2">
                    {(entry.startDate || entry.endDate) && (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span className="font-medium min-w-fit">Planned:</span>
                        <span className="text-foreground">{entry.startDate} → {entry.endDate}</span>
                      </div>
                    )}
                    {(entry.actualStartDate || entry.actualEndDate) && (
                      <div className="flex items-center gap-3 text-sm">
                        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium min-w-fit text-muted-foreground">Actual:</span>
                        <span className="text-foreground">{entry.actualStartDate || '—'} → {entry.actualEndDate || '—'}</span>
                        {endVariance !== null && (
                          <span className={`font-medium px-2 py-1 rounded text-xs whitespace-nowrap ${
                            endVariance > 0 
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                              : endVariance < 0 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {endVariance > 0 ? `${endVariance} days behind` : endVariance < 0 ? `${Math.abs(endVariance)} days ahead` : 'On time'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border shadow-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Timeline Entry?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete <strong>"{deleteConfirm.label}"</strong>?
            </p>
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
              <p className="text-sm text-destructive font-medium">
                ⚠️ Warning: This will also delete {deleteConfirm.taskCount} associated task{deleteConfirm.taskCount !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={cancelDelete}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

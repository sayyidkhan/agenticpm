import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { serializeProject } from "~/lib/parser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { TimelineEntry, SprintConfig } from "~/types/project";
import { Calendar, Plus, X, Edit2, Save, Settings } from "lucide-react";

export function TimelineView() {
  const { parsed, setCanonicalText, saveSheet } = useProject();
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
          <Button variant="outline" size="sm" onClick={startEditing}>
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

      {/* Gantt Chart with Day Grid */}
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
        
        // Pad by a few days
        minDate.setDate(minDate.getDate() - 2);
        maxDate.setDate(maxDate.getDate() + 2);
        
        const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Generate week markers
        const weekMarkers: { date: Date; label: string; position: number }[] = [];
        const cursor = new Date(minDate);
        // Align to next Monday
        cursor.setDate(cursor.getDate() + ((8 - cursor.getDay()) % 7));
        while (cursor <= maxDate) {
          const dayOffset = Math.ceil((cursor.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
          const position = (dayOffset / totalDays) * 100;
          weekMarkers.push({
            date: new Date(cursor),
            label: `${cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
            position,
          });
          cursor.setDate(cursor.getDate() + 7);
        }
        
        const getBarPosition = (start?: string, end?: string) => {
          if (!start || !end) return null;
          const s = new Date(start);
          const e = new Date(end);
          const left = ((s.getTime() - minDate.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100;
          const width = ((e.getTime() - s.getTime()) / (maxDate.getTime() - minDate.getTime())) * 100;
          return { left: Math.max(0, left), width: Math.max(1, width) };
        };
        
        const getDaysDiff = (planned?: string, actual?: string) => {
          if (!planned || !actual) return null;
          const p = new Date(planned);
          const a = new Date(actual);
          return Math.round((a.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
        };
        
        return (
          <div className="mb-8 rounded-lg border bg-card p-4 overflow-x-auto">
            {/* Legend */}
            <div className="flex items-center gap-4 mb-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary/30 border border-primary/50"></div>
                <span className="text-muted-foreground">Planned</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary"></div>
                <span className="text-muted-foreground">Actual Progress</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span className="text-muted-foreground">On track / Ahead</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span className="text-muted-foreground">Behind schedule</span>
              </div>
            </div>
            
            <div style={{ minWidth: "600px" }}>
              {/* Week header */}
              <div className="relative h-6 mb-1 border-b">
                {weekMarkers.map((marker, i) => (
                  <div
                    key={i}
                    className="absolute text-[9px] text-muted-foreground -translate-x-1/2"
                    style={{ left: `${marker.position}%` }}
                  >
                    {marker.label}
                  </div>
                ))}
              </div>
              
              {/* Rows */}
              <div className="space-y-1">
                {parsed.timeline.map((entry, i) => {
                  const planned = getBarPosition(entry.startDate, entry.endDate);
                  const actual = getBarPosition(entry.actualStartDate, entry.actualEndDate);
                  const endVariance = getDaysDiff(entry.endDate, entry.actualEndDate);
                  const progress = entry.percentage ?? 0;
                  
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {/* Label */}
                      <div className="w-24 shrink-0 text-right pr-2">
                        <span className="text-[11px] font-medium truncate block">{entry.label}</span>
                      </div>
                      
                      {/* Chart area */}
                      <div className="flex-1 relative h-10">
                        {/* Grid lines */}
                        {weekMarkers.map((marker, j) => (
                          <div
                            key={j}
                            className="absolute top-0 bottom-0 border-l border-muted-foreground/10"
                            style={{ left: `${marker.position}%` }}
                          />
                        ))}
                        
                        {/* Planned bar */}
                        {planned && (
                          <div
                            className="absolute top-1 h-3.5 rounded bg-primary/20 border border-primary/30"
                            style={{ left: `${planned.left}%`, width: `${planned.width}%` }}
                            title={`Planned: ${entry.startDate} → ${entry.endDate}`}
                          />
                        )}
                        
                        {/* Actual bar */}
                        {actual && (
                          <div
                            className={`absolute top-5.5 h-3.5 rounded ${
                              endVariance !== null && endVariance > 0 
                                ? 'bg-red-500/80' 
                                : 'bg-green-500/80'
                            }`}
                            style={{ left: `${actual.left}%`, width: `${actual.width}%` }}
                            title={`Actual: ${entry.actualStartDate} → ${entry.actualEndDate}`}
                          >
                            {/* Progress fill inside actual bar */}
                            {progress > 0 && progress < 100 && (
                              <div
                                className="h-full rounded-l bg-white/30"
                                style={{ width: `${progress}%` }}
                              />
                            )}
                          </div>
                        )}
                        
                        {/* If no actual bar, show progress on planned bar */}
                        {!actual && planned && progress > 0 && (
                          <div
                            className="absolute top-5.5 h-3.5 rounded bg-primary"
                            style={{ left: `${planned.left}%`, width: `${planned.width * (progress / 100)}%` }}
                            title={`Progress: ${progress}%`}
                          />
                        )}
                      </div>
                      
                      {/* Progress + Variance */}
                      <div className="w-24 shrink-0 text-right">
                        <span className="text-[11px] font-semibold">{progress}%</span>
                        {endVariance !== null && (
                          <span className={`text-[10px] ml-1 font-medium ${
                            endVariance > 0 ? 'text-red-500' : endVariance < 0 ? 'text-green-500' : 'text-muted-foreground'
                          }`}>
                            {endVariance > 0 ? `+${endVariance}d` : endVariance < 0 ? `${endVariance}d` : 'on time'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
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

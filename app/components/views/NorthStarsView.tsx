import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { serializeProject } from "~/lib/parser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { NorthStarEntry } from "~/types/project";
import { Star, Plus, X, Edit2, Save } from "lucide-react";

export function NorthStarsView() {
  const { parsed, setCanonicalText, saveSheet, isReadOnly } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Record<string, NorthStarEntry[]>>({});

  if (!parsed) return null;

  const sprints = parsed.timeline;

  const startEditing = () => {
    const data: Record<string, NorthStarEntry[]> = {};
    for (const entry of sprints) {
      data[entry.label] = JSON.parse(JSON.stringify(entry.northStars || []));
    }
    setEditData(data);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
  };

  const saveChanges = async () => {
    const updated = {
      ...parsed,
      timeline: parsed.timeline.map(entry => ({
        ...entry,
        northStars: editData[entry.label]?.filter(ns => ns.person && ns.goal) || undefined,
      })).map(entry => ({
        ...entry,
        northStars: entry.northStars && entry.northStars.length > 0 ? entry.northStars : undefined,
      })),
    };
    setCanonicalText(serializeProject(updated));
    await saveSheet("timeline");
    setIsEditing(false);
  };

  const addNorthStar = (sprint: string) => {
    setEditData(prev => ({
      ...prev,
      [sprint]: [...(prev[sprint] || []), { person: "", goal: "" }],
    }));
  };

  const removeNorthStar = (sprint: string, idx: number) => {
    setEditData(prev => ({
      ...prev,
      [sprint]: (prev[sprint] || []).filter((_, i) => i !== idx),
    }));
  };

  const updateNorthStar = (sprint: string, idx: number, field: "person" | "goal", value: string) => {
    setEditData(prev => ({
      ...prev,
      [sprint]: (prev[sprint] || []).map((ns, i) =>
        i === idx ? { ...ns, [field]: value } : ns
      ),
    }));
  };

  const totalNorthStars = sprints.reduce((sum, s) => sum + (s.northStars?.length || 0), 0);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
          <h2 className="text-lg font-semibold">North Stars</h2>
          <span className="text-sm text-muted-foreground">({totalNorthStars} goals across {sprints.length} sprints)</span>
        </div>
        {!isEditing ? (
          !isReadOnly && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Edit2 className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          )
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

      {sprints.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Star className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No sprints defined yet. Add sprints in the Timeline tab first.</p>
        </div>
      ) : isEditing ? (
        <div className="space-y-6">
          {sprints.map((sprint) => {
            const entries = editData[sprint.label] || [];
            return (
              <div key={sprint.label} className="rounded-lg border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
                  <h3 className="font-semibold text-sm">{sprint.label}</h3>
                  <button
                    onClick={() => addNorthStar(sprint.label)}
                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add North Star
                  </button>
                </div>
                <div className="p-4">
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No north stars for this sprint</p>
                  ) : (
                    <div className="space-y-2">
                      {entries.map((ns, nsIdx) => (
                        <div key={nsIdx} className="flex items-center gap-2">
                          <select
                            value={ns.person}
                            onChange={(e) => updateNorthStar(sprint.label, nsIdx, "person", e.target.value)}
                            className="text-sm px-2 py-1.5 rounded-md border bg-background w-40 shrink-0"
                          >
                            <option value="">Select person</option>
                            {parsed.people.map((p) => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <Input
                            value={ns.goal}
                            onChange={(e) => updateNorthStar(sprint.label, nsIdx, "goal", e.target.value)}
                            placeholder="Key goal for this person in this sprint"
                            className="text-sm flex-1"
                          />
                          <button
                            onClick={() => removeNorthStar(sprint.label, nsIdx)}
                            className="shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {sprints.map((sprint) => {
            const entries = sprint.northStars || [];
            return (
              <div key={sprint.label} className="rounded-lg border bg-card overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 border-b">
                  <h3 className="font-semibold text-sm">{sprint.label}</h3>
                </div>
                <div className="p-4">
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No north stars defined</p>
                  ) : (
                    <div className="space-y-3">
                      {entries.map((ns, nsIdx) => (
                        <div key={nsIdx} className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-xs font-bold text-amber-700 dark:text-amber-300">
                            {ns.person.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 pt-0.5">
                            <span className="text-sm font-semibold text-foreground">{ns.person}</span>
                            <p className="text-sm text-muted-foreground leading-snug">{ns.goal}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

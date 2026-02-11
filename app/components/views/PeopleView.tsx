import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { serializeProject } from "~/lib/parser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { Person } from "~/types/project";
import { Users, Plus, X, Edit2, Save } from "lucide-react";

export function PeopleView() {
  const { parsed, setCanonicalText, saveSheet, isReadOnly } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const [editPeople, setEditPeople] = useState<Person[]>([]);

  if (!parsed) return null;

  const startEditing = () => {
    setEditPeople(JSON.parse(JSON.stringify(parsed.people)));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditPeople([]);
  };

  const saveChanges = async () => {
    const updated = { ...parsed, people: editPeople };
    setCanonicalText(serializeProject(updated));
    await saveSheet("people");
    setIsEditing(false);
  };

  const addPerson = () => {
    setEditPeople([...editPeople, { name: "", responsibilities: [] }]);
  };

  const removePerson = (index: number) => {
    setEditPeople(editPeople.filter((_, i) => i !== index));
  };

  const updatePersonName = (index: number, name: string) => {
    const copy = [...editPeople];
    copy[index] = { ...copy[index], name };
    setEditPeople(copy);
  };

  const updateResponsibilities = (index: number, value: string) => {
    const copy = [...editPeople];
    copy[index] = {
      ...copy[index],
      responsibilities: value.split(",").map((r) => r.trim()).filter(Boolean),
    };
    setEditPeople(copy);
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Team Members</h2>
          <span className="text-sm text-muted-foreground">({parsed.people.length})</span>
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

      {isEditing ? (
        <div className="space-y-3">
          {editPeople.map((person, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-card">
              <div className="flex-1 space-y-2">
                <Input
                  value={person.name}
                  onChange={(e) => updatePersonName(i, e.target.value)}
                  placeholder="Name"
                  className="font-medium"
                />
                <Input
                  value={person.responsibilities.join(", ")}
                  onChange={(e) => updateResponsibilities(i, e.target.value)}
                  placeholder="Responsibilities (comma separated)"
                  className="text-sm"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removePerson(i)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addPerson} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Person
          </Button>
        </div>
      ) : parsed.people.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No team members defined yet</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {parsed.people.map((person, i) => {
            const taskCount = parsed.tasks.filter((t) => t.assignee === person.name).length;
            return (
              <div key={i} className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{person.name}</h3>
                  <span className="text-xs text-muted-foreground">{taskCount} task{taskCount !== 1 ? "s" : ""}</span>
                </div>
                {person.responsibilities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {person.responsibilities.map((r, j) => (
                      <span key={j} className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs bg-secondary text-secondary-foreground">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

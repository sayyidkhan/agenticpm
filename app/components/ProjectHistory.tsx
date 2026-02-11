import { useState, useRef } from "react";
import { useProject } from "~/context/ProjectContext";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Plus, Trash2, Pencil, Check, X, FileSpreadsheet, Download, Upload, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

interface TabValidation {
  name: string;
  status: "ok" | "warning" | "error" | "missing";
  message: string;
}

interface UploadValidation {
  valid: boolean;
  tabs: TabValidation[];
  fileName: string;
}

export function ProjectHistory() {
  const {
    projects,
    activeFileName,
    loadProject,
    createNewProject,
    deleteProject,
    renameProject,
    refreshProjects,
  } = useProject();

  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  
  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadValidation, setUploadValidation] = useState<UploadValidation | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDownload = async (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/api/projects/${encodeURIComponent(fileName)}/download`, "_blank");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadFile(file);
    setUploadError(null);
    setIsUploading(true);
    
    try {
      // Validate first (don't save yet)
      const formData = new FormData();
      formData.append("file", file);
      formData.append("save", "false");
      
      const res = await fetch("/api/projects/upload", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.error) {
        setUploadError(data.error);
        setUploadValidation(null);
      } else {
        setUploadValidation(data.validation);
      }
    } catch (err) {
      setUploadError("Failed to process file");
    } finally {
      setIsUploading(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUploadConfirm = async () => {
    if (!uploadFile) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("save", "true");
      
      const res = await fetch("/api/projects/upload", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.error) {
        setUploadError(data.error);
      } else if (data.validation?.fileName) {
        // Success - close popup, refresh projects, load the new project
        setUploadValidation(null);
        setUploadFile(null);
        await refreshProjects();
        await loadProject(data.validation.fileName);
      }
    } catch (err) {
      setUploadError("Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadCancel = () => {
    setUploadValidation(null);
    setUploadFile(null);
    setUploadError(null);
  };

  const sorted = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const startRename = (fileName: string, currentName: string) => {
    setRenamingFile(fileName);
    setRenameValue(currentName);
  };

  const submitRename = async () => {
    if (renamingFile && renameValue.trim()) {
      await renameProject(renamingFile, renameValue.trim());
    }
    setRenamingFile(null);
    setRenameValue("");
  };

  const cancelRename = () => {
    setRenamingFile(null);
    setRenameValue("");
  };

  const handleDelete = async (fileName: string) => {
    await deleteProject(fileName);
    setConfirmDelete(null);
  };

  return (
    <div className="flex h-full flex-col w-64 min-w-[256px]">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">Projects</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Excel"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNewProject} title="New Project">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {sorted.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-muted-foreground">
              No projects yet. Use the prompt below to create one.
            </div>
          ) : (
            sorted.map((project) => {
              const isActive = project.fileName === activeFileName;
              const isRenaming = renamingFile === project.fileName;
              const isDeleting = confirmDelete === project.fileName;

              return (
                <div
                  key={project.fileName}
                  className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50"
                  }`}
                  onClick={() => {
                    if (!isRenaming && !isDeleting) {
                      loadProject(project.fileName);
                    }
                  }}
                >
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />

                  {isRenaming ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        className="h-6 text-xs px-1"
                        autoFocus
                      />
                      <button onClick={submitRename} className="text-green-600 hover:text-green-700">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : isDeleting ? (
                    <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-destructive flex-1">Delete?</span>
                      <button onClick={() => handleDelete(project.fileName)} className="text-destructive hover:text-destructive/80">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                      <span className="truncate font-medium text-sm">{project.name}</span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleDownload(project.fileName, e)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Download Excel"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => startRename(project.fileName, project.name)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Rename"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(project.fileName)}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Upload Validation Popup */}
      {(uploadValidation || uploadError || isUploading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border shadow-lg p-6 max-w-md w-full mx-4">
            {isUploading ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Processing file...</span>
              </div>
            ) : uploadError ? (
              <>
                <h3 className="text-lg font-semibold mb-3">Upload Failed</h3>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mb-4">
                  <p className="text-sm text-destructive">{uploadError}</p>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={handleUploadCancel}>Close</Button>
                </div>
              </>
            ) : uploadValidation ? (
              <>
                <h3 className="text-lg font-semibold mb-1">Upload Validation</h3>
                <p className="text-xs text-muted-foreground mb-4">{uploadFile?.name}</p>
                
                <div className="space-y-2 mb-4">
                  {uploadValidation.tabs.map((tab, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded border bg-card">
                      <div className="shrink-0 mt-0.5">
                        {tab.status === "ok" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : tab.status === "warning" ? (
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        ) : tab.status === "error" ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{tab.name}</div>
                        <div className="text-xs text-muted-foreground">{tab.message}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleUploadCancel}>
                    Cancel
                  </Button>
                  {uploadValidation.valid && (
                    <Button onClick={handleUploadConfirm} disabled={isUploading}>
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1.5" />
                      )}
                      Import
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { X, Eye, EyeOff } from "lucide-react";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setApiKey(localStorage.getItem("openai_api_key") || "");
    }
  }, [open]);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem("openai_api_key", apiKey.trim());
    } else {
      localStorage.removeItem("openai_api_key");
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">OpenAI API Key</label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Required for AI project generation. Stored in browser only.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

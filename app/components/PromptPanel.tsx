import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useProject } from "~/context/ProjectContext";
import { Send, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { validatePrompt, detectAmbiguity } from "~/lib/prompt-validation";
import { AmbiguityDialog } from "~/components/AmbiguityDialog";

export interface PromptPanelHandle {
  setPrompt: (text: string) => void;
}

export const PromptPanel = forwardRef<PromptPanelHandle>(function PromptPanel(_, ref) {
  const { createFromPrompt, updateFromPrompt, isLoading, activeFileName, parsed, isReadOnly, changeSummary, clearChangeSummary } = useProject();
  const [prompt, setPrompt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showAmbiguityDialog, setShowAmbiguityDialog] = useState(false);
  const [ambiguityQuestions, setAmbiguityQuestions] = useState<string[]>([]);
  const [ambiguityReason, setAmbiguityReason] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const executePrompt = async (text: string) => {
    setPrompt("");
    setValidationError(null);
    if (activeFileName) {
      await updateFromPrompt(text);
    } else {
      await createFromPrompt(text);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    // Validate prompt
    const validation = validatePrompt(prompt);
    if (!validation.isValid) {
      setValidationError(validation.error || "Invalid prompt");
      return;
    }

    // Check for ambiguity
    const ambiguity = detectAmbiguity(prompt, !!activeFileName);
    if (ambiguity.isAmbiguous && ambiguity.questions) {
      setPendingPrompt(prompt);
      setAmbiguityQuestions(ambiguity.questions);
      setAmbiguityReason(ambiguity.reason || "Need clarification");
      setShowAmbiguityDialog(true);
      return;
    }

    // Execute prompt
    await executePrompt(prompt);
  };

  const handleAmbiguitySubmit = async (answers: string[]) => {
    setShowAmbiguityDialog(false);
    // Augment original prompt with answers
    const augmentedPrompt = `${pendingPrompt}\n\nAdditional details:\n${answers.map((a, i) => `- ${ambiguityQuestions[i]}: ${a}`).join('\n')}`;
    await executePrompt(augmentedPrompt);
    setPendingPrompt("");
  };

  const handleAmbiguityCancel = () => {
    setShowAmbiguityDialog(false);
    setPendingPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
    // Shift+Enter allows newline (default behavior)
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setValidationError(null); // Clear error on input
  };

  // Expose setPrompt to parent components
  useImperativeHandle(ref, () => ({
    setPrompt: (text: string) => {
      setPrompt(text);
      setValidationError(null);
      // Focus textarea
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
  }), []);

  const currentSprint = parsed?.currentSprint;

  return (
    <>
      {/* Change Summary */}
      {changeSummary && (
        <div className="border-t bg-green-50 dark:bg-green-950/30 px-4 py-2.5">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-green-800 dark:text-green-300">Changes made:</span>
              <ul className="mt-1 space-y-0.5">
                {changeSummary.changes.map((change, i) => (
                  <li key={i} className="text-xs text-green-700 dark:text-green-400">• {change}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={clearChangeSummary}
              className="shrink-0 p-0.5 rounded text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t bg-background p-4">
        <div className="space-y-2">
          {/* Context Bubble - Current Sprint */}
          {currentSprint && activeFileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium w-fit">
              <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span>Context: {currentSprint}</span>
            </div>
          )}
          
          <div className="flex gap-2">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeFileName
                    ? "Update project: e.g. 'Add a DevOps engineer for CI/CD'\n(Shift+Enter for new line, Enter to send)"
                    : "Describe your project: e.g. 'Build a chat app with 3 engineers over 6 weeks'\n(Shift+Enter for new line, Enter to send)"
                }
                className="w-full min-h-[44px] max-h-[200px] rounded-lg border border-input bg-background px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading || isReadOnly}
                rows={1}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || isReadOnly || !prompt.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors mt-auto"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          {validationError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{validationError}</span>
            </div>
          )}
        </div>
      </form>

      <AmbiguityDialog
        isOpen={showAmbiguityDialog}
        questions={ambiguityQuestions}
        reason={ambiguityReason}
        onSubmit={handleAmbiguitySubmit}
        onCancel={handleAmbiguityCancel}
      />
    </>
  );
});

import { useProject } from "~/context/ProjectContext";

export function TextEditorView() {
  const { canonicalText, setCanonicalText, isReadOnly } = useProject();

  return (
    <div className="h-full p-4">
      <textarea
        value={canonicalText}
        onChange={(e) => setCanonicalText(e.target.value)}
        className="h-full w-full resize-none rounded-lg border border-input bg-background p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Your project text will appear here..."
        spellCheck={false}
        readOnly={isReadOnly}
      />
    </div>
  );
}

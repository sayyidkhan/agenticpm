import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { X, AlertCircle } from "lucide-react";

interface AmbiguityDialogProps {
  isOpen: boolean;
  questions: string[];
  reason: string;
  onSubmit: (answers: string[]) => void;
  onCancel: () => void;
}

export function AmbiguityDialog({ isOpen, questions, reason, onSubmit, onCancel }: AmbiguityDialogProps) {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Filter out empty answers
    const validAnswers = answers.filter(a => a.trim());
    if (validAnswers.length > 0) {
      onSubmit(validAnswers);
      setAnswers(questions.map(() => "")); // Reset
    }
  };

  const updateAnswer = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const hasAtLeastOneAnswer = answers.some(a => a.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold">Need More Information</h2>
              <p className="text-sm text-muted-foreground mt-1">{reason}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {questions.map((question, index) => (
              <div key={index}>
                <label className="text-sm font-medium mb-1.5 block">
                  {question}
                </label>
                <Input
                  value={answers[index]}
                  onChange={(e) => updateAnswer(index, e.target.value)}
                  placeholder="Your answer..."
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!hasAtLeastOneAnswer}>
              Continue
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

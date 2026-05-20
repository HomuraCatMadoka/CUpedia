import { diffLines, Change } from "diff";

export function RevisionDiff({
  oldText,
  newText,
  oldLabel,
  newLabel,
}: {
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}) {
  const changes: Change[] = diffLines(oldText, newText);

  return (
    <div className="overflow-x-auto rounded border">
      <div className="flex gap-4 border-b bg-gray-50 px-4 py-2 text-xs text-muted-foreground">
        <span className="text-red-600">{oldLabel}</span>
        <span className="text-green-600">{newLabel}</span>
      </div>
      <pre className="p-4 text-sm">
        {changes.map((change, i) => (
          <span
            key={i}
            className={
              change.added
                ? "bg-green-100 text-green-800"
                : change.removed
                  ? "bg-red-100 text-red-800"
                  : ""
            }
          >
            {change.value}
          </span>
        ))}
      </pre>
    </div>
  );
}

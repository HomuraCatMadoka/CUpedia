import "./canteen.css";

export function CanteenTheme({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="canteen-zone min-h-full min-w-0 flex-1"
      style={
        {
          ["--background" as string]: "var(--canteen-rice)",
          ["--foreground" as string]: "var(--canteen-ink)",
          ["--muted" as string]: "var(--canteen-tray)",
          ["--muted-foreground" as string]: "var(--canteen-muted)",
          ["--border" as string]: "var(--canteen-line)",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

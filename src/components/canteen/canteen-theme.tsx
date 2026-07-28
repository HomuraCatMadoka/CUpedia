import "./canteen.css";

export function CanteenTheme({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="canteen-zone min-h-full min-w-0 flex-1 overflow-x-clip"
      style={
        {
          ["--font-canteen-body" as string]: "var(--font-sans)",
          ["--font-canteen-display" as string]:
            "var(--font-canteen-body), system-ui, sans-serif",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

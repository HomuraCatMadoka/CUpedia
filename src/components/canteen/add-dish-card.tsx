// ==========================================================================
// AddDishCard — dashed-border ghost card at end of dish grid
// ==========================================================================

export function AddDishCard() {
  return (
    <div className="flex cursor-default flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-card p-6 transition-colors hover:border-muted-foreground/50 hover:bg-muted/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <span className="mt-3 text-sm font-medium text-muted-foreground">
        添加菜品
      </span>
      <span className="mt-0.5 text-xs text-muted-foreground">
        提交新菜品需审核
      </span>
    </div>
  );
}

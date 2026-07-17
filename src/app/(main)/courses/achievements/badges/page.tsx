import {
  PROFESSIONAL_BADGE_TIERS,
  ProfessionalBadgeLogo,
  type ProfessionalBadgeTier,
} from "@/components/courses/professional-badge-logo";

const PREVIEW_CODES: Record<ProfessionalBadgeTier, string> = {
  bronze: "MATH",
  silver: "CSCI",
  gold: "IBBA",
};

const TIER_LABELS: Record<ProfessionalBadgeTier, string> = {
  bronze: "铜标",
  silver: "银标",
  gold: "金标",
};

export default function ProfessionalBadgePreviewPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Achievement system
          </p>
          <h1 className="mt-2 text-2xl font-bold">专业标视觉预览</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            专业代码固定为四位大写英文字母。
          </p>
        </div>

        <section aria-labelledby="badge-tier-preview" className="mt-10">
          <h2
            className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"
            id="badge-tier-preview"
          >
            等级预览
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {PROFESSIONAL_BADGE_TIERS.map((tier) => (
              <div
                className="flex min-h-44 flex-col items-center justify-center rounded-2xl border bg-card px-6 py-7"
                key={tier}
              >
                <ProfessionalBadgeLogo
                  code={PREVIEW_CODES[tier]}
                  size={88}
                  tier={tier}
                />
                <p className="mt-4 text-sm font-medium">
                  {PREVIEW_CODES[tier]} · {TIER_LABELS[tier]}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="badge-size-preview" className="mt-8">
          <h2
            className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase"
            id="badge-size-preview"
          >
            实际尺寸
          </h2>
          <div className="mt-3 flex flex-wrap items-end gap-8 rounded-2xl border bg-card p-6">
            <SizePreview label="署名评论 · 28px" size={28} />
            <SizePreview label="称号列表 · 48px" size={48} />
            <SizePreview label="公开橱窗 · 88px" size={88} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SizePreview({ label, size }: { label: string; size: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <ProfessionalBadgeLogo code="MATH" size={size} tier="gold" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

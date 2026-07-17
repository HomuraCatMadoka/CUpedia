import { AchievementRuleForm } from "@/components/admin/achievement-rule-form";
import { getProfessionalAchievementRules } from "@/lib/achievement-actions";

export default async function AdminAchievementRulesPage() {
  const rules = await getProfessionalAchievementRules();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-medium">专业成就规则</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          规则保存在数据库中；支持学科组组合、等级和前置称号。
        </p>
      </div>
      <AchievementRuleForm />
      <section aria-labelledby="achievement-rule-list">
        <h2 className="text-sm font-medium" id="achievement-rule-list">
          已有版本
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border">
          {rules.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">尚无规则</p>
          ) : (
            <ul className="divide-y">
              {rules.map((rule) => (
                <li
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-sm"
                  key={rule.id}
                >
                  <span className="font-medium">{rule.displayName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {rule.badgeCode}
                  </span>
                  <span className="text-muted-foreground">
                    v{rule.version} · {rule.tier} · {rule.requiredCount} 门 ·{" "}
                    {rule.subjectGroups
                      .map(
                        (group) =>
                          `${group.subjectCodes.join("/")}:${group.requiredCount}`,
                      )
                      .join(" + ") ||
                      `${rule.subjectCodes.join("/")}:${rule.requiredCount}`}
                  </span>
                  <span
                    className={
                      rule.enabled
                        ? "text-emerald-700"
                        : "text-muted-foreground"
                    }
                  >
                    {rule.enabled ? "已启用" : "未启用"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

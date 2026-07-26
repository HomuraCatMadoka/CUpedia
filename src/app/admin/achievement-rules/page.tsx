import { AchievementCatalogImport } from "@/components/admin/achievement-catalog-import";
import { AchievementCatalogStatusButton } from "@/components/admin/achievement-catalog-status-button";
import { AchievementRuleForm } from "@/components/admin/achievement-rule-form";
import { PersonTitleCatalogImport } from "@/components/admin/person-title-catalog-import";
import { PersonTitleRecipeForm } from "@/components/admin/person-title-recipe-form";
import personTitleCatalog from "@/data/person-title-catalog.v1.json";
import { getPersonTitleRecipes } from "@/lib/achievement-fusion-actions";
import { getAchievementCatalogs } from "@/lib/achievement-catalog-actions";
import { getProfessionalAchievementRules } from "@/lib/achievement-actions";

export default async function AdminAchievementRulesPage() {
  const [rules, catalogs, personRecipes] = await Promise.all([
    getProfessionalAchievementRules(),
    getAchievementCatalogs(),
    getPersonTitleRecipes(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-medium">专业成就规则</h1>
      <AchievementCatalogImport />
      <section aria-labelledby="achievement-catalog-list">
        <h2 className="text-sm font-medium" id="achievement-catalog-list">
          目录版本
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border">
          {catalogs.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">尚未发布目录</p>
          ) : (
            <ul className="divide-y">
              {catalogs.map((catalog) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
                  key={catalog.id}
                >
                  <div>
                    <p className="font-medium">
                      v{catalog.version} · {catalog.sourceLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {catalog.programmeCount} 个专业 · {catalog.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {catalog.status !== "active" && (
                      <AchievementCatalogStatusButton
                        catalogId={catalog.id}
                        nextStatus="active"
                      />
                    )}
                    {catalog.status === "active" && (
                      <AchievementCatalogStatusButton
                        catalogId={catalog.id}
                        nextStatus="disabled"
                      />
                    )}
                    {catalog.status === "disabled" && (
                      <AchievementCatalogStatusButton
                        catalogId={catalog.id}
                        nextStatus="superseded"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <AchievementRuleForm />
      <PersonTitleCatalogImport
        initialJson={JSON.stringify(personTitleCatalog, null, 2)}
      />
      <PersonTitleRecipeForm />
      <section aria-labelledby="person-title-recipe-list">
        <h2 className="text-sm font-medium" id="person-title-recipe-list">
          人名称号配方版本
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border">
          {personRecipes.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">尚无配方</p>
          ) : (
            <ul className="divide-y">
              {personRecipes.map((recipe) => (
                <li
                  className="flex flex-wrap gap-3 px-5 py-4 text-sm"
                  key={recipe.id}
                >
                  <span className="font-medium">{recipe.displayName}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {recipe.badgeCode}
                  </span>
                  <span className="text-muted-foreground">
                    v{recipe.version} · {recipe.kind} ·{" "}
                    {recipe.sourceRuleKeys.join(" + ")}
                  </span>
                  <span>{recipe.enabled ? "已启用" : "未启用"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
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

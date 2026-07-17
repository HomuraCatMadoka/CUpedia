"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPersonTitleRecipe } from "@/lib/achievement-fusion-actions";

export function PersonTitleRecipeForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await createPersonTitleRecipe({
          recipeKey: String(formData.get("recipeKey") ?? ""),
          version: Number(formData.get("version")),
          kind: String(formData.get("kind")) as
            | "dual_bronze"
            | "same_profession_gold",
          displayName: String(formData.get("displayName") ?? ""),
          description: String(formData.get("description") ?? ""),
          badgeCode: String(formData.get("badgeCode") ?? ""),
          sourceRuleKeys: String(formData.get("sourceRuleKeys") ?? "")
            .split("+")
            .map((key) => key.trim())
            .filter(Boolean),
          enabled: formData.get("enabled") === "on",
        });
        setMessage("配方已保存");
        router.refresh();
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "保存失败");
      }
    });
  }

  return (
    <form
      action={submit}
      className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
    >
      <h2 className="text-sm font-medium sm:col-span-2">人名称号配方</h2>
      <Field label="配方标识" name="recipeKey" placeholder="newton" required />
      <Field
        label="版本"
        name="version"
        type="number"
        defaultValue="1"
        required
      />
      <Field label="称号名称" name="displayName" placeholder="牛顿" required />
      <Field
        label="四位称号代码"
        name="badgeCode"
        placeholder="NEWT"
        required
      />
      <div>
        <Label htmlFor="person-title-kind">配方类型</Label>
        <select
          className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          id="person-title-kind"
          name="kind"
        >
          <option value="dual_bronze">两个不同铜标</option>
          <option value="same_profession_gold">同专业金标转换</option>
        </select>
      </div>
      <Field
        label="来源规则标识"
        name="sourceRuleKeys"
        placeholder="math-bronze + phys-bronze"
        required
      />
      <Field
        label="公开说明"
        name="description"
        placeholder="由数学与物理铜标合成"
      />
      <label className="flex items-center gap-2 self-end text-sm">
        <input className="size-4" name="enabled" type="checkbox" />
        保存后立即启用
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? "保存中…" : "保存配方"}
        </Button>
        {message && (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: { label: string; name: string } & React.ComponentProps<typeof Input>) {
  const id = `person-title-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input className="mt-1" id={id} name={name} {...props} />
    </div>
  );
}

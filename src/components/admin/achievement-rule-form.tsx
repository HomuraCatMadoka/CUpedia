"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProfessionalAchievementRule } from "@/lib/achievement-actions";

export function AchievementRuleForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function submit(formData: FormData) {
    setMessage("");
    startTransition(async () => {
      try {
        await createProfessionalAchievementRule({
          ruleKey: String(formData.get("ruleKey") ?? ""),
          version: Number(formData.get("version")),
          displayName: String(formData.get("displayName") ?? ""),
          description: String(formData.get("description") ?? ""),
          badgeCode: String(formData.get("badgeCode") ?? ""),
          subjectCodes: String(formData.get("subjectCodes") ?? "")
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean),
          requiredCount: Number(formData.get("requiredCount")),
          enabled: formData.get("enabled") === "on",
        });
        setMessage("规则已保存");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  return (
    <form
      action={submit}
      className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
    >
      <Field
        label="规则标识"
        name="ruleKey"
        placeholder="math-bronze"
        required
      />
      <Field
        label="版本"
        name="version"
        type="number"
        defaultValue="1"
        required
      />
      <Field
        label="称号名称"
        name="displayName"
        placeholder="数学铜标"
        required
      />
      <Field
        label="四位专业代码"
        name="badgeCode"
        placeholder="MATH"
        required
      />
      <Field
        label="学科代码（逗号分隔）"
        name="subjectCodes"
        placeholder="MATH"
        required
      />
      <Field
        label="需要课程数"
        name="requiredCount"
        type="number"
        defaultValue="4"
        required
      />
      <div className="sm:col-span-2">
        <Label htmlFor="achievement-description">说明</Label>
        <Textarea
          id="achievement-description"
          name="description"
          className="mt-1"
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input className="size-4" name="enabled" type="checkbox" />
        保存后立即启用（会停用同一规则标识的旧版本）
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? "保存中…" : "保存规则"}
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
  const id = `achievement-${name}`;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} className="mt-1" {...props} />
    </div>
  );
}

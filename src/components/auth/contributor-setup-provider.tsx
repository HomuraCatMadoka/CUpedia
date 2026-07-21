"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MissingContributorSetup } from "@/lib/contributor-account";

type SetupContext = {
  ensureContributorSetup: () => Promise<boolean>;
};

const ContributorSetupContext = createContext<SetupContext>({
  ensureContributorSetup: async () => true,
});

export function ContributorSetupProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [needs, setNeeds] = useState<MissingContributorSetup | null>(null);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<Array<(complete: boolean) => void>>([]);
  const knownComplete = useRef(false);
  const statusCheck = useRef<Promise<{
    complete: boolean;
    needs: MissingContributorSetup;
  }> | null>(null);

  const finishPending = useCallback((complete: boolean) => {
    for (const resolve of pending.current.splice(0)) resolve(complete);
  }, []);

  const ensureContributorSetup = useCallback(async () => {
    if (knownComplete.current) return true;
    try {
      if (!statusCheck.current) {
        statusCheck.current = (async () => {
          const response = await fetch("/api/auth/account-setup");
          if (!response.ok) throw new Error("ACCOUNT_SETUP_STATUS_FAILED");
          return (await response.json()) as {
            complete: boolean;
            needs: MissingContributorSetup;
          };
        })().finally(() => {
          statusCheck.current = null;
        });
      }
      const result = await statusCheck.current;
      if (knownComplete.current) return true;
      if (result.complete) {
        knownComplete.current = true;
        return true;
      }
      setNeeds(result.needs);
      setError("");
      return new Promise<boolean>((resolve) => pending.current.push(resolve));
    } catch {
      return false;
    }
  }, []);

  const saveSetup = async () => {
    if (!needs) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/account-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(needs.nickname ? { nickname } : {}),
          ...(needs.password ? { password } : {}),
        }),
      });
      const result = (await response.json()) as {
        complete?: boolean;
        needs?: MissingContributorSetup;
        error?: string;
      };
      if (!response.ok || !result.complete) {
        if (result.needs) setNeeds(result.needs);
        setError(result.error ?? "账户资料尚未完善，请重试");
        return;
      }
      knownComplete.current = true;
      setNeeds(null);
      setNickname("");
      setPassword("");
      setConfirmation("");
      finishPending(true);
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (needs?.password && password !== confirmation) {
      setError("两次输入的密码不一致");
      return;
    }
    await saveSetup();
  };

  return (
    <ContributorSetupContext.Provider value={{ ensureContributorSetup }}>
      {children}
      {needs && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contributor-setup-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <form
            onSubmit={submit}
            className="w-full max-w-md space-y-4 rounded-xl border bg-background p-6 shadow-xl"
          >
            <div>
              <h2
                id="contributor-setup-title"
                className="text-lg font-semibold"
              >
                完善账户后继续
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                发布署名内容前，需要补全昵称和登录密码。你正在编辑的内容会保留。
              </p>
            </div>
            {needs.nickname && (
              <div className="space-y-2">
                <Label htmlFor="contributor-nickname">昵称</Label>
                <Input
                  id="contributor-nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  autoComplete="nickname"
                  required
                />
              </div>
            )}
            {needs.password && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="contributor-password">新密码</Label>
                  <Input
                    id="contributor-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contributor-password-confirmation">
                    确认新密码
                  </Label>
                  <Input
                    id="contributor-password-confirmation"
                    type="password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </div>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNeeds(null);
                  finishPending(false);
                }}
              >
                稍后再说
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "保存中…" : "完成并继续"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </ContributorSetupContext.Provider>
  );
}

export function useContributorSetup() {
  return useContext(ContributorSetupContext);
}

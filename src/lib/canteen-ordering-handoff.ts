import type { CanteenOrderingHandoffProvider } from "@/db/schema";

const EPHEMERAL_PARAMS = new Set([
  "sessionuuid",
  "orderid",
  "order_id",
  "paymentid",
  "payment_id",
  "token",
]);

export type OrderingHandoff = {
  provider: CanteenOrderingHandoffProvider;
  url: string;
};

export function parseOrderingHandoffUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000) {
    throw new Error("INVALID_ORDERING_HANDOFF_URL");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("INVALID_ORDERING_HANDOFF_URL");
  }
  if (url.protocol !== "https:")
    throw new Error("INSECURE_ORDERING_HANDOFF_URL");
  for (const key of url.searchParams.keys()) {
    if (EPHEMERAL_PARAMS.has(key.toLowerCase())) {
      throw new Error("EPHEMERAL_ORDERING_HANDOFF_URL");
    }
  }
  return url.toString();
}

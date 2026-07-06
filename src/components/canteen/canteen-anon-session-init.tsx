"use client";

import { useEffect } from "react";
import { ensureCanteenAnonSession } from "@/lib/canteen-vote-actions";

/** Issues signed anonymous session cookie on first /canteen visit (client-invoked server action). */
export function CanteenAnonSessionInit() {
  useEffect(() => {
    void ensureCanteenAnonSession();
  }, []);
  return null;
}

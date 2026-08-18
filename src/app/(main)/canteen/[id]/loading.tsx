/**
 * Instant Suspense fallback for force-dynamic canteen detail.
 * Without this, soft-nav waits for the page shell before updating the UI.
 */
import { CanteenMenuSkeleton } from "@/components/canteen/canteen-menu-skeleton";

export default function Loading() {
  return <CanteenMenuSkeleton includePageChrome />;
}

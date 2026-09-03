export async function discardCampusMapPlacePhotos(
  assetIds: readonly string[],
): Promise<void> {
  if (assetIds.length === 0) return;
  const response = await fetch("/api/campus-map/place-photos", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assetIds }),
    keepalive: true,
  });
  if (!response.ok) throw new Error("photo-discard-failed");
}

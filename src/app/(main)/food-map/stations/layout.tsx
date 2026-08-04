import "maplibre-gl/dist/maplibre-gl.css";

export default function FoodMapStationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://tiles.openfreemap.org" />
      {children}
    </>
  );
}

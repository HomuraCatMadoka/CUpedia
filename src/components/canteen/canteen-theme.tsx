import { Noto_Sans_SC } from "next/font/google";
import "./canteen.css";

/** Single cold sans stack — display uses heavier weight, not warm serif. */
const canteenSans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-canteen-body",
});

export function CanteenTheme({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`canteen-zone ${canteenSans.variable} min-h-full flex-1`}
      style={
        {
          ["--font-canteen-display" as string]:
            "var(--font-canteen-body), system-ui, sans-serif",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

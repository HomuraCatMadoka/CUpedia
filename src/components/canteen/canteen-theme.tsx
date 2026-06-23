import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./canteen.css";

const canteenDisplay = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-canteen-display",
});

const canteenBody = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-canteen-body",
});

export function CanteenTheme({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`canteen-zone ${canteenDisplay.variable} ${canteenBody.variable} min-h-full flex-1`}
    >
      {children}
    </div>
  );
}

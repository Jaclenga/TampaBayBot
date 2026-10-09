import type { Metadata } from "next";
import HousingHelpPage from "@/components/housing-help";

export const metadata: Metadata = { title: "Housing help | TampaBayBot" };

export default function HousingHelp() {
  return <HousingHelpPage />;
}

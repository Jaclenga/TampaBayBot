import type { Metadata } from "next";
import HousingHelpPage from "@/components/housing-help";

export const metadata: Metadata = { title: "Housing help | TampaBayBot" };

export default function HousingHelp() {
  // Serialize one server timestamp so hydration uses the same review status.
  // eslint-disable-next-line react-hooks/purity -- This server component shares its timestamp with the client through RSC props.
  const referenceTime = Date.now();
  return <HousingHelpPage referenceTime={referenceTime} />;
}

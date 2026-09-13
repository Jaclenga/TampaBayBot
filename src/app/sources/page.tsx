import type { Metadata } from "next";
import SourcesContent from "@/components/sources-content";
import { sources } from "@/lib/corpus";
export const metadata: Metadata = { title: "Public sources | TampaBayBot" };
export default function Sources() { return <SourcesContent sources={sources} />; }

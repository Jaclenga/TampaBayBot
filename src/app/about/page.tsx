import type { Metadata } from "next";
import AboutContent from "@/components/about-content";
import { getModelNotice } from "@/lib/llm-settings";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "About | TampaBayBot" };
export default function About() { return <AboutContent modelNotice={getModelNotice()} />; }

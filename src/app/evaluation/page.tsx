import type { Metadata } from "next";
import EvaluationContent from "@/components/evaluation-content";
import result from "@/evaluation/results/latest.json";
import suiteReport from "@/evaluation/suite/results/latest.json";
import agentReview from "@/evaluation/agent-audit/responses.json";
export const metadata: Metadata = { title: "Evaluation results | TampaBayBot" };
export default function Evaluation() {
  const { mode, automatedQuality, completedAt, summary } = suiteReport;
  return <EvaluationContent result={result} suiteReport={{ mode, automatedQuality, completedAt, summary }} agentReviewCount={agentReview.length} />;
}

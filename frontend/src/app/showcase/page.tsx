import type { Metadata } from "next";
import { ShowcaseView } from "./showcase-view";

export const metadata: Metadata = {
  title: "LoadTruth | The Load Disappears. The Evidence Shouldn't.",
  description:
    "Turn disaster-haul video into evidence-backed load tickets using Meta SAM 3.1 and Muse Spark 1.3.",
};

export const dynamic = "force-static";
export const revalidate = false;

export default function ShowcasePage() {
  return <ShowcaseView />;
}

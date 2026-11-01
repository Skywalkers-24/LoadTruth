import type { Metadata } from "next";
import { ThumbnailView } from "./thumbnail-view";

export const metadata: Metadata = {
  title: "Thumbnail · LoadTruth",
  description: "LoadTruth clean video thumbnail view.",
};

export const dynamic = "force-static";
export const revalidate = false;

export default function ThumbnailPage() {
  return <ThumbnailView />;
}

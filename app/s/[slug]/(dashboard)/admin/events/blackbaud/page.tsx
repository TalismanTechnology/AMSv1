import { redirect } from "next/navigation";

// Synced events used to wait here for review. They now publish straight onto
// the calendar under their label, managed from the Events page.
export default async function BlackbaudReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/admin/events`);
}

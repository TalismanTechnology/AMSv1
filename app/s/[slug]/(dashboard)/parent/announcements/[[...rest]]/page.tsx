import { redirect } from "next/navigation";

// Announcements were removed; old links and bookmarks land on the dashboard.
export default async function ParentAnnouncementsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/parent`);
}

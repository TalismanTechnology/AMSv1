import { redirect } from "next/navigation";

// Chat is the parent home page.
export default async function ParentHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/parent/chat`);
}

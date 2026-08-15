import { TopicDetailLoader } from "@/components/topic-detail-loader";

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TopicDetailLoader id={id} />;
}

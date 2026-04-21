import { RagHomePage } from "@/components/rag/rag-home-page";

type ChatRoutePageProps = {
  params: Promise<{ chatId: string }>;
};

export default async function ChatRoutePage({ params }: ChatRoutePageProps) {
  const { chatId } = await params;
  return <RagHomePage routeChatId={chatId} />;
}

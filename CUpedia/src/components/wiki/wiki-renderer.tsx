import { renderMarkdown } from "@/lib/markdown";

export async function WikiRenderer({ content }: { content: string }) {
  const html = await renderMarkdown(content);
  return (
    <article
      className="prose prose-stone max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

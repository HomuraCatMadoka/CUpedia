import Link from "next/link";

type Backlink = { slug: string; title: string };

export function Backlinks({ links }: { links: Backlink[] }) {
  if (links.length === 0) return null;

  return (
    <section className="mt-8 border-t pt-6" aria-label="反向链接">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        链接到本页
      </h2>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={`/wiki/${link.slug}`}
              className="text-sm text-primary underline decoration-primary underline-offset-4"
            >
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

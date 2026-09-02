export type OfficialPdfLinkDescriptor = {
  linkText: string;
  sourceId: string;
};

function normalizeHtmlText(value: string) {
  return value
    .replace(/&nbsp;|&#0*160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the current PDF URLs from the labels maintained on CUHK's homepage. */
export function discoverOfficialPdfUrls(
  html: string,
  descriptors: OfficialPdfLinkDescriptor[],
  baseUrl: string,
) {
  const anchors = [
    ...html.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi),
  ].map((match) => ({
    href: normalizeHtmlText(match[2] ?? ""),
    text: normalizeHtmlText(match[3] ?? "").toLocaleLowerCase("en"),
  }));

  return descriptors.flatMap((descriptor) => {
    const wanted = normalizeHtmlText(descriptor.linkText).toLocaleLowerCase(
      "en",
    );
    const matchingAnchors = anchors.filter((candidate) =>
      candidate.text.includes(wanted),
    );
    const anchor =
      matchingAnchors.find((candidate) =>
        new URL(candidate.href, baseUrl).pathname
          .toLocaleLowerCase("en")
          .endsWith(".pdf"),
      ) ?? matchingAnchors[0];
    if (!anchor) return [];
    return [
      {
        sourceId: descriptor.sourceId,
        url: new URL(anchor.href, baseUrl).href,
      },
    ];
  });
}

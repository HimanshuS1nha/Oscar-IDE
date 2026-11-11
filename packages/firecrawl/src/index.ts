/**
 * Web search and page reading through Firecrawl, for the AI's web tools.
 * Server only: the client reads FIRECRAWL_API_KEY from the environment.
 */
import Firecrawl, { type Document, type SearchResultWeb } from "firecrawl";

export { SdkError as FirecrawlError } from "firecrawl";

let client: Firecrawl | undefined;

/** Created on first use, so it sees the env loaded at startup (dotenv). */
const getClient = () => (client ??= new Firecrawl());

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

/** A search result is a `Document` instead when the search also scraped it. */
const toSearchResult = (
  item: SearchResultWeb | Document,
): WebSearchResult | null => {
  if ("metadata" in item || !("url" in item)) {
    const document = item as Document;
    const url = document.metadata?.url ?? document.metadata?.sourceURL;
    if (!url) return null;
    return {
      title: document.metadata?.title ?? url,
      url,
      snippet: document.metadata?.description ?? "",
    };
  }
  return {
    title: item.title ?? item.url,
    url: item.url,
    snippet: item.description ?? "",
  };
};

/** Searches the web. `includeDomains` limits results to those sites. */
export const searchWeb = async ({
  query,
  limit,
  includeDomains,
}: {
  query: string;
  limit: number;
  includeDomains?: string[];
}): Promise<WebSearchResult[]> => {
  const data = await getClient().search(query, {
    sources: ["web"],
    limit,
    ...(includeDomains?.length ? { includeDomains } : {}),
  });
  return (data.web ?? []).flatMap((item) => toSearchResult(item) ?? []);
};

export type WebPage = {
  /** Where the page ended up, after redirects. */
  url: string;
  title: string | null;
  /** The page's main content as Markdown. */
  markdown: string;
  /** The HTTP status the site answered with, when known. */
  statusCode: number | null;
};

/** Reads one page's main content (no navigation, footers or ads) as Markdown. */
export const fetchPage = async (url: string): Promise<WebPage> => {
  const document = await getClient().scrape(url, {
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const metadata = document.metadata;
  return {
    url: metadata?.url ?? metadata?.sourceURL ?? url,
    title: metadata?.title ?? null,
    markdown: document.markdown ?? "",
    statusCode: metadata?.statusCode ?? null,
  };
};

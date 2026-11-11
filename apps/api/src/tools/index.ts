import { fetchPage, searchWeb } from "@oscar/firecrawl";
import { webFetchTool, webSearchTool } from "@oscar/ai/tools";

/**
 * The AI's tools that run here on the server, through Firecrawl. Errors
 * thrown here go to the model as the tool's result.
 */

const DEFAULT_SEARCH_RESULTS = 5;

/** Characters of a page given to the model; the rest is cut. */
const MAX_PAGE_CHARS = 50_000;

export const webSearch = webSearchTool.server(
  async ({ query, maxResults, allowedDomains }) => ({
    results: await searchWeb({
      query,
      limit: maxResults ?? DEFAULT_SEARCH_RESULTS,
      includeDomains: allowedDomains,
    }),
  }),
);

export const webFetch = webFetchTool.server(async ({ url }) => {
  const { protocol } = new URL(url);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(
      `Only http and https pages can be fetched, not ${protocol}`,
    );
  }

  const page = await fetchPage(url);
  if (page.statusCode !== null && page.statusCode >= 400) {
    throw new Error(`${page.url} answered with HTTP ${page.statusCode}.`);
  }

  const truncated = page.markdown.length > MAX_PAGE_CHARS;
  return {
    url: page.url,
    title: page.title,
    content: truncated
      ? `${page.markdown.slice(0, MAX_PAGE_CHARS)}\n\n[… page cut …]`
      : page.markdown,
    truncated,
  };
});

export const SERVER_TOOLS = [webSearch, webFetch] as const;

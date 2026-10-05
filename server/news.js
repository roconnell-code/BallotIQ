const FEEDS = [
  { source: "NPR", url: "https://feeds.npr.org/1003/rss.xml" },
  { source: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/politics" },
  { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/US.xml" },
];

const PER_SOURCE = 4;
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, payload: null };

function decode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : "";
}

function parseItems(xml) {
  const items = [];
  const pattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match = pattern.exec(xml);
  while (match) {
    const block = match[1];
    const title = tag(block, "title");
    const url = tag(block, "link");
    const published = tag(block, "pubDate");
    let summary = tag(block, "description");
    if (summary.toLowerCase() === title.toLowerCase()) summary = "";
    if (summary && summary[0] === summary[0].toLowerCase()) summary = "";
    if (summary.length > 180) summary = `${summary.slice(0, 177).trim()}…`;
    if (title && url.startsWith("http")) items.push({ title, url, published, summary });
    match = pattern.exec(xml);
  }
  return items;
}

async function loadFeed(feed) {
  const response = await fetch(feed.url, {
    headers: { "User-Agent": "BallotIQ/1.0 (election reading guide)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${feed.source} ${response.status}`);
  const xml = await response.text();
  return parseItems(xml).slice(0, PER_SOURCE).map((item) => ({ ...item, source: feed.source }));
}

export async function getNews() {
  if (cache.payload && Date.now() - cache.at < CACHE_MS) return cache.payload;
  const settled = await Promise.allSettled(FEEDS.map(loadFeed));
  const stories = settled
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  if (!stories.length) {
    const reason = settled.find((result) => result.status === "rejected");
    throw new Error(reason?.reason?.message || "No headlines");
  }
  const payload = {
    updated: new Date().toISOString(),
    sources: FEEDS.map((feed) => feed.source),
    stories,
  };
  cache = { at: Date.now(), payload };
  return payload;
}

function attach(middlewares) {
  middlewares.use(async (req, res, next) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/news") return next();
    try {
      const payload = await getNews();
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    } catch (error) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "The news feeds did not load." }));
    }
  });
}

export function newsApiPlugin() {
  return {
    name: "ballotiq-news",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

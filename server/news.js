const TOPICS = {
  breaking: {
    label: "Breaking news",
    feeds: [
      { source: "NPR", url: "https://feeds.npr.org/1002/rss.xml" },
      { source: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/headlines" },
      { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
    ],
  },
  economy: {
    label: "Economy",
    feeds: [
      { source: "NPR", url: "https://feeds.npr.org/1017/rss.xml" },
      { source: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/economy" },
      { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml" },
    ],
  },
  foreign: {
    label: "Foreign relations",
    feeds: [
      { source: "NPR", url: "https://feeds.npr.org/1004/rss.xml" },
      { source: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/world" },
      { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    ],
  },
  trump: {
    label: "Trump",
    match: /\btrump\b/i,
    feeds: [
      { source: "NPR", url: "https://feeds.npr.org/1014/rss.xml" },
      { source: "PBS NewsHour", url: "https://www.pbs.org/newshour/feeds/rss/politics" },
      { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml" },
    ],
  },
};

const POPULAR_FEED = {
  source: "The New York Times",
  url: "https://rss.nytimes.com/services/xml/rss/nyt/MostViewed.xml",
};

export const NEWS_TOPICS = Object.entries(TOPICS).map(([id, topic]) => ({ id, label: topic.label }));

const PER_SOURCE = 4;
const CACHE_MS = 10 * 60 * 1000;

const topicCache = new Map();
let popularCache = { at: 0, story: null };

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

async function loadFeed(feed, limit) {
  const response = await fetch(feed.url, {
    headers: { "User-Agent": "BallotIQ/1.0 (election reading guide)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${feed.source} ${response.status}`);
  const xml = await response.text();
  return parseItems(xml).slice(0, limit).map((item) => ({ ...item, source: feed.source }));
}

async function getPopular() {
  if (popularCache.story && Date.now() - popularCache.at < CACHE_MS) return popularCache.story;
  try {
    const [story] = await loadFeed(POPULAR_FEED, 1);
    if (!story) return null;
    popularCache = { at: Date.now(), story };
    return story;
  } catch {
    return popularCache.story;
  }
}

export async function getNews(topicId) {
  const topic = TOPICS[topicId] ? topicId : "breaking";
  const cached = topicCache.get(topic);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.payload;

  const spec = TOPICS[topic];
  const limit = spec.match ? 30 : PER_SOURCE;
  const settled = await Promise.allSettled(spec.feeds.map((feed) => loadFeed(feed, limit)));
  let stories = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (spec.match) {
    stories = stories.filter((story) => spec.match.test(`${story.title} ${story.summary}`)).slice(0, 12);
  }
  stories.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  const popular = await getPopular();
  if (!stories.length && !popular) {
    const reason = settled.find((result) => result.status === "rejected");
    throw new Error(reason?.reason?.message || "No headlines");
  }
  const payload = {
    updated: new Date().toISOString(),
    topic,
    topicLabel: spec.label,
    sources: spec.feeds.map((feed) => feed.source),
    popular,
    stories: popular ? stories.filter((story) => story.url !== popular.url) : stories,
  };
  if (stories.length || popular) topicCache.set(topic, { at: Date.now(), payload });
  return payload;
}

function attach(middlewares) {
  middlewares.use(async (req, res, next) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/news") return next();
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const payload = await getNews(url.searchParams.get("topic") || "breaking");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(payload));
    } catch {
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

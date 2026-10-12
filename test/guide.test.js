import assert from "node:assert/strict";
import test from "node:test";
import { NEWS_TOPICS } from "../server/news.js";
import { easternMidnight } from "../src/countdown.js";

test("news topics cover breaking news, the economy, foreign relations, and Trump", () => {
  assert.deepEqual(NEWS_TOPICS.map((topic) => topic.id), ["breaking", "economy", "foreign", "trump"]);
});

test("Election Day countdown starts at midnight Eastern on November 3, 2026", () => {
  assert.equal(easternMidnight(2026, 11, 3).toISOString(), "2026-11-03T05:00:00.000Z");
});

const KEY = "ballotiq-saved";

function empty() {
  return { people: [], highlights: [], stories: [] };
}

export function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      people: Array.isArray(raw.people) ? raw.people : [],
      highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
      stories: Array.isArray(raw.stories) ? raw.stories : [],
    };
  } catch {
    return empty();
  }
}

function write(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function personId(person) {
  return [person.level || "", person.state || "", person.office || "", person.district || "", person.name || ""].join("|");
}

export function highlightId(person, section, text) {
  let hash = 0;
  for (const ch of String(text)) hash = (Math.imul(hash, 31) + ch.codePointAt(0)) | 0;
  return `${personId(person)}|${section}|${(hash >>> 0).toString(36)}`;
}

export function isPersonSaved(id) {
  return loadSaved().people.some((item) => item.id === id);
}

export function isHighlightSaved(id) {
  return loadSaved().highlights.some((item) => item.id === id);
}

export function isStorySaved(url) {
  return loadSaved().stories.some((item) => item.url === url);
}

export function togglePerson(person) {
  const data = loadSaved();
  const id = personId(person);
  const exists = data.people.some((item) => item.id === id);
  data.people = exists
    ? data.people.filter((item) => item.id !== id)
    : [{ ...person, id, savedAt: Date.now() }, ...data.people];
  write(data);
  return !exists;
}

export function toggleHighlight(person, section, text) {
  const data = loadSaved();
  const id = highlightId(person, section, text);
  const exists = data.highlights.some((item) => item.id === id);
  data.highlights = exists
    ? data.highlights.filter((item) => item.id !== id)
    : [{ ...person, id, section, text, savedAt: Date.now() }, ...data.highlights];
  write(data);
  return !exists;
}

export function toggleStory(story) {
  const data = loadSaved();
  const exists = data.stories.some((item) => item.url === story.url);
  data.stories = exists
    ? data.stories.filter((item) => item.url !== story.url)
    : [{ ...story, savedAt: Date.now() }, ...data.stories];
  write(data);
  return !exists;
}

export function removeSaved(kind, id) {
  const data = loadSaved();
  if (kind === "person") data.people = data.people.filter((item) => item.id !== id);
  if (kind === "highlight") data.highlights = data.highlights.filter((item) => item.id !== id);
  if (kind === "story") data.stories = data.stories.filter((item) => item.url !== id);
  write(data);
}

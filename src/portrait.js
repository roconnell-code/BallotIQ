import portraits from "./data/portraits.json";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function initials(name) {
  const skip = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  while (parts.length > 1 && skip.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function portraitRecord(name, stateAbbr) {
  if (stateAbbr && portraits[`${name}|${stateAbbr}`]) return portraits[`${name}|${stateAbbr}`];
  return portraits[name] || null;
}

export function portraitFigure(name, stateAbbr) {
  const record = portraitRecord(name, stateAbbr);
  const letters = esc(initials(name));
  if (!record) {
    return `<div class="portrait missing" aria-hidden="true">${letters}</div>`;
  }
  return `<figure class="portrait"><img src="${esc(record.src)}" alt="Portrait of ${esc(name)}" width="88" height="112" /></figure>`;
}

export function portraitCredit(name, stateAbbr) {
  const record = portraitRecord(name, stateAbbr);
  if (!record) return "";
  const license = record.license ? ` · ${esc(record.license)}` : "";
  return `<p class="photo-credit"><a href="${esc(record.file)}" target="_blank" rel="noopener noreferrer">${esc(record.credit)}</a>${license}</p>`;
}

export function portraitThumb(name, stateAbbr) {
  const record = portraitRecord(name, stateAbbr);
  const letters = esc(initials(name));
  if (!record) {
    return `<span class="nominee-photo missing" aria-hidden="true">${letters}</span>`;
  }
  const alt = `Portrait of ${name}. Photo: ${record.credit}, ${record.license}.`;
  return `<a class="nominee-photo" href="${esc(record.file)}" target="_blank" rel="noopener noreferrer"><img src="${esc(record.src)}" alt="${esc(alt)}" width="46" height="58" /></a>`;
}

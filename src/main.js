import senateRaces from "./data/senate.json";
import governorRaces from "./data/governors.json";
import houseByState from "./data/house.json";
import moneyByCandidate from "./data/money.json";
import { portraitCredit, portraitFigure, portraitThumb } from "./portrait.js";
import { ELECTION_2026, countdownMarkup, startCountdown } from "./countdown.js";
import {
  highlightId,
  isHighlightSaved,
  isPersonSaved,
  isStorySaved,
  loadSaved,
  personId,
  removeSaved,
  toggleHighlight,
  togglePerson,
  toggleStory,
} from "./saved.js";

const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([abbr, name]) => ({ abbr, name }));

const senateBy = Object.fromEntries(senateRaces.map((race) => [race.state, race]));
const governorBy = Object.fromEntries(governorRaces.map((race) => [race.state, race]));

const HOUSE_COUNT = Object.values(houseByState).reduce((sum, list) => sum + list.length, 0);

const PROFILE_SECTIONS = [
  ["experience", "Experience"],
  ["votingRecord", "Voting record"],
  ["keyIssues", "Key issues"],
  ["campaignPromises", "Campaign promises"],
  ["majorDonors", "Major donors"],
  ["endorsements", "Endorsements"],
  ["legislativeRecord", "Legislative record"],
  ["attendance", "Attendance / voting participation"],
];

const SHORTLIST = {
  federal: [
    ["NC", "North Carolina Senate"],
    ["ME", "Maine Senate"],
    ["OH", "Ohio Senate"],
    ["TX", "Texas Senate"],
    ["MI", "Michigan Senate"],
    ["AK", "Alaska Senate"],
    ["IA", "Iowa Senate"],
    ["NH", "New Hampshire Senate"],
  ],
  state: [
    ["WI", "Wisconsin governor"],
    ["NV", "Nevada governor"],
    ["GA", "Georgia governor"],
    ["OH", "Ohio governor"],
    ["AK", "Alaska governor"],
    ["IA", "Iowa governor"],
    ["MI", "Michigan governor"],
    ["AZ", "Arizona governor"],
  ],
};

let level = "federal";
let selected = null;
let districtId = null;
let stateQuery = "";

const app = document.querySelector("#app");

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function partyKind(party) {
  const p = party.toLowerCase();
  if (p.includes("democr") || p === "dfl" || p.includes("farmer")) return "dem";
  if (p.startsWith("rep")) return "rep";
  if (p.includes("independent")) return "ind";
  return "other";
}

function sortPeople(list) {
  const rank = { dem: 0, rep: 1, ind: 2, other: 3 };
  return [...list].sort(
    (a, b) => rank[partyKind(a.party)] - rank[partyKind(b.party)] || a.name.localeCompare(b.name),
  );
}

function tokens(name) {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+redistricted from.*$/i, "")
    .split(/\s+/)
    .filter((word, index, all) => word && !(word.length === 1 && index > 0 && index < all.length - 1));
}

function incumbentIsRunning(status) {
  const s = status.toLowerCase();
  if (s.includes("retir") || s.includes("lost renomination") || s.includes("died") || s.includes("resign")) {
    return false;
  }
  return /renominat|advanced|running|nominat/.test(s);
}

function runningIncumbentName(district) {
  if (!district.incumbent || !incumbentIsRunning(district.status)) return null;
  const target = tokens(district.incumbent).join(" ");
  const hits = district.candidates.filter((candidate) => tokens(candidate.name).join(" ") === target);
  if (hits.length === 1) return hits[0].name;
  const partyHits = hits.filter(
    (candidate) => district.incumbentParty && partyKind(candidate.party) === partyKind(district.incumbentParty),
  );
  return (partyHits[0] || hits[0])?.name || null;
}

function houseProfile(candidate, district) {
  const incumbentName = runningIncumbentName(district);
  const isIncumbent = incumbentName === candidate.name;
  const open = !district.incumbent || !incumbentIsRunning(district.status);
  let line;
  if (isIncumbent) {
    const since = district.since ? ` First elected ${district.since}.` : "";
    line = `Incumbent representative for ${district.label}.${since}`;
  } else if (open) {
    line = `${candidate.party} candidate for the open seat in ${district.label}.`;
  } else {
    line = `${candidate.party} candidate challenging ${district.incumbent} in ${district.label}.`;
  }
  return {
    role: isIncumbent ? "Incumbent representative" : "On the November 3 ballot",
    accomplishments: [line],
    policy: [],
  };
}

function addLine(list, item) {
  if (item && !list.includes(item)) list.push(item);
}

function classifyLine(text) {
  const t = text.toLowerCase();
  if (/\b(donors include|major donors|funded by|contributions? from|super pac)\b/.test(t)) return "majorDonors";
  if (/\bendors/.test(t)) return "endorsements";
  if (/\b(attendance|missed votes?|voting participation)\b/.test(t)) return "attendance";
  if (/\b(sponsor|sponsored|legislation|bills?|resolution|enacted|amendment|legislative record)\b/.test(t)) return "legislativeRecord";
  if (/\b(voting record|voted|votes with|votes as)\b/.test(t) && !/usually votes|state that has voted/.test(t)) return "votingRecord";
  if (/\b(pledges?|pledged|promises|promise to|plans to|calls for|running on|her campaign|his campaign|public campaign|campaign has)\b/.test(t)) return "campaignPromises";
  return null;
}

function buildProfile(person) {
  const profile = {
    experience: [],
    votingRecord: [],
    keyIssues: [],
    campaignPromises: [],
    majorDonors: [],
    endorsements: [],
    legislativeRecord: [],
    attendance: [],
  };
  for (const item of person.accomplishments || []) {
    addLine(profile[classifyLine(item) || "experience"], item);
  }
  for (const item of person.policy || []) {
    const bucket = classifyLine(item);
    addLine(profile[bucket || "keyIssues"], item);
  }
  return profile;
}

function gapSentence(labels) {
  const nice = labels.map((label) => (
    label === "Attendance / voting participation" ? "attendance" : label.toLowerCase()
  ));
  if (nice.length === 1) return `Not compiled in this guide: ${nice[0]}.`;
  const last = nice.pop();
  return `Not compiled in this guide: ${nice.join(", ")}, and ${last}.`;
}

function researchMeta(person, stateAbbr, context = {}) {
  return {
    name: person.name,
    party: person.party || "",
    role: person.role || "",
    state: stateAbbr,
    level: context.level || level,
    office: context.office || "",
    district: context.district || "",
  };
}

function factList(items, section, meta) {
  return `<ul>${items.map((item) => {
    const marked = isHighlightSaved(highlightId(meta, section, item));
    const payload = esc(JSON.stringify({ ...meta, section, text: item }));
    return `<li class="${marked ? "is-marked" : ""}"><span>${esc(item)}</span><button type="button" class="mark" data-highlight="${payload}" aria-pressed="${marked}">${marked ? "Highlighted" : "Highlight"}</button></li>`;
  }).join("")}</ul>`;
}

function personCard(person, stateAbbr, context) {
  const kind = partyKind(person.party);
  const meta = researchMeta(person, stateAbbr, context);
  const saved = isPersonSaved(personId(meta));
  const profile = buildProfile(person);
  const missing = [];
  const sections = PROFILE_SECTIONS.flatMap(([key, label]) => {
    const items = profile[key];
    if (!items.length) {
      missing.push(label);
      return [];
    }
    return [`<section><h5>${label}</h5>${factList(items, label, meta)}</section>`];
  }).join("");
  const gap = missing.length ? `<p class="profile-gap">${gapSentence(missing)}</p>` : "";
  return `
    <article class="person ${kind}${saved ? " is-saved" : ""}">
      <div class="person-top">
        ${portraitFigure(person.name, stateAbbr)}
        <div>
          <p class="party-kicker">${esc(person.party)}</p>
          <h4>${esc(person.name)}</h4>
          <p class="role">${esc(person.role)}</p>
          ${portraitCredit(person.name, stateAbbr)}
          <button type="button" class="save-person" data-save-person="${esc(JSON.stringify(meta))}" aria-pressed="${saved}">${saved ? "Saved" : "Save"}</button>
        </div>
      </div>
      <div class="profile">${sections}${gap}</div>
      ${moneyBlock(person)}
    </article>
  `;
}

function formatDollars(amount) {
  const n = Math.abs(Number(amount) || 0);
  if (n >= 1_000_000) {
    const millions = n / 1_000_000;
    return `$${millions.toFixed(millions >= 10 ? 0 : 1)} million`;
  }
  if (n >= 1000) return `$${Math.round(n / 1000)} thousand`;
  return `$${Math.round(n)}`;
}

function formatCoverage(iso) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function moneyBlock(person) {
  const row = person.moneyKey ? moneyByCandidate[person.moneyKey] : null;
  if (!row) {
    const note = person.moneyScope === "state"
      ? "State and local campaign-finance filings are not compiled in this guide."
      : "No contribution breakdown is on file for this candidate in the FEC 2026 all-candidates file.";
    return `
      <section class="money">
        <h5>Where does the candidate's money come from?</h5>
        <p class="profile-gap">${note}</p>
      </section>
    `;
  }
  const slices = [
    ["individual", "Individual donors", row.individual, row.individualDollars],
    ["pacs", "PACs", row.pacs, row.pacDollars],
    ["other", "Other", row.other, row.otherDollars],
  ];
  const bar = slices.map(([key, , pct]) => {
    const width = Math.max(0, Math.min(100, Number(pct) || 0));
    return width ? `<span class="money-${key}" style="width:${width}%"></span>` : "";
  }).join("");
  const legend = slices.map(([key, label, pct, dollars]) => `
    <li><i class="money-swatch money-${key}"></i>${esc(label)} — ${esc(pct)}% <span>(${esc(formatDollars(dollars))})</span></li>
  `).join("");
  const through = formatCoverage(row.through);
  const label = slices.map(([, name, pct]) => `${name} ${pct}%`).join(", ");
  return `
    <section class="money">
      <h5>Where does the candidate's money come from?</h5>
      <div class="money-bar" role="img" aria-label="${esc(label)}">${bar}</div>
      <ul class="money-legend">${legend}</ul>
      <p class="money-note">Share of individual contributions, PAC contributions, and other receipts (party committees, self-funding, and loans). Transfers between a candidate's own committees are excluded. FEC all-candidates file${through ? `, coverage through ${esc(through)}` : ""}.</p>
    </section>
  `;
}

function othersList(others) {
  if (!others?.length) return "";
  return `
    <details>
      <summary>Also on the ballot (${others.length})</summary>
      <ul class="others">
        ${others.map((person) => `<li>${esc(person.name)} · ${esc(person.party)}</li>`).join("")}
      </ul>
    </details>
  `;
}

function contestBlock(race) {
  const people = sortPeople(race.candidates).map((person) => (
    race.office === "U.S. Senate"
      ? { ...person, moneyKey: `senate|${race.state}|${person.name}`, moneyScope: "federal" }
      : { ...person, moneyScope: "state" }
  ));
  return `
    <section class="race">
      <div class="race-head">
        <h3>${esc(race.office)}</h3>
        ${race.rating ? `<span class="rating">${esc(race.rating)}</span>` : ""}
      </div>
      <p class="summary">${esc(race.summary)}</p>
      <div class="people ${people.length === 2 ? "pair" : ""}">
        ${people.map((person) => personCard(person, race.state, { level, office: race.office })).join("")}
      </div>
      ${othersList(race.others)}
    </section>
  `;
}

function houseBlock(abbr) {
  const districts = houseByState[abbr] || [];
  if (!districts.length) {
    return `
      <section class="race">
        <h3>U.S. House</h3>
        <p class="summary">The District of Columbia has no voting member of the House. A non-voting delegate is elected separately and is not included in these state tables.</p>
      </section>
    `;
  }
  const current = districts.find((district) => district.district === districtId) || null;
  const options = districts.map((district) => {
    const label = district.district === "at-large"
      ? `At-large · ${district.pvi}`
      : `District ${district.district} · ${district.pvi}`;
    const selectedAttr = current && current.district === district.district ? " selected" : "";
    return `<option value="${esc(district.district)}"${selectedAttr}>${esc(label)}</option>`;
  }).join("");
  const body = current
    ? `
      <p class="summary">${esc(current.status)}. ${current.incumbent ? `Incumbent on the current map: ${current.incumbent}.` : "No incumbent is seeking this seat."}</p>
      <div class="people">
        ${sortPeople(current.candidates).map((candidate) => personCard({
          ...candidate,
          ...houseProfile(candidate, current),
          moneyKey: `house|${abbr}|${current.district}|${candidate.name}`,
          moneyScope: "federal",
        }, abbr, { level: "federal", office: "U.S. House", district: String(current.district) })).join("")}
      </div>
    `
    : `<p class="summary">Choose a district. All ${districts.length} ${districts.length === 1 ? "seat is" : "seats are"} on the November 3 ballot.</p>`;
  return `
    <section class="race">
      <div class="race-head">
        <h3>U.S. House</h3>
        <span class="rating">${districts.length} ${districts.length === 1 ? "seat" : "seats"}</span>
      </div>
      <label class="field">District
        <select id="district-select">
          <option value="">Select a district</option>
          ${options}
        </select>
      </label>
      ${body}
    </section>
  `;
}

function detailHtml() {
  if (!selected) {
    const picks = SHORTLIST[level];
    return `
      <p class="kicker">${level === "federal" ? "Federal" : "State offices"} · November 3, 2026</p>
      <h2>Choose a state</h2>
      <p class="summary">
        ${level === "federal"
          ? "Federal races are the U.S. Senate, where a state has one this year, and the U.S. House, where every district is up. Darker states on the map have a Senate election."
          : "State offices here are the governor's race, plus the mayor's race in the District of Columbia. Muted states do not elect a governor in 2026."}
      </p>
      <p class="summary">The closest races, if you want a place to start:</p>
      <div class="chips">
        ${picks.map(([abbr, label]) => `<button type="button" data-jump="${abbr}">${esc(label)}</button>`).join("")}
      </div>
    `;
  }

  const state = STATES.find((item) => item.abbr === selected);
  const senate = senateBy[selected];
  const governor = governorBy[selected];
  let body = "";
  if (level === "federal") {
    body += senate
      ? contestBlock(senate)
      : `<section class="race"><h3>U.S. Senate</h3><p class="summary">No Senate election in ${esc(state.name)} this year. Senators serve six-year terms in three classes, and this class is not up. The House races below are.</p></section>`;
    body += houseBlock(selected);
  } else if (governor) {
    body += contestBlock(governor);
    body += `<p class="summary">Legislatures, attorneys general, and other statewide offices are also on many ballots. This page follows the governor's race, and the mayor's race in Washington, D.C.</p>`;
  } else {
    body += `<section class="race"><h3>Governor</h3><p class="summary">No governor's race in ${esc(state.name)} in 2026. That office is on another cycle. Switch to Federal for the House${senate ? " and Senate" : ""} ballot in this state.</p></section>`;
  }

  return `
    <p class="kicker">${level === "federal" ? "Federal" : "State offices"} · November 3, 2026</p>
    <h2>${esc(state.name)}</h2>
    ${body}
  `;
}

function filteredStates() {
  const q = stateQuery.trim().toLowerCase();
  if (!q) return STATES;
  return STATES.filter((state) => state.name.toLowerCase().includes(q) || state.abbr.toLowerCase().includes(q));
}

function paintMap() {
  const box = document.querySelector(".map-box");
  if (!box) return;
  box.classList.toggle("map-federal", level === "federal");
  box.classList.toggle("map-state", level === "state");
  box.querySelectorAll(".state-shape").forEach((shape) => {
    const abbr = shape.dataset.abbr;
    shape.classList.toggle("is-selected", abbr === selected);
    shape.classList.toggle("has-senate", Boolean(senateBy[abbr]));
    shape.classList.toggle("has-gov", Boolean(governorBy[abbr]));
    shape.classList.toggle("is-quiet", level === "state" && !governorBy[abbr]);
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("role", "button");
    shape.setAttribute("aria-pressed", abbr === selected ? "true" : "false");
    shape.setAttribute("aria-label", STATES.find((state) => state.abbr === abbr)?.name || abbr);
  });
}

function renderList() {
  const list = document.querySelector(".state-list");
  const matches = filteredStates();
  list.innerHTML = matches.length
    ? matches.map((state) => `
        <button type="button" data-state="${state.abbr}" aria-pressed="${state.abbr === selected}">
          ${esc(state.name)}
        </button>
      `).join("")
    : `<p class="empty-note">No state matches that search.</p>`;
}

function renderDetail() {
  document.querySelector("#detail").innerHTML = detailHtml();
  document.querySelectorAll(".level button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.level === level ? "true" : "false");
  });
  const legend = document.querySelector(".legend");
  legend.innerHTML = level === "federal"
    ? `<span><i class="swatch senate"></i>Senate race this year</span><span><i class="swatch house"></i>House races only</span>`
    : `<span><i class="swatch gov"></i>Governor or mayor on the ballot</span><span><i class="swatch quiet"></i>No statewide executive race</span>`;
}

function render() {
  paintMap();
  renderList();
  renderDetail();
}

function writeHash() {
  const next = `#${level}/${selected || ""}`;
  if (location.hash !== next) location.hash = next;
}

function choose(abbr) {
  if (abbr !== selected) districtId = null;
  selected = abbr;
  writeHash();
  render();
}

function setLevel(next) {
  if (next === level) return;
  level = next;
  districtId = null;
  writeHash();
  render();
}

function readHash() {
  const [lvl, abbr] = location.hash.replace(/^#/, "").split("/");
  if (lvl === "federal" || lvl === "state") level = lvl;
  selected = STATES.some((state) => state.abbr === abbr) ? abbr : null;
}

function mount() {
  app.innerHTML = `
    <header class="mast">
      <div class="mast-inner">
        <div class="mast-top">
          <div>
            <p class="eyebrow">United States · November 3, 2026</p>
            <h1>BallotIQ</h1>
            <p class="lede">A state-by-state reading guide for Election Day. Federal covers this year's Senate races and all 435 House seats. State covers 36 governors and the mayor of the District of Columbia.</p>
          </div>
          ${countdownMarkup()}
        </div>
        <div class="mast-bar">
          <div class="counts">
            <span>${senateRaces.length} Senate elections</span>
            <span>${HOUSE_COUNT} House seats</span>
            <span>${governorRaces.filter((race) => race.state !== "DC").length} governor's races</span>
          </div>
          <nav class="cycle-nav" aria-label="Election cycle">
            <a href="/" aria-current="page">2026 election</a>
            <a href="/future.html">Future elections</a>
          </nav>
        </div>
      </div>
      <div class="flag-rule" aria-hidden="true"></div>
    </header>
    <main class="wrap">
      <section class="saved" aria-labelledby="saved-button">
        <button type="button" id="saved-button" aria-expanded="false" aria-controls="saved-panel">
          Saved research
        </button>
        <div id="saved-panel" hidden></div>
      </section>
      <section class="ballot" aria-labelledby="ballot-button">
        <button type="button" id="ballot-button" aria-expanded="false" aria-controls="ballot-panel">
          What's my ballot
        </button>
        <div id="ballot-panel" hidden>
          <form id="ballot-form" class="ballot-form">
            <label class="field">State
              <select id="ballot-state" name="state">
                <option value="">Select a state</option>
                ${STATES.map((state) => `<option value="${state.abbr}">${esc(state.name)}</option>`).join("")}
              </select>
            </label>
            <label class="field" id="ballot-district-field">House district
              <select id="ballot-district" name="district" disabled>
                <option value="">Select a state first</option>
              </select>
            </label>
            <button type="submit" id="ballot-submit">Show my ballot</button>
            <p id="ballot-district-note" class="ballot-note" hidden></p>
            <p id="ballot-error" class="ballot-error" role="alert" hidden></p>
          </form>
          <div id="ballot-result"></div>
        </div>
      </section>
      <div class="level" role="group" aria-label="Federal or state">
        <button type="button" data-level="federal" aria-pressed="true">
          <strong>Federal</strong>
          <small>Senate, where it is up, and every House district.</small>
        </button>
        <button type="button" data-level="state" aria-pressed="false">
          <strong>State</strong>
          <small>Governors, and the mayor of the District of Columbia.</small>
        </button>
      </div>
      <div class="layout">
        <section class="panel" aria-label="State map">
          <div class="finder">
            <label class="field">Find a state
              <input id="state-search" type="search" placeholder="Texas, Ohio, D.C." autocomplete="off" />
            </label>
          </div>
          <div class="map-box map-federal" id="map">Loading the map…</div>
          <p class="legend"></p>
          <div class="state-list"></div>
        </section>
        <section class="panel detail-col" id="detail" tabindex="-1"></section>
      </div>
      <footer class="foot">
        <p>Candidate lists were compiled from public reporting as of October 1, 2026, including the Wikipedia pages for the 2026 Senate, House, and governor elections. Ratings shown are Cook Political Report labels from that same window. Each fact appears once, in the section it belongs to. Sections without a sourced line are named together at the bottom of the card, instead of repeating the same note. Save and Highlight stay in this browser. The money bar uses the FEC all-candidates file for federal candidates and is left blank when no filing is matched. State races are not filled from federal reports. Photos are freely licensed portraits from Wikimedia Commons. The photographer and license are on the card. Initials appear when no free portrait matched that candidate and state. This is a reading guide, not an official ballot. Platforms move, and small-party filings can be incomplete. Check your state election office before you vote.</p>
      </footer>
      <section class="news" aria-labelledby="news-button">
        <div class="news-head">
          <button type="button" id="news-button" aria-expanded="false" aria-controls="news-panel">
            Today's American news
          </button>
          <label class="field news-topic-field">Topic
            <select id="news-topic" aria-label="News topic">
              <option value="breaking">Breaking news</option>
              <option value="economy">Economy</option>
              <option value="foreign">Foreign relations</option>
              <option value="trump">Trump</option>
            </select>
          </label>
        </div>
        <div id="news-panel" hidden></div>
      </section>
    </main>
  `;

  app.addEventListener("click", (event) => {
    const levelButton = event.target.closest("[data-level]");
    if (levelButton) {
      setLevel(levelButton.dataset.level);
      return;
    }
    const stateButton = event.target.closest("[data-state]");
    if (stateButton) {
      choose(stateButton.dataset.state);
      return;
    }
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      choose(jump.dataset.jump);
      return;
    }
    if (event.target.closest("[data-save-person]")) {
      savePersonFrom(event.target.closest("[data-save-person]"));
      return;
    }
    if (event.target.closest("[data-highlight]")) {
      highlightFrom(event.target.closest("[data-highlight]"));
      return;
    }
    if (event.target.closest("[data-save-story]")) {
      saveStoryFrom(event.target.closest("[data-save-story]"));
      return;
    }
    if (event.target.closest("[data-open-saved]")) {
      openSaved(JSON.parse(event.target.closest("[data-open-saved]").getAttribute("data-open-saved")));
      return;
    }
    const remove = event.target.closest("[data-remove-saved]");
    if (remove) {
      removeSaved(remove.dataset.removeKind, remove.dataset.removeSaved);
      renderSaved();
      renderDetail();
    }
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "district-select") {
      districtId = event.target.value || null;
      renderDetail();
    }
    if (event.target.id === "news-topic") {
      newsTopic = event.target.value;
      if (newsOpen) loadNews();
    }
  });

  document.querySelector("#state-search").addEventListener("input", (event) => {
    stateQuery = event.target.value;
    renderList();
  });

  document.querySelector("#map").addEventListener("click", (event) => {
    const shape = event.target.closest(".state-shape");
    if (shape) choose(shape.dataset.abbr);
  });

  document.querySelector("#map").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const shape = event.target.closest(".state-shape");
    if (!shape) return;
    event.preventDefault();
    choose(shape.dataset.abbr);
  });

  document.querySelector("#ballot-button").addEventListener("click", toggleBallot);
  document.querySelector("#ballot-state").addEventListener("change", (event) => {
    fillBallotDistricts(event.target.value);
    document.querySelector("#ballot-error").hidden = true;
    document.querySelector("#ballot-result").innerHTML = "";
  });
  document.querySelector("#ballot-form").addEventListener("submit", showBallot);
  document.querySelector("#news-button").addEventListener("click", toggleNews);
  document.querySelector("#saved-button").addEventListener("click", toggleSaved);

  render();
  renderSaved();
  loadMap();
  startCountdown(document.querySelector("#countdown"), () => ELECTION_2026);
  if (new URLSearchParams(location.search).has("ballot")) toggleBallot();
}

const newsCache = new Map();
let newsTopic = "breaking";
let newsOpen = false;
let newsRequest = 0;
let ballotOpen = false;
let savedOpen = false;

const NEWS_NOTES = {
  breaking: "Breaking headlines from NPR, PBS NewsHour, and The New York Times.",
  economy: "Economy headlines from NPR, PBS NewsHour, and The New York Times.",
  foreign: "Foreign-relations headlines from NPR, PBS NewsHour, and The New York Times.",
  trump: "Politics headlines from those three outlets that mention Trump.",
};

function ballotMatchup(candidates, stateAbbr) {
  const people = sortPeople(candidates || []);
  if (!people.length) {
    return `<p class="matchup is-empty">No candidates are listed for this race.</p>`;
  }
  const bits = people.map((person) => `
    <span class="nominee ${partyKind(person.party)}">
      ${portraitThumb(person.name, stateAbbr)}
      <span>
        <strong>${esc(person.name)}</strong>
        <em>${esc(person.party)}</em>
      </span>
    </span>
  `);
  return `<p class="matchup">${bits.join('<span class="vs">vs.</span>')}</p>`;
}

function ballotAlso(others) {
  if (!others?.length) return "";
  const text = others.map((person) => `${esc(person.name)} (${esc(person.party)})`).join(", ");
  return `<p class="ballot-also">Also on the ballot: ${text}</p>`;
}

function ballotRace(title, body, also = "") {
  return `
    <section class="ballot-race">
      <h3>${esc(title)}</h3>
      ${body}
      ${also}
    </section>
  `;
}

function fillBallotDistricts(abbr) {
  const select = document.querySelector("#ballot-district");
  const field = document.querySelector("#ballot-district-field");
  const note = document.querySelector("#ballot-district-note");
  const districts = houseByState[abbr] || [];
  const atLarge = districts.length === 1 && districts[0].district === "at-large";

  if (!abbr) {
    field.hidden = false;
    select.disabled = true;
    select.innerHTML = `<option value="">Select a state first</option>`;
    note.hidden = true;
    note.textContent = "";
    return;
  }

  if (!districts.length) {
    field.hidden = false;
    select.disabled = true;
    select.innerHTML = `<option value="">No House district</option>`;
    note.hidden = false;
    note.textContent = "The District of Columbia has no voting House district. The mayor's race is listed instead of a governor.";
    return;
  }

  if (atLarge) {
    field.hidden = false;
    select.disabled = true;
    select.innerHTML = `<option value="at-large" selected>At-large</option>`;
    note.hidden = false;
    note.textContent = "This state elects one House member at large, so there is no district number.";
    return;
  }

  field.hidden = false;
  select.disabled = false;
  note.hidden = true;
  note.textContent = "";
  const previous = select.value;
  select.innerHTML = `<option value="">Select a district</option>${districts.map((district) => (
    `<option value="${esc(district.district)}">District ${esc(district.district)}</option>`
  )).join("")}`;
  if (districts.some((district) => district.district === previous)) select.value = previous;
}

function renderBallot(abbr, districtKey) {
  const state = STATES.find((item) => item.abbr === abbr);
  const senate = senateBy[abbr];
  const governor = governorBy[abbr];
  const districts = houseByState[abbr] || [];
  const district = districts.find((item) => item.district === districtKey) || null;

  const senateBody = senate
    ? ballotMatchup(senate.candidates, abbr)
    : `<p class="matchup is-empty">No U.S. Senate election in ${esc(state.name)} this year.</p>`;

  let houseTitle = "U.S. House";
  let houseBody = "";
  if (!districts.length) {
    houseBody = `<p class="matchup is-empty">The District of Columbia has no voting member of the House.</p>`;
  } else if (!district) {
    houseBody = `<p class="matchup is-empty">Choose a House district.</p>`;
  } else {
    houseTitle = district.district === "at-large"
      ? "U.S. House — At-large"
      : `U.S. House — District ${district.district}`;
    houseBody = ballotMatchup(district.candidates, abbr);
  }

  const govTitle = governor ? governor.office : "Governor";
  const govBody = governor
    ? ballotMatchup(governor.candidates, abbr)
    : `<p class="matchup is-empty">No governor's race in ${esc(state.name)} in 2026.</p>`;

  const place = !districts.length
    ? state.name
    : district?.district === "at-large"
      ? state.name
      : district
        ? `${state.name} · District ${district.district}`
        : state.name;

  const result = document.querySelector("#ballot-result");
  result.innerHTML = `
    <h2>Your 2026 Candidates</h2>
    <p class="ballot-place">${esc(place)}</p>
    ${ballotRace("U.S. Senate", senateBody, senate ? ballotAlso(senate.others) : "")}
    ${ballotRace(houseTitle, houseBody, "")}
    ${ballotRace(govTitle, govBody, governor ? ballotAlso(governor.others) : "")}
    <p class="ballot-note">General-election field compiled as of October 1, 2026. This is a reading guide, not an official ballot.</p>
  `;
  result.scrollIntoView({ block: "nearest" });
}

function showBallot(event) {
  event.preventDefault();
  const abbr = document.querySelector("#ballot-state").value;
  const districtKey = document.querySelector("#ballot-district").value;
  const error = document.querySelector("#ballot-error");
  const state = STATES.find((item) => item.abbr === abbr);
  if (!state) {
    error.hidden = false;
    error.textContent = "Choose a state.";
    return;
  }
  const districts = houseByState[abbr] || [];
  const needsDistrict = districts.some((item) => item.district !== "at-large");
  if (needsDistrict && !districts.some((item) => item.district === districtKey)) {
    error.hidden = false;
    error.textContent = "Choose a House district.";
    return;
  }
  error.hidden = true;
  renderBallot(abbr, needsDistrict ? districtKey : districts[0]?.district || "");
}

function toggleBallot() {
  const button = document.querySelector("#ballot-button");
  const panel = document.querySelector("#ballot-panel");
  ballotOpen = !ballotOpen;
  button.setAttribute("aria-expanded", ballotOpen ? "true" : "false");
  button.textContent = ballotOpen ? "Hide my ballot" : "What's my ballot";
  panel.hidden = !ballotOpen;
  if (ballotOpen) document.querySelector("#ballot-state").focus();
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function storySaveButton(story) {
  const saved = isStorySaved(story.url);
  const payload = esc(JSON.stringify({
    url: story.url,
    title: story.title,
    source: story.source,
  }));
  return `<button type="button" class="mark" data-save-story="${payload}" aria-pressed="${saved}">${saved ? "Saved" : "Save story"}</button>`;
}

function newsCard(story) {
  const when = formatWhen(story.published);
  return `
    <article class="news-card">
      <p class="news-source">${esc(story.source)}${when ? ` · ${esc(when)} ET` : ""}</p>
      <h3><a href="${esc(story.url)}" target="_blank" rel="noopener noreferrer">${esc(story.title)}</a></h3>
      ${story.summary ? `<p>${esc(story.summary)}</p>` : ""}
      ${storySaveButton(story)}
    </article>
  `;
}

function popularBlock(story) {
  if (!story) return "";
  const when = formatWhen(story.published);
  return `
    <section class="news-lead">
      <p class="news-kicker">Most viewed today</p>
      <p class="news-source">${esc(story.source)}${when ? ` · ${esc(when)} ET` : ""}</p>
      <h3><a href="${esc(story.url)}" target="_blank" rel="noopener noreferrer">${esc(story.title)}</a></h3>
      ${story.summary ? `<p>${esc(story.summary)}</p>` : ""}
      <p class="news-note">The lead story on The New York Times most-viewed list.</p>
      ${storySaveButton(story)}
    </section>
  `;
}

function newsBody(data) {
  const list = data.stories?.length
    ? `<div class="news-list">${data.stories.map(newsCard).join("")}</div>`
    : `<p class="news-status">No headlines matched this topic.</p>`;
  return `
    ${popularBlock(data.popular)}
    <p class="news-note">${esc(NEWS_NOTES[data.topic] || NEWS_NOTES.breaking)} Each link opens the original story.</p>
    ${list}
  `;
}

async function loadNews() {
  const panel = document.querySelector("#news-panel");
  const select = document.querySelector("#news-topic");
  if (select) select.value = newsTopic;
  const topic = newsTopic;
  const request = ++newsRequest;
  const cached = newsCache.get(topic);
  if (cached) {
    panel.innerHTML = newsBody(cached);
    return;
  }
  panel.innerHTML = `<p class="news-status">Getting today's headlines…</p>`;
  try {
    const response = await fetch(`/api/news?topic=${encodeURIComponent(topic)}`);
    if (!response.ok) throw new Error("news");
    const data = await response.json();
    if (request !== newsRequest) return;
    if (!data.stories?.length && !data.popular) throw new Error("empty");
    newsCache.set(topic, data);
    panel.innerHTML = newsBody(data);
  } catch {
    if (request !== newsRequest) return;
    panel.innerHTML = `<p class="news-status">The news feeds did not load. <button type="button" id="news-retry">Try again</button></p>`;
    document.querySelector("#news-retry")?.addEventListener("click", () => {
      newsCache.delete(topic);
      loadNews();
    });
  }
}

function toggleNews() {
  const button = document.querySelector("#news-button");
  const panel = document.querySelector("#news-panel");
  newsOpen = !newsOpen;
  button.setAttribute("aria-expanded", newsOpen ? "true" : "false");
  button.textContent = newsOpen ? "Hide today's American news" : "Today's American news";
  panel.hidden = !newsOpen;
  if (newsOpen) loadNews();
}

function readPayload(button, attr) {
  return JSON.parse(button.getAttribute(attr));
}

function savePersonFrom(button) {
  const meta = readPayload(button, "data-save-person");
  const saved = togglePerson(meta);
  button.setAttribute("aria-pressed", saved ? "true" : "false");
  button.textContent = saved ? "Saved" : "Save";
  button.closest(".person")?.classList.toggle("is-saved", saved);
  renderSaved();
}

function highlightFrom(button) {
  const meta = readPayload(button, "data-highlight");
  const marked = toggleHighlight(meta, meta.section, meta.text);
  button.setAttribute("aria-pressed", marked ? "true" : "false");
  button.textContent = marked ? "Highlighted" : "Highlight";
  button.closest("li")?.classList.toggle("is-marked", marked);
  renderSaved();
}

function saveStoryFrom(button) {
  const story = readPayload(button, "data-save-story");
  const saved = toggleStory(story);
  button.setAttribute("aria-pressed", saved ? "true" : "false");
  button.textContent = saved ? "Saved" : "Save story";
  document.querySelectorAll("[data-save-story]").forEach((other) => {
    const otherStory = readPayload(other, "data-save-story");
    if (otherStory.url !== story.url) return;
    const on = isStorySaved(story.url);
    other.setAttribute("aria-pressed", on ? "true" : "false");
    other.textContent = on ? "Saved" : "Save story";
  });
  renderSaved();
}

function openSaved(entry) {
  level = entry.level === "state" ? "state" : "federal";
  selected = STATES.some((state) => state.abbr === entry.state) ? entry.state : null;
  districtId = entry.district || null;
  writeHash();
  render();
  document.querySelector("#detail")?.focus();
}

function savedGroup(title, items, renderItem) {
  if (!items.length) return "";
  return `<section class="saved-group"><h3>${title}</h3><ul>${items.map(renderItem).join("")}</ul></section>`;
}

function renderSaved() {
  const data = loadSaved();
  const count = data.people.length + data.highlights.length + data.stories.length;
  const button = document.querySelector("#saved-button");
  if (button) button.textContent = count ? `Saved research (${count})` : "Saved research";
  const panel = document.querySelector("#saved-panel");
  if (!panel) return;
  if (!count) {
    panel.innerHTML = `<p class="news-status">Nothing saved yet. Use Save on a candidate, Highlight on a line, or Save story on a headline. This stays in this browser.</p>`;
    return;
  }
  const place = (entry) => STATES.find((state) => state.abbr === entry.state)?.name || entry.state;
  panel.innerHTML = `
    ${savedGroup("Candidates", data.people, (entry) => `
      <li>
        <div>
          <strong>${esc(entry.name)}</strong>
          <span>${esc(entry.party)}${entry.office ? ` · ${esc(entry.office)}` : ""} · ${esc(place(entry))}</span>
        </div>
        <span class="saved-actions">
          <button type="button" data-open-saved="${esc(JSON.stringify(entry))}">Open</button>
          <button type="button" data-remove-saved="${esc(entry.id)}" data-remove-kind="person">Remove</button>
        </span>
      </li>
    `)}
    ${savedGroup("Highlights", data.highlights, (entry) => `
      <li>
        <div>
          <strong>${esc(entry.name)}</strong>
          <span>${esc(entry.section || "Note")} · ${esc(place(entry))}</span>
          <p>${esc(entry.text)}</p>
        </div>
        <span class="saved-actions">
          <button type="button" data-open-saved="${esc(JSON.stringify(entry))}">Open</button>
          <button type="button" data-remove-saved="${esc(entry.id)}" data-remove-kind="highlight">Remove</button>
        </span>
      </li>
    `)}
    ${savedGroup("Stories", data.stories, (entry) => `
      <li>
        <div>
          <strong><a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">${esc(entry.title)}</a></strong>
          <span>${esc(entry.source || "")}</span>
        </div>
        <span class="saved-actions">
          <button type="button" data-remove-saved="${esc(entry.url)}" data-remove-kind="story">Remove</button>
        </span>
      </li>
    `)}
  `;
}

function toggleSaved() {
  const button = document.querySelector("#saved-button");
  const panel = document.querySelector("#saved-panel");
  savedOpen = !savedOpen;
  button.setAttribute("aria-expanded", savedOpen ? "true" : "false");
  panel.hidden = !savedOpen;
  if (savedOpen) renderSaved();
}

async function loadMap() {
  const box = document.querySelector("#map");
  try {
    const response = await fetch("/us.svg");
    if (!response.ok) throw new Error("map");
    box.innerHTML = await response.text();
    paintMap();
  } catch {
    box.innerHTML = `<p class="map-error">The map did not load. Use the state list under this box.</p>`;
  }
}

window.addEventListener("hashchange", () => {
  readHash();
  districtId = null;
  render();
});

readHash();
mount();

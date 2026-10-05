import senateRaces from "./data/senate.json";
import governorRaces from "./data/governors.json";
import houseByState from "./data/house.json";

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
const NO_PLATFORM =
  "No detailed platform is printed here. This guide only includes positions that were in the public summaries used to build it.";

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
  const accomplishments = [];
  if (isIncumbent) {
    accomplishments.push(`Incumbent in ${district.label}. First elected ${district.since}.`);
    accomplishments.push(`${district.status}.`);
  } else if (open) {
    accomplishments.push(`${candidate.party} candidate for ${district.label}, an open seat this year.`);
    accomplishments.push(`${district.status}.`);
  } else {
    accomplishments.push(`${candidate.party} candidate for ${district.label}.`);
    accomplishments.push(`Incumbent ${district.incumbent} (${district.incumbentParty}) is running. ${district.status}.`);
  }
  return {
    role: isIncumbent ? "Incumbent representative" : "On the November 3 ballot",
    accomplishments,
    policy: [
      `Cook PVI for this district: ${district.pvi}. That number describes how the district usually votes. It is not this candidate's platform.`,
      "Issue platforms are not written out for all 435 House seats. What is listed here is the general-election field.",
    ],
  };
}

function personCard(person) {
  const kind = partyKind(person.party);
  const policy = person.policy?.length ? person.policy : [NO_PLATFORM];
  return `
    <article class="person ${kind}">
      <p class="party-kicker">${esc(person.party)}</p>
      <h4>${esc(person.name)}</h4>
      <p class="role">${esc(person.role)}</p>
      <div class="columns">
        <section>
          <h5>Accomplishments</h5>
          <ul>${person.accomplishments.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </section>
        <section>
          <h5>Policy</h5>
          <ul>${policy.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </section>
      </div>
    </article>
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
  const people = sortPeople(race.candidates);
  return `
    <section class="race">
      <div class="race-head">
        <h3>${esc(race.office)}</h3>
        ${race.rating ? `<span class="rating">${esc(race.rating)}</span>` : ""}
      </div>
      <p class="summary">${esc(race.summary)}</p>
      <div class="people ${people.length === 2 ? "pair" : ""}">
        ${people.map(personCard).join("")}
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
        ${sortPeople(current.candidates).map((candidate) => personCard({ ...candidate, ...houseProfile(candidate, current) })).join("")}
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
    ? `<span><i class="swatch" style="background:#7ea0cc"></i>Senate race this year</span><span><i class="swatch" style="background:#d5e1f0"></i>House races only</span>`
    : `<span><i class="swatch" style="background:#e7a3ab"></i>Governor or mayor on the ballot</span><span><i class="swatch" style="background:#e7eef6"></i>No statewide executive race</span>`;
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
        <p class="eyebrow">United States · November 3, 2026</p>
        <h1>Ballot<span>IQ</span></h1>
        <p class="lede">BallotIQ is a state-by-state guide to the November 3, 2026 election. Federal covers the U.S. Senate races on this year's ballot and all 435 House seats. State covers 36 governors and the mayor of the District of Columbia. Choose a state to read who is running, what they have already done, and the policies they are campaigning on.</p>
        <div class="counts">
          <span>${senateRaces.length} Senate elections</span>
          <span>${HOUSE_COUNT} House seats</span>
          <span>${governorRaces.filter((race) => race.state !== "DC").length} governor's races</span>
        </div>
      </div>
      <div class="flag-rule" aria-hidden="true"></div>
    </header>
    <main class="wrap">
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
        <p>Candidate lists were compiled from public reporting as of October 1, 2026, including the Wikipedia pages for the 2026 Senate, House, and governor elections. Ratings shown are Cook Political Report labels from that same window. This is a reading guide, not an official ballot. Platforms move, and small-party filings can be incomplete. Check your state election office before you vote.</p>
      </footer>
      <section class="news" aria-labelledby="news-button">
        <button type="button" id="news-button" aria-expanded="false" aria-controls="news-panel">
          Today's American news
        </button>
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
    if (jump) choose(jump.dataset.jump);
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "district-select") {
      districtId = event.target.value || null;
      renderDetail();
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

  document.querySelector("#news-button").addEventListener("click", toggleNews);

  render();
  loadMap();
}

let newsLoaded = false;
let newsOpen = false;

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

function newsCard(story) {
  const when = formatWhen(story.published);
  return `
    <article class="news-card">
      <p class="news-source">${esc(story.source)}${when ? ` · ${esc(when)} ET` : ""}</p>
      <h3><a href="${esc(story.url)}" target="_blank" rel="noopener noreferrer">${esc(story.title)}</a></h3>
      ${story.summary ? `<p>${esc(story.summary)}</p>` : ""}
    </article>
  `;
}

async function toggleNews() {
  const button = document.querySelector("#news-button");
  const panel = document.querySelector("#news-panel");
  newsOpen = !newsOpen;
  button.setAttribute("aria-expanded", newsOpen ? "true" : "false");
  button.textContent = newsOpen ? "Hide today's American news" : "Today's American news";
  panel.hidden = !newsOpen;
  if (!newsOpen || newsLoaded) return;
  panel.innerHTML = `<p class="news-status">Getting today's headlines from NPR, PBS NewsHour, and The New York Times…</p>`;
  try {
    const response = await fetch("/api/news");
    if (!response.ok) throw new Error("news");
    const data = await response.json();
    if (!data.stories?.length) throw new Error("empty");
    newsLoaded = true;
    panel.innerHTML = `
      <p class="news-note">Headlines from NPR, PBS NewsHour, and The New York Times. Each link opens the original story.</p>
      <div class="news-list">
        ${data.stories.map(newsCard).join("")}
      </div>
    `;
  } catch {
    panel.innerHTML = `<p class="news-status">The news feeds did not load. <button type="button" id="news-retry">Try again</button></p>`;
    document.querySelector("#news-retry").addEventListener("click", () => {
      newsLoaded = false;
      newsOpen = false;
      toggleNews();
    });
  }
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

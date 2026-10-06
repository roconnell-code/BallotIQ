import cyclesFile from "./data/future.json";
import houseByState from "./data/house.json";

const CYCLES = cyclesFile.cycles;
const HOUSE_COUNT = Object.values(houseByState).reduce((sum, list) => sum + list.length, 0);
const PROFILE_GAP = "Not compiled in this guide.";
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

let year = 2027;
let level = "state";
let selected = null;
let districtId = null;
let stateQuery = "";

const app = document.querySelector("#app");

function cycle() {
  return CYCLES.find((item) => item.year === year) || CYCLES[0];
}

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
  const p = String(party || "").toLowerCase();
  if (p.includes("democr") || p === "dfl" || p.includes("farmer")) return "dem";
  if (p.startsWith("rep")) return "rep";
  if (p.includes("independent")) return "ind";
  return "other";
}

function stateName(abbr) {
  return STATES.find((state) => state.abbr === abbr)?.name || abbr;
}

function senateBy(current) {
  return Object.fromEntries(current.senate.map((race) => [race.state, race]));
}

function governorBy(current) {
  return Object.fromEntries(current.governors.map((race) => [race.state, race]));
}

function personCard(person) {
  const kind = partyKind(person.party);
  const sections = PROFILE_SECTIONS.map(([key, label]) => {
    const items = key === "experience"
      ? person.experience || []
      : key === "campaignPromises"
        ? person.promises || []
        : [];
    const body = items.length
      ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
      : `<p class="profile-gap">${PROFILE_GAP}</p>`;
    return `<section><h5>${label}</h5>${body}</section>`;
  }).join("");
  return `
    <article class="person ${kind}">
      <p class="party-kicker">${esc(person.party)}</p>
      <h4>${esc(person.name)}</h4>
      <p class="role">${esc(person.role)}</p>
      <div class="profile">${sections}</div>
      <section class="money">
        <h5>Where does the candidate's money come from?</h5>
        <p class="profile-gap">Campaign-finance breakdowns are not compiled for elections after 2026.</p>
      </section>
    </article>
  `;
}

function raceBlock(race) {
  const people = race.candidates || [];
  return `
    <section class="race">
      <div class="race-head"><h3>${esc(race.office)}</h3></div>
      <p class="summary">${esc(race.summary)}</p>
      ${people.length ? `<div class="people">${people.map(personCard).join("")}</div>` : ""}
    </section>
  `;
}

function houseBlock(abbr) {
  const districts = houseByState[abbr] || [];
  if (!districts.length) {
    return `
      <section class="race">
        <h3>U.S. House</h3>
        <p class="summary">The District of Columbia has no voting member of the House.</p>
      </section>
    `;
  }
  const current = districts.find((district) => district.district === districtId) || null;
  const options = districts.map((district) => {
    const label = district.district === "at-large" ? "At-large" : `District ${district.district}`;
    const selectedAttr = current && current.district === district.district ? " selected" : "";
    return `<option value="${esc(district.district)}"${selectedAttr}>${esc(label)}</option>`;
  }).join("");
  const place = !current
    ? `All ${districts.length} ${districts.length === 1 ? "seat is" : "seats are"} on the ${year} ballot. Choose a district.`
    : current.district === "at-large"
      ? `${stateName(abbr)}'s at-large House seat is on the ${year} ballot.`
      : `${stateName(abbr)}'s ${current.district}${ordinal(current.district)} House seat is on the ${year} ballot.`;
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
      <p class="summary">${esc(place)} The representative will depend on the elections still ahead. No candidate list is compiled for this seat.</p>
    </section>
  `;
}

function ordinal(value) {
  const n = Number(value);
  if (!n) return "";
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
}

function detailHtml() {
  const current = cycle();
  const senate = senateBy(current);
  const governors = governorBy(current);
  if (!selected) {
    return `
      <p class="kicker">${level === "federal" ? "Federal" : "State offices"} · ${esc(current.date)}</p>
      <h2>Choose a state</h2>
      <p class="summary">${level === "federal" ? esc(current.federalNote) : "State offices on this page are governor's races, and the mayor of the District of Columbia when that office is up."}</p>
      <p class="summary">${esc(current.extra)}</p>
    `;
  }
  const name = stateName(selected);
  let body = "";
  if (level === "federal") {
    if (current.president) {
      body += `
        <section class="race">
          <h3>President</h3>
          <p class="summary">The presidency is on the ballot in every state on ${esc(current.date)}. This guide does not list a presidential field.</p>
        </section>
      `;
    }
    if (senate[selected]) body += raceBlock(senate[selected]);
    else if (!current.senate.length) body += `<section class="race"><h3>U.S. Senate</h3><p class="summary">${esc(current.federalNote)}</p></section>`;
    else body += `<section class="race"><h3>U.S. Senate</h3><p class="summary">No regular Senate election in ${esc(name)} in ${year}.</p></section>`;
    if (current.house) body += houseBlock(selected);
  } else if (governors[selected]) {
    body += raceBlock(governors[selected]);
  } else {
    body += `<section class="race"><h3>Governor</h3><p class="summary">No governor's race in ${esc(name)} in ${year}.</p></section>`;
  }
  return `
    <p class="kicker">${level === "federal" ? "Federal" : "State offices"} · ${esc(current.date)}</p>
    <h2>${esc(name)}</h2>
    ${body}
  `;
}

function filteredStates() {
  const q = stateQuery.trim().toLowerCase();
  if (!q) return STATES;
  return STATES.filter((state) => state.name.toLowerCase().includes(q) || state.abbr.toLowerCase().includes(q));
}

function paintMap() {
  const current = cycle();
  const senate = senateBy(current);
  const governors = governorBy(current);
  const box = document.querySelector(".map-box");
  if (!box) return;
  box.classList.toggle("map-federal", level === "federal");
  box.classList.toggle("map-state", level === "state");
  box.querySelectorAll(".state-shape").forEach((shape) => {
    const abbr = shape.dataset.abbr;
    const active = level === "federal" ? Boolean(senate[abbr]) : Boolean(governors[abbr]);
    shape.classList.toggle("is-selected", abbr === selected);
    shape.classList.toggle("has-senate", level === "federal" && Boolean(senate[abbr]));
    shape.classList.toggle("has-gov", level === "state" && Boolean(governors[abbr]));
    shape.classList.toggle("is-quiet", !active);
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("role", "button");
    shape.setAttribute("aria-pressed", abbr === selected ? "true" : "false");
    shape.setAttribute("aria-label", stateName(abbr));
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

function renderChrome() {
  const current = cycle();
  document.querySelectorAll(".years button").forEach((button) => {
    button.setAttribute("aria-pressed", Number(button.dataset.year) === year ? "true" : "false");
  });
  document.querySelectorAll(".level button").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.level === level ? "true" : "false");
  });
  const count = document.querySelector("#cycle-count");
  if (count) {
    count.textContent = current.senate.length
      ? `${current.senate.length} Senate seats in ${current.year}`
      : `No Senate seats in ${current.year}`;
  }
  const legend = document.querySelector(".legend");
  if (level === "federal") {
    legend.innerHTML = current.senate.length
      ? `<span><i class="swatch" style="background:#7ea0cc"></i>Senate seat up in ${year}</span><span><i class="swatch" style="background:#e7eef6"></i>No Senate seat that year</span>`
      : `<span><i class="swatch" style="background:#e7eef6"></i>No regular federal election in ${year}</span>`;
  } else {
    legend.innerHTML = `<span><i class="swatch" style="background:#e7a3ab"></i>Governor or mayor up in ${year}</span><span><i class="swatch" style="background:#e7eef6"></i>No statewide executive race</span>`;
  }
  document.querySelector("#detail").innerHTML = detailHtml();
}

function render() {
  paintMap();
  renderList();
  renderChrome();
}

function writeHash() {
  const next = `#${year}/${level}/${selected || ""}`;
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

function setYear(next) {
  const parsed = Number(next);
  if (!CYCLES.some((item) => item.year === parsed) || parsed === year) return;
  year = parsed;
  districtId = null;
  if (level === "federal" && !cycle().senate.length && !cycle().house) level = "state";
  writeHash();
  render();
}

function readHash() {
  const [yr, lvl, abbr] = location.hash.replace(/^#/, "").split("/");
  const parsed = Number(yr);
  if (CYCLES.some((item) => item.year === parsed)) year = parsed;
  if (lvl === "federal" || lvl === "state") level = lvl;
  selected = STATES.some((state) => state.abbr === abbr) ? abbr : null;
  if (level === "federal" && !cycle().senate.length && !cycle().house) level = "state";
}

function mount() {
  app.innerHTML = `
    <header class="mast">
      <div class="mast-inner">
        <p class="eyebrow">United States · after 2026</p>
        <h1>Ballot<span>IQ</span></h1>
        <p class="lede">Future elections uses the same state map as the 2026 guide. It covers the regular contests already on the calendar for 2027, 2028, 2029, and 2030. A name appears only when a Wikipedia race summary lists that person as the incumbent or as an announced candidate. Open seats and later House fields stay blank.</p>
        <div class="counts">
          <span>${CYCLES.length} cycles</span>
          <span id="cycle-count"></span>
          <span>${HOUSE_COUNT} House seats in even years</span>
        </div>
        <nav class="cycle-nav" aria-label="Election cycle">
          <a href="/">2026 election</a>
          <a href="/future.html" aria-current="page">Future elections</a>
        </nav>
      </div>
      <div class="flag-rule" aria-hidden="true"></div>
    </header>
    <main class="wrap">
      <div class="years" role="group" aria-label="Election year">
        ${CYCLES.map((item) => `
          <button type="button" data-year="${item.year}" aria-pressed="${item.year === year}">
            <strong>${item.year}</strong>
            <small>${esc(item.date.replace("November ", "Nov ").replace(/, \d{4}$/, ""))}</small>
          </button>
        `).join("")}
      </div>
      <div class="level" role="group" aria-label="Federal or state">
        <button type="button" data-level="federal" aria-pressed="${level === "federal"}">
          <strong>Federal</strong>
          <small>Senate seats on that year's calendar, and the House in even years.</small>
        </button>
        <button type="button" data-level="state" aria-pressed="${level === "state"}">
          <strong>State</strong>
          <small>Governors, and the mayor of the District of Columbia when that office is up.</small>
        </button>
      </div>
      <div class="layout">
        <section class="panel" aria-label="State map">
          <div class="finder">
            <label class="field">Find a state
              <input id="state-search" type="search" placeholder="Kentucky, Texas, Virginia" autocomplete="off" />
            </label>
          </div>
          <div class="map-box map-state" id="map">Loading the map…</div>
          <p class="legend"></p>
          <div class="state-list"></div>
        </section>
        <section class="panel detail-col" id="detail" tabindex="-1"></section>
      </div>
      <footer class="foot">
        <p>Office lists and incumbent status were taken from the Wikipedia race summaries for the 2027, 2028, and 2029 gubernatorial elections and the 2028 and 2030 Senate elections. Announced candidates are included only when that summary says they have announced. People described as interested, or as possible candidates, are left off. The 2030 governor map is the set of states that elect a governor in 2026. House candidates for 2028 and 2030 are not listed. This is a reading guide, not an official ballot.</p>
      </footer>
    </main>
  `;

  app.addEventListener("click", (event) => {
    const yearButton = event.target.closest("[data-year]");
    if (yearButton) {
      setYear(yearButton.dataset.year);
      return;
    }
    const levelButton = event.target.closest("[data-level]");
    if (levelButton) {
      setLevel(levelButton.dataset.level);
      return;
    }
    const stateButton = event.target.closest("[data-state]");
    if (stateButton) choose(stateButton.dataset.state);
  });

  app.addEventListener("change", (event) => {
    if (event.target.id === "district-select") {
      districtId = event.target.value || null;
      renderChrome();
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

  render();
  loadMap();
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

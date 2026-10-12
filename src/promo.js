import senateRaces from "./data/senate.json";
import governorRaces from "./data/governors.json";
import houseByState from "./data/house.json";
import moneyByCandidate from "./data/money.json";
import futureFile from "./data/future.json";
import { portraitRecord } from "./portrait.js";
import { ELECTION_2026, startCountdown } from "./countdown.js";

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

const PROFILE = [
  ["experience", "Experience"],
  ["votingRecord", "Votes"],
  ["keyIssues", "Issues"],
  ["campaignPromises", "Promises"],
  ["majorDonors", "Donors"],
  ["endorsements", "Endorsements"],
  ["legislativeRecord", "Bills"],
  ["attendance", "Attendance"],
];

const senateBy = Object.fromEntries(senateRaces.map((race) => [race.state, race]));
const governorBy = Object.fromEntries(governorRaces.map((race) => [race.state, race]));
const cycles = futureFile.cycles;

let mapSvg = "";
let year = 2026;
let level = "federal";
let selected = "TX";
let office = "senate";
let districtId = null;
let personName = null;
let profileKey = "experience";

const demo = document.querySelector("#demo");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function stateName(abbr) {
  return STATES.find((state) => state.abbr === abbr)?.name || abbr;
}

function partyKind(party) {
  const p = String(party || "").toLowerCase();
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

function initials(name) {
  const skip = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  while (parts.length > 1 && skip.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
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

function profileLines(person) {
  if (person.experience || person.promises) {
    return {
      experience: person.experience || [],
      votingRecord: [],
      keyIssues: [],
      campaignPromises: person.promises || [],
      majorDonors: [],
      endorsements: [],
      legislativeRecord: [],
      attendance: [],
    };
  }
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
    addLine(profile[classifyLine(item) || "keyIssues"], item);
  }
  return profile;
}

function cycle() {
  return cycles.find((item) => item.year === year);
}

function activeStates() {
  if (year === 2026) {
    return level === "federal" ? new Set(Object.keys(senateBy)) : new Set(Object.keys(governorBy));
  }
  const current = cycle();
  const races = level === "federal" ? current.senate : current.governors;
  return new Set(races.map((race) => race.state));
}

function levelChoices() {
  if (year === 2027 || year === 2029) return ["state"];
  return ["federal", "state"];
}

function raceFor(abbr) {
  if (year === 2026) {
    if (level === "state") return governorBy[abbr] || null;
    if (office === "house") {
      const districts = houseByState[abbr] || [];
      const district = districts.find((item) => item.district === districtId) || districts[0];
      if (!district) return null;
      return {
        office: district.district === "at-large" ? "U.S. House — At-large" : `U.S. House — District ${district.district}`,
        rating: district.pvi || "",
        candidates: district.candidates || [],
        kind: "house",
        district: district.district,
      };
    }
    return senateBy[abbr] ? { ...senateBy[abbr], kind: "senate" } : null;
  }
  const current = cycle();
  const races = level === "federal" ? current.senate : current.governors;
  const race = races.find((item) => item.state === abbr);
  return race ? { ...race, kind: level === "federal" ? "senate" : "governor" } : null;
}

function moneyFor(person, abbr, kind, district) {
  if (year !== 2026) return null;
  const key = kind === "house"
    ? `house|${abbr}|${district}|${person.name}`
    : kind === "senate"
      ? `senate|${abbr}|${person.name}`
      : null;
  return key ? moneyByCandidate[key] || null : null;
}

function face(name, abbr) {
  const record = portraitRecord(name, abbr);
  if (!record) return `<div class="face missing" aria-hidden="true">${esc(initials(name))}</div>`;
  return `<img class="face" src="${esc(record.src)}" alt="Portrait of ${esc(name)}" width="160" height="200" />`;
}

function credit(name, abbr) {
  const record = portraitRecord(name, abbr);
  if (!record) return "";
  return `<p class="credit"><a href="${esc(record.file)}">${esc(record.credit)}</a> · ${esc(record.license)}</p>`;
}

function moneyBlock(row) {
  if (!row) return "";
  const label = `Individual donors ${row.individual} percent, PACs ${row.pacs} percent, other ${row.other} percent`;
  return `
    <p class="money-label">Money</p>
    <div class="money-bar" role="img" aria-label="${esc(label)}">
      <span class="individual" style="width:${row.individual}%"></span>
      <span class="pacs" style="width:${row.pacs}%"></span>
      <span class="other" style="width:${row.other}%"></span>
    </div>
    <p class="legend-line">
      <i class="swatch individual"></i> ${row.individual}% individuals
      <i class="swatch pacs"></i> ${row.pacs}% PACs
      <i class="swatch other"></i> ${row.other}% other
    </p>
  `;
}

function guideHref() {
  if (year === 2026) return `/#${level}/${selected}`;
  const lvl = levelChoices().includes(level) ? level : levelChoices()[0];
  return `/future.html#${year}/${lvl}/${selected}`;
}

function renderCard() {
  const race = raceFor(selected);
  const districts = year === 2026 && level === "federal" ? (houseByState[selected] || []) : [];
  const hasSenate = year === 2026 ? Boolean(senateBy[selected]) : Boolean(cycle().senate.find((race) => race.state === selected));
  const showOfficeToggle = year === 2026 && level === "federal" && districts.length > 0;

  if (!race || !(race.candidates || []).length) {
    const empty = level === "federal"
      ? (year === 2026 ? "No Senate race. The House seats are still on the ballot." : `No Senate race in ${year}.`)
      : (selected === "DC" ? "No mayor's race." : "No governor's race.");
    return `
      <div class="card empty">
        <p class="kicker">${esc(stateName(selected))}</p>
        <h2>${esc(empty)}</h2>
        ${showOfficeToggle ? officeToggle(hasSenate) : ""}
        <a class="text-link" href="${esc(guideHref())}">Open this state in the guide</a>
      </div>
    `;
  }

  const people = sortPeople(race.candidates);
  if (!people.some((person) => person.name === personName)) personName = people[0].name;
  const person = people.find((item) => item.name === personName);
  const lines = profileLines(person);
  const shown = lines[profileKey] || [];
  const money = moneyFor(person, selected, race.kind, race.district);

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <p class="kicker">${esc(stateName(selected))}${year === 2026 ? "" : ` · ${year}`}</p>
          <h2>${esc(race.office)}</h2>
        </div>
        ${race.rating ? `<span class="rating">${esc(race.rating)}</span>` : ""}
      </div>
      ${showOfficeToggle ? officeToggle(hasSenate) : ""}
      ${race.kind === "house" ? districtSelect(districts) : ""}
      <div class="roster" role="list">
        ${people.map((item) => `
          <button type="button" class="nominee ${partyKind(item.party)} ${item.name === personName ? "is-on" : ""}" data-person="${esc(item.name)}" role="listitem" aria-pressed="${item.name === personName}">
            ${face(item.name, selected)}
            <strong>${esc(item.name)}</strong>
            <em>${esc(item.party)}</em>
          </button>
        `).join("")}
      </div>
      <div class="detail">
        <p class="role">${esc(person.role || "On the ballot")}</p>
        ${credit(person.name, selected)}
        ${moneyBlock(money)}
        <div class="chips" role="tablist" aria-label="Profile">
          ${PROFILE.map(([key, label]) => `
            <button type="button" role="tab" data-profile="${key}" aria-selected="${key === profileKey}">${label}</button>
          `).join("")}
        </div>
        <p class="line">${shown.length ? esc(shown[0]) : "Not compiled in this guide."}</p>
      </div>
      <a class="text-link" href="${esc(guideHref())}">Open this race</a>
    </div>
  `;
}

function officeToggle(hasSenate) {
  return `
    <div class="segment" role="group" aria-label="Office">
      ${hasSenate ? `<button type="button" data-office="senate" aria-pressed="${office === "senate"}">Senate</button>` : ""}
      <button type="button" data-office="house" aria-pressed="${office === "house" || !hasSenate}">House</button>
    </div>
  `;
}

function districtSelect(districts) {
  const current = districts.some((item) => item.district === districtId) ? districtId : districts[0].district;
  districtId = current;
  return `
    <label class="district">District
      <select id="promo-district">
        ${districts.map((item) => {
          const label = item.district === "at-large" ? "At-large" : `District ${item.district}`;
          return `<option value="${esc(item.district)}" ${item.district === current ? "selected" : ""}>${esc(label)}</option>`;
        }).join("")}
      </select>
    </label>
  `;
}

function render() {
  if (!levelChoices().includes(level)) level = levelChoices()[0];
  const choices = levelChoices();
  demo.innerHTML = `
    <div class="board">
      <section class="map-side">
        <div class="years" role="group" aria-label="Election year">
          ${[2026, 2027, 2028, 2029, 2030].map((item) => `
            <button type="button" data-year="${item}" aria-pressed="${item === year}">${item}</button>
          `).join("")}
        </div>
        <div class="levels" role="group" aria-label="Federal or state">
          ${choices.map((item) => `
            <button type="button" data-level="${item}" aria-pressed="${item === level}">
              ${item === "federal" ? "Federal" : "State"}
            </button>
          `).join("")}
        </div>
        <label class="jump">Jump to a state
          <select id="promo-state">
            ${STATES.map((state) => `<option value="${state.abbr}" ${state.abbr === selected ? "selected" : ""}>${esc(state.name)}</option>`).join("")}
          </select>
        </label>
        <div class="map-box map-${level}" id="promo-map">Loading the map…</div>
        <p class="map-key"><i class="${level === "federal" ? "dot senate" : "dot gov"}"></i> ${level === "federal" ? "Senate on the ballot" : "Governor or mayor on the ballot"}</p>
      </section>
      <section class="result" aria-live="polite">
        ${renderCard()}
      </section>
    </div>
  `;
  const box = document.querySelector("#promo-map");
  if (mapSvg && box) box.innerHTML = mapSvg;
  paintMap();
}

function paintMap() {
  const box = document.querySelector("#promo-map");
  if (!box || !box.querySelector("svg")) return;
  const hot = activeStates();
  box.classList.toggle("map-federal", level === "federal");
  box.classList.toggle("map-state", level === "state");
  box.querySelectorAll(".state-shape").forEach((shape) => {
    const abbr = shape.dataset.abbr;
    const on = hot.has(abbr);
    shape.classList.toggle("is-selected", abbr === selected);
    shape.classList.toggle("is-hot", on);
    shape.classList.toggle("is-quiet", !on);
    shape.setAttribute("tabindex", "0");
    shape.setAttribute("role", "button");
    shape.setAttribute("aria-pressed", abbr === selected ? "true" : "false");
    shape.setAttribute("aria-label", stateName(abbr));
  });
}

function choose(abbr) {
  if (!STATES.some((state) => state.abbr === abbr)) return;
  if (abbr !== selected) {
    districtId = null;
    personName = null;
    profileKey = "experience";
    const districts = houseByState[abbr] || [];
    const senate = year === 2026 ? senateBy[abbr] : cycle().senate.find((race) => race.state === abbr);
    office = senate || !districts.length ? "senate" : "house";
  }
  selected = abbr;
  render();
}

async function loadMap() {
  const box = document.querySelector("#promo-map");
  try {
    const response = await fetch("/us.svg");
    if (!response.ok) throw new Error("map");
    mapSvg = await response.text();
    box.innerHTML = mapSvg;
    paintMap();
  } catch {
    box.textContent = "The map did not load. Use the state menu.";
  }
}

demo.addEventListener("click", (event) => {
  const yearButton = event.target.closest("[data-year]");
  if (yearButton) {
    year = Number(yearButton.dataset.year);
    personName = null;
    profileKey = "experience";
    if (!levelChoices().includes(level)) level = levelChoices()[0];
    render();
    return;
  }
  const levelButton = event.target.closest("[data-level]");
  if (levelButton) {
    level = levelButton.dataset.level;
    personName = null;
    profileKey = "experience";
    render();
    return;
  }
  const officeButton = event.target.closest("[data-office]");
  if (officeButton) {
    office = officeButton.dataset.office;
    personName = null;
    profileKey = "experience";
    render();
    return;
  }
  const personButton = event.target.closest("[data-person]");
  if (personButton) {
    personName = personButton.dataset.person;
    profileKey = "experience";
    render();
    return;
  }
  const profileButton = event.target.closest("[data-profile]");
  if (profileButton) {
    profileKey = profileButton.dataset.profile;
    render();
    return;
  }
  const shape = event.target.closest(".state-shape");
  if (shape) choose(shape.dataset.abbr);
});

demo.addEventListener("change", (event) => {
  if (event.target.id === "promo-state") choose(event.target.value);
  if (event.target.id === "promo-district") {
    districtId = event.target.value;
    personName = null;
    render();
  }
});

demo.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const shape = event.target.closest(".state-shape");
  if (!shape) return;
  event.preventDefault();
  choose(shape.dataset.abbr);
});

render();
loadMap();
startCountdown(document.querySelector("#countdown"), () => ELECTION_2026);

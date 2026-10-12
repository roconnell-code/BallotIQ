const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

export function easternMidnight(year, month, day) {
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const nyClock = new Date(utcNoon.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = utcNoon.getTime() - nyClock.getTime();
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + offset);
}

export function parseUsDate(text) {
  const match = String(text).match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  return easternMidnight(Number(match[3]), month, Number(match[2]));
}

export const ELECTION_2026 = easternMidnight(2026, 11, 3);

function pad(value) {
  return String(value).padStart(2, "0");
}

function whenLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function countdownMarkup() {
  return `
    <section class="countdown" id="countdown" aria-label="Time until Election Day">
      <p class="countdown-kicker">Election Day</p>
      <p class="countdown-when" data-countdown-when>November 3, 2026</p>
      <div class="countdown-units" data-countdown-units>
        <div><strong data-countdown-days>—</strong><span>Days</span></div>
        <div><strong data-countdown-hours>—</strong><span>Hours</span></div>
        <div><strong data-countdown-minutes>—</strong><span>Minutes</span></div>
        <div><strong data-countdown-seconds>—</strong><span>Seconds</span></div>
      </div>
      <p class="countdown-status" data-countdown-status hidden></p>
    </section>
  `;
}

export function startCountdown(root, getTarget) {
  if (!root) return () => {};
  const when = root.querySelector("[data-countdown-when]");
  const units = root.querySelector("[data-countdown-units]");
  const status = root.querySelector("[data-countdown-status]");
  const slots = {
    days: root.querySelector("[data-countdown-days]"),
    hours: root.querySelector("[data-countdown-hours]"),
    minutes: root.querySelector("[data-countdown-minutes]"),
    seconds: root.querySelector("[data-countdown-seconds]"),
  };

  function showStatus(text) {
    units.hidden = true;
    status.hidden = false;
    status.textContent = text;
    root.setAttribute("aria-label", text);
  }

  function tick() {
    const target = getTarget();
    if (!target) return;
    const now = Date.now();
    const start = target.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const label = whenLabel(target);
    if (when.textContent !== label) when.textContent = label;

    if (now >= end) {
      showStatus("Election Day has passed.");
      return;
    }
    if (now >= start) {
      showStatus("Election Day is today.");
      return;
    }

    units.hidden = false;
    status.hidden = true;
    const diff = start - now;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    slots.days.textContent = String(days);
    slots.hours.textContent = pad(hours);
    slots.minutes.textContent = pad(minutes);
    slots.seconds.textContent = pad(seconds);
    if (seconds === 0 || !root.getAttribute("aria-label")?.includes("days")) {
      root.setAttribute(
        "aria-label",
        `${days} days, ${hours} hours, ${minutes} minutes until Election Day, ${label}`,
      );
    }
  }

  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

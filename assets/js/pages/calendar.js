(function () {
  "use strict";

  // Data comes from syncHandlers/calendar (Commit Swimming feed). Dates and times
  // are handled in the team's time zone so they match the pool clock.
  const TZ = "America/Los_Angeles";
  const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const STORAGE_KEY = "dare-practice-group";
  const COMMIT_URL = "https://team.commitswimming.com/sign-in";

  const partsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let calendar = null;
  let deadlines = {};

  /* ── Date helpers (dates are "YYYY-MM-DD" strings) ───── */

  function zoned(date) {
    const p = {};
    partsFormatter.formatToParts(date).forEach((part) => {
      p[part.type] = part.value;
    });
    return {
      ymd: `${p.year}-${p.month}-${p.day}`,
      minutes: Number(p.hour) * 60 + Number(p.minute),
    };
  }

  function ymdToUTC(ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  function addDays(ymd, n) {
    const d = ymdToUTC(ymd);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(fromYmd, toYmd) {
    return Math.round((ymdToUTC(toYmd) - ymdToUTC(fromYmd)) / 86400000);
  }

  function formatDay(ymd, opts) {
    return ymdToUTC(ymd).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts));
  }

  function toMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function formatClock(hhmm, withSuffix) {
    const [h, m] = hhmm.split(":").map(Number);
    const text = `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
    return withSuffix ? `${text} ${h < 12 ? "am" : "pm"}` : text;
  }

  function formatRange(start, end) {
    const sameHalf = toMinutes(start) < 720 === toMinutes(end) < 720;
    return `${formatClock(start, !sameHalf)}–${formatClock(end, true)}`;
  }

  function formatDuration(mins) {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function mapsUrl(address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }

  function countdownText(today, ymd) {
    const diff = daysBetween(today, ymd);
    if (diff < 0) return "Happening now";
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return `In ${diff} days`;
  }

  /* ── Meets & events: next one featured, the rest listed ── */

  function updateEvents() {
    const now = new Date();
    const today = zoned(now).ymd;
    const slot = document.querySelector("[data-next-slot]");
    const list = document.querySelector(".ev-list");
    const laterTitle = document.querySelector("[data-later-title]");
    if (!slot || !list) return;

    // Put a previously featured event back at the top of the list before re-sorting.
    const featured = slot.querySelector(".ev");
    if (featured) list.prepend(featured);

    const items = Array.from(list.querySelectorAll(".ev"));
    items.forEach((item) => {
      item.hidden = new Date(item.dataset.end) < now;
      const badge = item.querySelector(".ev-countdown");
      if (badge) badge.textContent = item.hidden ? "" : countdownText(today, zoned(new Date(item.dataset.start)).ymd);
    });

    const upcoming = items.filter((item) => !item.hidden);
    if (upcoming.length) {
      slot.appendChild(upcoming[0]);
      slot.hidden = false;
    } else {
      slot.hidden = true;
      if (!list.querySelector(".ev-empty")) {
        list.insertAdjacentHTML("beforeend", '<li class="ev-empty">No meets or events are scheduled yet. Check back soon.</li>');
      }
    }
    laterTitle.hidden = upcoming.length < 2;
  }

  /* ── Lookup buttons ───────────────────────────────────── */

  function initTools() {
    const tools = document.querySelector("[data-calendar-tools]");
    const buttons = Array.from(tools.querySelectorAll("[aria-controls]"));

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const opening = button.getAttribute("aria-expanded") !== "true";
        // Only one lookup is open at a time.
        buttons.forEach((b) => {
          const isThis = b === button;
          b.setAttribute("aria-expanded", String(isThis && opening));
          document.getElementById(b.getAttribute("aria-controls")).hidden = !(isThis && opening);
        });
        if (opening) {
          document.getElementById(button.getAttribute("aria-controls")).querySelector("select").focus();
        }
      });
    });
    tools.hidden = false;
  }

  /* ── Practice times ───────────────────────────────────── */

  function slotsOn(group, ymd) {
    const code = DAY_CODES[ymdToUTC(ymd).getUTCDay()];
    return group.slots
      .filter((s) =>
        s.days.includes(code) &&
        ymd >= s.from &&
        (!s.until || ymd <= s.until) &&
        !(s.except || []).includes(ymd))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function nextPractice(group, ymd) {
    for (let i = 1; i < 21; i++) {
      const day = addDays(ymd, i);
      const slot = slotsOn(group, day)[0];
      if (slot) return { day, slot };
    }
    return null;
  }

  // Returns " at <pool> (directions)", or "" when Commit has no usable location.
  function atPlace(slot) {
    if (!slot.place && !slot.address) return "";
    const name = esc(slot.place || slot.address);
    if (!slot.address) return ` at ${name}`;
    return ` at ${name} (<a href="${esc(mapsUrl(slot.address))}" target="_blank" rel="noopener noreferrer">directions</a>)`;
  }

  function initPractice() {
    const select = document.querySelector("[data-practice-select]");
    calendar.practices.forEach((g) => {
      select.add(new Option(g.name, g.id));
    });

    let saved = "";
    try {
      saved = localStorage.getItem(STORAGE_KEY) || "";
    } catch (err) {
      // Storage can be blocked; the choice just won't be remembered.
    }
    if (calendar.practices.some((g) => g.id === saved)) select.value = saved;

    select.addEventListener("change", () => {
      try {
        localStorage.setItem(STORAGE_KEY, select.value);
      } catch (err) {
        // Ignore storage failures.
      }
      renderPractice();
    });
    renderPractice();
  }

  function renderPractice() {
    const result = document.querySelector("[data-practice-result]");
    const group = calendar.practices.find((g) => g.id === document.querySelector("[data-practice-select]").value);
    if (!group) {
      result.innerHTML = "";
      return;
    }

    const now = zoned(new Date());
    const today = slotsOn(group, now.ymd);
    const current = today.find((s) => toMinutes(s.end) > now.minutes);
    let html;

    if (today.length) {
      const times = today.map((s) => `<strong>${formatRange(s.start, s.end)}</strong>`).join(" and ");
      html = `<p class="tool-today">Today: ${times}${atPlace(today[0])}</p>`;
      if (current) {
        const startsIn = toMinutes(current.start) - now.minutes;
        html += `<p class="tool-sub">${startsIn > 0
          ? `Starts in ${formatDuration(startsIn)}.`
          : `Practice is on now, until ${formatClock(current.end, true)}.`}</p>`;
      } else {
        html += `<p class="tool-sub">Today's practice is over.</p>`;
      }
    } else {
      html = `<p class="tool-today">No practice today.</p>`;
    }

    if (!current) {
      const next = nextPractice(group, now.ymd);
      if (next) {
        const when = daysBetween(now.ymd, next.day) === 1
          ? "tomorrow"
          : formatDay(next.day, { weekday: "long", month: "short", day: "numeric" });
        html += `<p class="tool-sub">Next practice is ${when}, ${formatRange(next.slot.start, next.slot.end)}${atPlace(next.slot)}.</p>`;
      }
    }

    const week = [];
    for (let i = 0; i < 7; i++) {
      const ymd = addDays(now.ymd, i);
      const slots = slotsOn(group, ymd);
      const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(ymd, { weekday: "short", month: "short", day: "numeric" });
      const body = slots.length
        ? slots.map((s) => `${formatRange(s.start, s.end)}<small>${esc(s.place || s.address || "")}</small>`).join("")
        : `<span class="tool-off">No practice</span>`;
      week.push(`<li><span class="tool-day">${label}</span><span>${body}</span></li>`);
    }

    result.innerHTML = `${html}
      <ul class="tool-week" aria-label="${esc(group.name)} practices this week">${week.join("")}</ul>
      <p class="tool-note">Times can change for holidays and meets. Coaches post changes in <a href="${COMMIT_URL}" target="_blank" rel="noopener noreferrer">Commit</a>.</p>`;
  }

  /* ── Entry deadlines ──────────────────────────────────── */

  function upcomingMeets() {
    const today = zoned(new Date()).ymd;
    return calendar.items.filter((it) => it.kind === "meet" && zoned(new Date(it.end)).ymd >= today);
  }

  function meetDates(m) {
    const start = zoned(new Date(m.start)).ymd;
    const end = zoned(new Date(m.end)).ymd;
    const first = formatDay(start, { month: "short", day: "numeric" });
    if (start === end) return first;
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    return `${first}–${formatDay(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
  }

  function initDeadlines() {
    const select = document.querySelector("[data-deadline-select]");
    upcomingMeets().forEach((m) => {
      select.add(new Option(`${m.title} (${meetDates(m)})`, m.id));
    });
    select.addEventListener("change", renderDeadline);
  }

  function renderDeadline() {
    const result = document.querySelector("[data-deadline-result]");
    const meet = calendar.items.find((it) => it.id === document.querySelector("[data-deadline-select]").value);
    if (!meet) {
      result.innerHTML = "";
      return;
    }

    const today = zoned(new Date()).ymd;
    const deadline = deadlines[meet.id] && deadlines[meet.id].deadline;
    const register = `<a href="${COMMIT_URL}" target="_blank" rel="noopener noreferrer">Register in Commit</a>`;
    let html;

    if (!deadline) {
      html = `<p class="tool-today">The entry deadline hasn't been posted yet.</p>
        <p class="tool-sub">Check Commit or ask your swimmer's coach.</p>`;
    } else {
      const date = formatDay(deadline, { weekday: "long", month: "long", day: "numeric" });
      const left = daysBetween(today, deadline);
      if (left < 0) {
        html = `<p class="tool-today">Entries closed on ${date}.</p>
          <p class="tool-sub">Ask your swimmer's coach about late entries.</p>`;
      } else {
        const remaining = left === 0 ? "Today is the last day to enter." : left === 1 ? "1 day left." : `${left} days left.`;
        html = `<p class="tool-today">Entries close <strong>${date}</strong>.</p>
          <p class="tool-sub">${remaining} ${register}</p>`;
      }
    }

    result.innerHTML = `${html}<p class="tool-note">Meet dates: ${meetDates(meet)}.</p>`;
  }

  /* ── Boot ─────────────────────────────────────────────── */

  async function init() {
    updateEvents();

    try {
      const [calRes, dlRes] = await Promise.all([
        fetch("/assets/data/calendar.json", { cache: "no-cache" }),
        fetch("/assets/data/meet-deadlines.json", { cache: "no-cache" }),
      ]);
      if (!calRes.ok) throw new Error("calendar.json " + calRes.status);
      calendar = await calRes.json();
      if (dlRes.ok) deadlines = (await dlRes.json()).meets || {};
    } catch (err) {
      // Without data the lookups stay hidden; the events list still works.
      console.error("[calendar]", err);
      return;
    }

    initPractice();
    initDeadlines();
    initTools();

    // Keep countdowns and "starts in" current while the page is open.
    setInterval(() => {
      updateEvents();
      renderPractice();
    }, 60000);
  }

  document.addEventListener("layout:ready", init, { once: true });
})();

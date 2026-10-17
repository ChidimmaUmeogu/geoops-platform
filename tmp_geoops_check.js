
/* ============================================================
   FACILITATOR CONFIG
   ============================================================ */
/* --- Team roster ---
   Undergraduate pool (14 teams) + Early Career pool (6 teams) = 20.
   Participants pick from this list — no free typing, so the sheet
   never gets "Canopy" / "canopy" / "Team Canopy" as three teams. */
const TEAM_NAMES = [
  "UG — Canopy Watch",
  "UG — Kaolin Ridge",
  "UG — Iroko Unit",
  "UG — Silt Line",
  "UG — Ebony Trace",
  "UG — Mahogany Track",
  "UG — Raffia Point",
  "UG — Buttress Root",
  "UG — Understory",
  "UG — Rattan Path",
  "UG — Hardwood Bearing",
  "UG — Afzelia Grid",
  "UG — Liana Cross",
  "UG — Clearwater Bend",
  "EC — Sentinel Pass",
  "EC — Baseline North",
  "EC — Meridian Fold",
  "EC — Transect Nine",
  "EC — Datum Line",
  "EC — Reference Frame"
];

const EVENT_MINUTES = 120; // total event clock for the full five-mission run
const MISSION_TIME_BUDGETS = [10, 20, 20, 30, 40]; // minutes per mission: M1 short, M4 synthesis-heavy
const LEADERBOARD_MISSION_WEIGHT = 0.6; // 60% of total score comes from mission progression and time efficiency

/* --- Submission endpoint ---
   Paste your Google Apps Script Web App URL here (see
   submission-endpoint-setup.md). Leave empty to disable logging —
   submissions then stay local to the browser and are lost on refresh. */
const SUBMISSION_ENDPOINT = "https://script.google.com/macros/s/AKfycbwL5DBcZvK16nGOo8-xWPWHihXJyGzQzUowY_1XnU9BuLU-bIgyuDaho9PdNYt4GCri/exec";
const SESSION_STORAGE_KEY = "geoops-field-to-map-session-v1";
const SUBMISSION_QUEUE_KEY = "geoops-submission-queue-v1";
const DRAFT_STORAGE_KEY = "geoops-field-to-map-drafts-v1";

/* --- Data source config ---
  Participants navigate Google Earth and create a shared Earth project. */
const GOOGLE_EARTH_AOI_URL = "https://earth.google.com/web/search/Cross+River+State/@6.35366266,14.73082413,1831.52544868a,11316985.01753211d,35y,0h,0t,0r/data=CjsiJgokCXLeBiUpOTBAEYPX9eVX5_E_GY40_4-dbzlAIWcHDHRcMCDAOg0IAREAAAAAAADwPyABQgIIAToDCgEwQgIIAEoNCP___________wEQAA?authuser=0";
const GOOGLE_EARTH_PROJECT_URL = "https://earth.google.com/web/";

const MISSIONS = [
  {
    key: "m1", title: "Mission 1 — Reading the Signal",
    brief: "Before finding anything, you need to know what you're looking at. Label each patch: intact forest, disturbed, water/non-forest, or genuinely unclear.",
    teaches: "Basic satellite data interpretation — building the eye before asking it to find anything.",
    built: true
  },
  {
    key: "m2", title: "Mission 2 — Spot the Disturbance",
    brief: "Using your AOI and a stable reference area, trace where real disturbance appears — and justify each flag against what the reference area shows for the same years.",
    teaches: "Recognising disturbance patches, calibrated against a real baseline.",
    built: true
  },
  {
    key: "m3", title: "Mission 3 — Trace the Route",
    brief: "Disturbance rarely happens without access. Trace visible routes near flagged areas and classify each as active or inactive — then say what that implies about whether logging is ongoing.",
    teaches: "Recognising access routes, and reading active vs. historical activity.",
    built: true
  },
  {
    key: "m4", title: "Mission 4 — From Data to Information",
    brief: "Combine what you found — where, roughly when, and whether access looked active — into one coherent, honest statement. State your confidence level, and what would raise it.",
    teaches: "Synthesis — turning separate findings into one defensible claim.",
    built: false
  },
  {
    key: "m5", title: "Mission 5 — Tell the Story",
    brief: "Write two things from your own findings: a short policy brief, and a ~1500-word field report in journalist voice.",
    teaches: "Communicating evidence to two different audiences, honestly.",
    built: false
  }
];

/* ============================================================
   State
   ============================================================ */
let unlockedIndex = 0; // index of the highest unlocked mission
let completed = {};
let eventSecondsLeft = EVENT_MINUTES * 60;
let clockId = null;
let started = false;
let teamName = "";
let eventStartTime = null;
let eventDeadline = null;
let timeUpShown = false;

function saveSession() {
  if (!teamName || !eventDeadline) return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      teamName: teamName,
      eventStartTime: eventStartTime,
      eventDeadline: eventDeadline,
      unlockedIndex: unlockedIndex,
      completed: completed,
      activeIndex: activeIndex
    }));
  } catch (error) {
  }
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "null");
    if (!saved || !TEAM_NAMES.includes(saved.teamName) || !saved.eventDeadline || saved.eventDeadline <= Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return false;
    }
    teamName = saved.teamName;
    eventStartTime = saved.eventStartTime;
    eventDeadline = saved.eventDeadline;
    unlockedIndex = Math.min(saved.unlockedIndex || 0, MISSIONS.length - 1);
    completed = saved.completed || {};
    activeIndex = Math.min(saved.activeIndex || 0, unlockedIndex);
    return true;
  } catch (error) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return false;
  }
}

function saveDrafts() {
  const fields = {};
  const routeStatuses = {};
  document.querySelectorAll("input.field-input-sm, textarea.field-input-sm, select.field-input-sm").forEach((field) => {
    fields[field.id] = field.value;
  });
  document.querySelectorAll(".route-choice-btn.selected[data-route-index]").forEach((button) => {
    routeStatuses[button.dataset.routeIndex] = button.dataset.routeStatus;
  });
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ fields: fields, m1Answers: m1Answers, routeStatuses: routeStatuses }));
  } catch (error) {
    return;
  }
}

function restoreDrafts() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
  } catch (error) {
    return;
  }
  if (!saved) return;
  Object.entries(saved.fields || {}).forEach(([id, value]) => {
    const field = document.getElementById(id);
    if (field) field.value = value;
  });
  m1Answers = saved.m1Answers || {};
  Object.entries(m1Answers).forEach(([index, key]) => {
    const row = document.querySelectorAll(".choice-row")[Number(index)];
    const choice = row && Array.from(row.children).find((button) => button.textContent === LABELS.find((label) => label.key === key)?.text);
    if (choice) choice.classList.add("selected");
  });
  Object.entries(saved.routeStatuses || {}).forEach(([index, status]) => {
    const button = document.querySelector('.route-choice-btn[data-route-index="' + index + '"][data-route-status="' + status + '"]');
    if (button) button.click();
  });
  document.querySelectorAll("input.field-input-sm, textarea.field-input-sm, select.field-input-sm").forEach((field) => {
    field.addEventListener("input", saveDrafts);
    field.addEventListener("change", saveDrafts);
    if (field.value) field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const m1Submit = document.getElementById("m1-submit");
  if (m1Submit) m1Submit.disabled = Object.keys(m1Answers).length < PATCHES.length;
}

/* ============================================================
   Submission logging
   ============================================================ */
function elapsedString() {
  if (!eventStartTime) return "";
  const s = Math.floor((Date.now() - eventStartTime) / 1000);
  const m = Math.floor(s / 60), sec = s % 60;
  return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}

function logSubmission(mission, answers, statusElId) {
  if (!SUBMISSION_ENDPOINT) return; // logging disabled
  const payload = { 
    submissionId: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)), 
    teamName: teamName, 
    mission: mission, 
    elapsed: elapsedString(), 
    answers: answers 
  }; 
  let queue;
  try {
    queue = JSON.parse(localStorage.getItem(SUBMISSION_QUEUE_KEY) || "[]");
  } catch (error) {
    queue = [];
  }
  queue.push(payload);
  try {
    localStorage.setItem(SUBMISSION_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    setSubmissionStatus(statusElId, "failed");
    return;
  }
  setSubmissionStatus(statusElId, "pending");
  flushSubmissionQueue(statusElId);
}

function setSubmissionStatus(statusElId, state) {
  const el = document.getElementById(statusElId);
  if (!el) return;
  if (state === "sent") { 
    el.innerHTML = '<span style="color:#6FA37B;font-family:\'IBM Plex Mono\',monospace;font-size:11px;">✓ Sent to facilitator sheet (verify the row if network coverage is poor)</span>'; 
  } else if (state === "pending") { 
    el.innerHTML = '<span style="color:#9A5A24;font-family:\'IBM Plex Mono\',monospace;font-size:11px;">↻ Saved on this device; sending when connected...</span> ' + retrySubmissionButton(statusElId);
  } else { 
    el.innerHTML = '<span style="color:#C0503D;font-family:\'IBM Plex Mono\',monospace;font-size:11px;">⚠ Still waiting to send. Keep this tab open or tell a facilitator.</span> ' + retrySubmissionButton(statusElId);
  }
}

function retrySubmissionButton(statusElId) {
  const buttonId = "retry-" + statusElId;
  setTimeout(() => {
    const button = document.getElementById(buttonId);
    if (button) button.addEventListener("click", () => {
      button.disabled = true;
      button.textContent = "Retrying...";
      setSubmissionStatus(statusElId, "pending");
      flushSubmissionQueue(statusElId);
    });
  }, 0);
  return '<button type="button" id="' + buttonId + '" style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:#35513C;background:#F5F3EB;border:1px solid #9CAA9C;padding:3px 7px;cursor:pointer;">Retry sending</button>';
}

let submissionFlushInFlight = false;
async function flushSubmissionQueue(statusElId) {
  if (submissionFlushInFlight || !SUBMISSION_ENDPOINT || !navigator.onLine) return;
  let queue;
  try {
    queue = JSON.parse(localStorage.getItem(SUBMISSION_QUEUE_KEY) || "[]");
  } catch (error) {
    queue = [];
  }
  if (!queue.length) return;
  submissionFlushInFlight = true;
  const item = queue[0];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    await fetch(SUBMISSION_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(item),
      signal: controller.signal
    });
    queue.shift();
    localStorage.setItem(SUBMISSION_QUEUE_KEY, JSON.stringify(queue));
    setSubmissionStatus(statusElId, "sent");
  } catch (error) {
    setSubmissionStatus(statusElId, "failed");
  } finally {
    clearTimeout(timeoutId);
    submissionFlushInFlight = false;
  }
}

/* ============================================================
   Tabs + progress
   ============================================================ */
function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = "";
  MISSIONS.forEach((m, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isUnlocked = i <= unlockedIndex;
    const isComplete = !!completed[m.key];
    btn.className = "tab-btn" + (isUnlocked ? " unlocked" : " locked") + (isComplete ? " complete" : "");
    btn.textContent = (isUnlocked ? "" : "🔒 ") + "M" + (i + 1);
    btn.disabled = !isUnlocked;
    btn.addEventListener("click", () => { if (isUnlocked) showMission(i); });
    tabsEl.appendChild(btn);
  });
}

function renderProgress() {
  const track = document.getElementById("progress-track");
  track.innerHTML = "";
  MISSIONS.forEach((m, i) => {
    const seg = document.createElement("div");
    seg.className = "progress-seg" + (completed[m.key] ? " complete" : i === unlockedIndex ? " current" : "");
    track.appendChild(seg);
  });
}

let activeIndex = 0;
function showMission(i) {
  activeIndex = i;
  saveSession();
  document.querySelectorAll(".mission-panel").forEach((p, idx) => {
    p.classList.toggle("active", idx === i);
  });
  document.querySelectorAll(".tab-btn").forEach((b, idx) => {
    b.classList.toggle("active", idx === i);
  });
  if (i === 0) setTimeout(initMission1Maps, 30);
}

function unlockNext(fromIndex) {
  completed[MISSIONS[fromIndex].key] = true;
  if (fromIndex === unlockedIndex && fromIndex < MISSIONS.length - 1) {
    unlockedIndex = fromIndex + 1;
  }
  renderTabs();
  renderProgress();
  saveSession();
}

/* ============================================================
   Event clock
   ============================================================ */
function formatClock(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h > 0 ? String(h).padStart(2, "0") + ":" : "") + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
}
function tickEventClock() {
  if (!eventDeadline) return;
  eventSecondsLeft = Math.max(0, Math.ceil((eventDeadline - Date.now()) / 1000));
  const el = document.getElementById("event-clock");
  el.textContent = formatClock(eventSecondsLeft);
  el.classList.toggle("warn", eventSecondsLeft <= 1800 && eventSecondsLeft > 300);
  el.classList.toggle("crit", eventSecondsLeft <= 300);
  if (eventSecondsLeft <= 0 && !timeUpShown) {
    clearInterval(clockId);
    showTimeUp();
  }
}
function showTimeUp() {
  if (timeUpShown) return;
  timeUpShown = true;
  const overlay = document.createElement("div");
  overlay.className = "time-up-overlay";
  overlay.innerHTML =
    '<h2>Event time is up</h2>' +
    '<p>Whatever mission you\'re on now is where it stops. Submit what you have — facilitators will pick up from here for judging.</p>';
  document.body.appendChild(overlay);
}

/* ============================================================
   Mission panel rendering
   ============================================================ */
function buildMissionPanels() {
  const container = document.getElementById("mission-panels");
  MISSIONS.forEach((m, i) => {
    const panel = document.createElement("div");
    panel.className = "mission-panel";
    panel.id = "panel-" + m.key;

    const header = document.createElement("div");
    header.className = "mission-header";
    header.innerHTML =
      '<div class="mission-title">' + m.title + '</div>' +
      '<p class="mission-brief">' + m.brief + '</p>' +
      '<div class="mission-teaches">Teaches: ' + m.teaches + '</div>';
    panel.appendChild(header);

    if (m.key === "m1") {
      panel.appendChild(buildMission1Content());
    } else if (m.key === "m2") {
      panel.appendChild(buildMission2Content());
    } else if (m.key === "m3") {
      panel.appendChild(buildMission3Content());
    } else if (m.key === "m4") {
      panel.appendChild(buildMission4Content());
    } else if (m.key === "m5") {
      panel.appendChild(buildMission5Content());
    } else {
      const box = document.createElement("div");
      box.className = "placeholder-box";
      box.innerHTML =
        "This mission's real interaction isn't built yet.<br/>" +
        "Once it exists, it replaces this box — the unlock flow around it won't need to change.";
      const devBtn = document.createElement("button");
      devBtn.className = "dev-btn";
      devBtn.type = "button";
      devBtn.textContent = "[DEV ONLY] Mark " + m.key.toUpperCase() + " complete";
      devBtn.addEventListener("click", () => unlockNext(i));
      box.appendChild(document.createElement("br"));
      box.appendChild(devBtn);
      panel.appendChild(box);
    }

    container.appendChild(panel);
  });
}

/* ============================================================
   Mission 1 — real content (ported)
   ============================================================ */
const PATCHES = [
  {
    lat: 5.4589, lng: 8.3522, zoom: 16,
    correctLabel: "intact",
    explanation: "Verified together via screenshot — uniform dark-green canopy, no texture breaks, away from any river or road access. This is our confirmed stable reference point.",
    verified: true
  },
  {
    lat: 4.9518, lng: 8.3220, zoom: 14,
    correctLabel: "water",
    explanation: "PLACEHOLDER — approximate Calabar/Cross River estuary area. Confirm in Google Maps before use.",
    verified: false
  },
  {
    lat: 5.10, lng: 8.32, zoom: 15,
    correctLabel: "disturbed",
    explanation: "PLACEHOLDER — approximate area near known oil palm estates south of Akamkpa (Schoneveld 2014, Fig. 2). Confirm visually before use.",
    verified: false
  },
  {
    lat: 5.30, lng: 8.40, zoom: 15,
    correctLabel: "unclear",
    explanation: "PLACEHOLDER — needs a facilitator to find and confirm a genuinely ambiguous patch here.",
    verified: false
  }
];
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS = [
  { key: "intact", text: "Intact forest" },
  { key: "disturbed", text: "Disturbed" },
  { key: "water", text: "Water / non-forest" },
  { key: "unclear", text: "Genuinely unclear" }
];
let m1Answers = {};
let m1Submitted = false;

function buildMission1Content() {
  const wrap = document.createElement("div");
  const list = document.createElement("div");
  list.id = "patch-list";
  wrap.appendChild(list);

  PATCHES.forEach((patch, index) => {
    const card = document.createElement("div");
    card.className = "patch-card";

    const mapDiv = document.createElement("div");
    mapDiv.className = "patch-map";
    mapDiv.id = "m1-map-" + index;
    card.appendChild(mapDiv);

    const bar = document.createElement("div");
    bar.className = "patch-label-bar";
    const idx = document.createElement("div");
    idx.className = "patch-index";
    idx.textContent = "Patch " + (index + 1) + (patch.verified ? "" : " (unverified placeholder)");
    bar.appendChild(idx);

    const row = document.createElement("div");
    row.className = "choice-row";
    LABELS.forEach((l) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn"; btn.type = "button"; btn.textContent = l.text;
      btn.addEventListener("click", () => {
        if (m1Submitted) return;
        m1Answers[index] = l.key;
        Array.from(row.children).forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
        document.getElementById("m1-submit").disabled = Object.keys(m1Answers).length < PATCHES.length;
        saveDrafts();
      });
      row.appendChild(btn);
    });
    bar.appendChild(row);

    const feedback = document.createElement("div");
    feedback.className = "feedback-row";
    feedback.id = "m1-feedback-" + index;
    bar.appendChild(feedback);

    card.appendChild(bar);
    list.appendChild(card);
  });

  const submitRow = document.createElement("div");
  submitRow.className = "submit-row";
  const submitBtn = document.createElement("button");
  submitBtn.className = "submit-btn"; submitBtn.id = "m1-submit"; submitBtn.disabled = true;
  submitBtn.type = "button"; submitBtn.textContent = "Check my reading";
  submitBtn.addEventListener("click", submitMission1);
  submitRow.appendChild(submitBtn);
  wrap.appendChild(submitRow);

  const summarySlot = document.createElement("div");
  summarySlot.id = "m1-summary-slot";
  wrap.appendChild(summarySlot);

  return wrap;
}

function initMission1Maps() {
  PATCHES.forEach((patch, index) => {
    const el = document.getElementById("m1-map-" + index);
    if (!el || el._leaflet_id) return; // already initialized
    const map = L.map(el, {
      zoomControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, tap: false,
    }).setView([patch.lat, patch.lng], patch.zoom);
    L.tileLayer(TILE_URL, { attribution: "Tiles &copy; Esri", maxZoom: 18 }).addTo(map);
  });
}

function submitMission1() {
  m1Submitted = true;
  let correct = 0;
  PATCHES.forEach((patch, index) => {
    const chosen = m1Answers[index];
    const isCorrect = chosen === patch.correctLabel;
    if (isCorrect) correct++;
    const fb = document.getElementById("m1-feedback-" + index);
    fb.classList.add(isCorrect ? "correct" : "incorrect");
    fb.innerHTML =
      '<span class="feedback-tag">' + (isCorrect ? "Matches the facilitator's read" : "Facilitator read this differently") + '</span>' +
      patch.explanation;
  });

  const pct = Math.round((correct / PATCHES.length) * 100);
  let tier, message;
  if (pct >= 75) { tier = "Strong eye"; message = "You're reading these patches close to how the facilitator read them. That's the literacy the rest of the missions build on."; }
  else if (pct >= 40) { tier = "Getting there"; message = "Some reads matched, some didn't — normal on a first pass. Check where you and the facilitator disagreed."; }
  else { tier = "Keep practicing"; message = "This is why Mission 1 isn't timed or scored competitively. Go through each explanation before moving on."; }

  const slot = document.getElementById("m1-summary-slot");
  slot.innerHTML =
    '<div class="summary-panel">' +
      '<div class="summary-tag">' + tier + '</div>' +
      '<div class="summary-body">' + message + '</div>' +
      '<div class="summary-score">' + correct + ' / ' + PATCHES.length + ' matched the facilitator\'s read</div>' +
      '<div id="m1-send-status" style="margin-top:10px;"></div>' +
      '<button class="continue-btn" id="m1-continue">Continue to Mission 2</button>' +
    '</div>';
  document.getElementById("m1-submit").style.display = "none";
  logSubmission("Mission 1 — Reading the Signal",
    { score: correct + "/" + PATCHES.length, patchReads: m1Answers },
    "m1-send-status");
  document.getElementById("m1-continue").addEventListener("click", () => unlockNext(0));
}

/* ============================================================
   Mission 2 — Spot the Disturbance (real data-source integration)
   ============================================================ */
function buildMission2Content() {
  const wrap = document.createElement("div");

  const timelapseBlock = document.createElement("div");
  timelapseBlock.className = "tool-block";
  timelapseBlock.innerHTML =
    '<div class="tool-label">Step 1 — Navigate and compare in Google Earth</div>' +
    '<div class="timelapse-row"><a class="timelapse-btn" href="' + GOOGLE_EARTH_AOI_URL + '" target="_blank" rel="noopener">Open the starting view in Google Earth ↗</a></div>' +
    '<div class="coord-hint">The button opens a starting view only; you still navigate from there yourself. No shared project or reference layer is required. Move into the <b>Oban-Group Forest Reserve</b> area and work at roughly the scale of one forest block, not the whole state.</div>' +
    '<div class="coord-hint" style="margin-top:10px;">Use the historical imagery control to compare dates. The stable reference point is <b>5.4589, 8.3522</b>. Compare that intact-looking area with the disturbance area you identify, using the same or nearby years.</div>' +
    '<div class="coord-hint" style="margin-top:10px;">Choose two years to compare and record them. A change signal is a lead, not proof: check edge sharpness, canopy texture, roads, rivers, soil moisture, and crop cycles against the historical imagery before calling it deforestation.</div>';
  wrap.appendChild(timelapseBlock);

  const mapsBlock = document.createElement("div");
  mapsBlock.className = "tool-block";
  mapsBlock.innerHTML =
    '<div class="tool-label">Step 2 — Create and share your Google Earth project</div>' +
    '<div class="coord-hint">In Google Earth, create a project for your team. Add a placemark or polygon around the disturbance you identified, and add lines or placemarks for nearby access routes. Save your project as you work.</div>' +
    '<div class="timelapse-row"><a class="timelapse-btn" href="' + GOOGLE_EARTH_PROJECT_URL + '" target="_blank" rel="noopener">Open Google Earth ↗</a></div>' +
    '<ol class="map-directions">' +
      '<li>Open <strong>Google Earth</strong> and create a new project for your team.</li>' +
      '<li>Add your disturbance area and nearby access routes as project features. Name each feature clearly.</li>' +
      '<li>Use the project\'s measurement tools to estimate the disturbance area in hectares.</li>' +
      '<li>Click <strong>Share project</strong>, set access so the facilitator can view it, and copy the project link.</li>' +
      '<li>Paste that shared link into Step 3 and submit it with your findings.</li>' +
    '</ol>' +
    '<div class="coord-hint" style="margin-top:10px;">Your shared Google Earth project is the evidence map the facilitator reviews. Keep the project link accessible until judging is complete.</div>';
  wrap.appendChild(mapsBlock);

  const formBlock = document.createElement("div");
  formBlock.className = "tool-block";
  formBlock.innerHTML =
    '<div class="tool-label">Step 3 — Report your findings</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">Shared Google Earth project link (required)</label>' +
      '<input class="field-input-sm" id="m2-project-url" type="url" placeholder="https://earth.google.com/earth/d/your-project-id" />' +
    '</div>' +
    '<div class="tool-label">Five disturbance areas</div>' +
    DISTURBANCES.map((label, index) =>
      '<div class="route-card">' +
        '<div class="route-index">' + label + '</div>' +
        '<label class="field-label-sm" for="m2-area-' + index + '">Area in hectares</label>' +
        '<input class="field-input-sm" id="m2-area-' + index + '" type="number" min="0" step="any" placeholder="e.g. 42" />' +
      '</div>'
    ).join("") +
    '<div class="field-block">' +
      '<label class="field-label-sm">Which year(s) does the disturbance first appear in Google Earth\'s historical imagery?</label>' +
      '<input class="field-input-sm" id="m2-year" type="text" placeholder="e.g. 2015" />' +
    '</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">Imagery comparison — which two years did you compare, what changed over your flagged area, and why did you choose those years?</label>' +
      '<textarea class="field-input-sm" id="m2-changedetect" placeholder="e.g. Compared 2018-2024 because that spans when disturbance first appeared. The western block changed from continuous canopy to a sharp, open patch."></textarea>' +
    '</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">Justify your flag — what visual cues support calling this disturbance rather than normal variation?</label>' +
      '<textarea class="field-input-sm" id="m2-justify" placeholder="Reference edge sharpness, color, contrast with the reference area..."></textarea>' +
    '</div>' +
    '<button class="submit-btn" id="m2-submit" type="button">Submit for facilitator review</button>' +
    '<div id="m2-confirm"></div>';
  wrap.appendChild(formBlock);

  wrap.querySelector("#m2-submit").addEventListener("click", () => {
    const projectUrl = document.getElementById("m2-project-url").value.trim();
    const areas = DISTURBANCES.map((label, index) => ({
      label: label,
      hectares: document.getElementById("m2-area-" + index).value.trim()
    }));
    const year = document.getElementById("m2-year").value;
    const changeDetect = document.getElementById("m2-changedetect").value;
    const justify = document.getElementById("m2-justify").value;
    if (!projectUrl || !projectUrl.startsWith("https://earth.google.com/earth/d/")) {
      alert("Paste the shared Google Earth project link, for example: https://earth.google.com/earth/d/your-project-id");
      return;
    }
    if (areas.some((area) => !area.hectares) || !year || !changeDetect.trim() || !justify.trim()) {
      alert("Enter the hectares for all five disturbance areas and complete the remaining fields before submitting.");
      return;
    }
    document.getElementById("m2-submit").style.display = "none";
    const confirm = document.getElementById("m2-confirm");
    confirm.innerHTML =
      '<div class="summary-panel">' +
        '<div class="summary-tag">Submitted</div>' +
        '<div class="summary-body">Recorded for facilitator review against the defined metrics — this mission isn\'t auto-scored.</div>' +
        '<div id="m2-send-status" style="margin-top:10px;"></div>' +
        '<button class="continue-btn" id="m2-continue">Continue to Mission 3</button>' +
      '</div>';
    logSubmission("Mission 2 — Spot the Disturbance", {
      projectUrl: projectUrl,
      disturbances: areas,
      firstAppearanceYear: year,
      imageryComparison: changeDetect,
      disturbanceJustification: justify
    }, "m2-send-status");
    document.getElementById("m2-continue").addEventListener("click", () => unlockNext(1));
  });

  return wrap;
}

/* ============================================================
   Mission 3 — Trace the Route (real data-source integration)
   ============================================================ */
const ROUTES = [
  {
    label: "Route A", coords: "unverified — facilitator to confirm",
    correctStatus: "active"
  },
  {
    label: "Route B", coords: "unverified — facilitator to confirm",
    correctStatus: "inactive"
  },
  {
    label: "Route C", coords: "unverified — facilitator to confirm",
    correctStatus: "active"
  },
  {
    label: "Route D", coords: "unverified — facilitator to confirm",
    correctStatus: "inactive"
  },
  {
    label: "Route E", coords: "unverified — facilitator to confirm",
    correctStatus: "active"
  }
];
const DISTURBANCES = ["Disturbance A", "Disturbance B", "Disturbance C", "Disturbance D", "Disturbance E"];

function buildMission3Content() {
  const wrap = document.createElement("div");

  const mapsBlock = document.createElement("div");
  mapsBlock.className = "tool-block";
  mapsBlock.innerHTML =
    '<div class="tool-label">Trace access routes in your Google Earth project</div>' +
    '<div class="coord-hint">Use the shared Google Earth project you created in Mission 2. Add route lines near the disturbance area, then compare their continuity, sharpness, regrowth, and connection to cleared patches.</div>' +
    '<div class="coord-hint" style="margin-top:10px;">Your shared project link remains the evidence map the facilitator reviews. Your route classifications and written reasoning below complete the record.</div>';
  wrap.appendChild(mapsBlock);

  const classifyBlock = document.createElement("div");
  classifyBlock.className = "tool-block";
  classifyBlock.innerHTML = '<div class="tool-label">Classify each route</div>';
  const routeAnswers = {};
  const routeLengths = {};

  ROUTES.forEach((route, i) => {
    const card = document.createElement("div");
    card.className = "route-card";
    card.innerHTML =
      '<div class="route-index">' + route.label + ' — ' + route.coords + '</div>' +
      '<label class="field-label-sm" for="m3-length-' + i + '">Route length (metres)</label>' +
      '<input class="field-input-sm" id="m3-length-' + i + '" type="number" min="0" step="any" placeholder="e.g. 850" />';
    const row = document.createElement("div");
    row.className = "route-choice-row";
    ["active", "inactive"].forEach((status) => {
      const btn = document.createElement("button");
      btn.className = "route-choice-btn";
      btn.type = "button";
      btn.dataset.routeIndex = i;
      btn.dataset.routeStatus = status;
      btn.textContent = status === "active" ? "Active route" : "Inactive / closed";
      btn.addEventListener("click", () => {
        routeAnswers[i] = status;
        Array.from(row.children).forEach((c) => c.classList.remove("selected"));
        btn.classList.add("selected");
        checkM3Ready();
        saveDrafts();
      });
      row.appendChild(btn);
    });
    card.appendChild(row);
    card.querySelector("#m3-length-" + i).addEventListener("input", (event) => {
      routeLengths[i] = event.target.value.trim();
      checkM3Ready();
    });
    classifyBlock.appendChild(card);
  });
  wrap.appendChild(classifyBlock);

  const justifyBlock = document.createElement("div");
  justifyBlock.className = "tool-block";
  justifyBlock.innerHTML =
    '<div class="field-block">' +
      '<label class="field-label-sm">What does the route pattern suggest — is disturbance ongoing or historical?</label>' +
      '<textarea class="field-input-sm" id="m3-justify" placeholder="Note: satellite imagery can suggest activity status but can\'t confirm cause..."></textarea>' +
    '</div>' +
    '<button class="submit-btn" id="m3-submit" disabled type="button">Submit</button>' +
    '<div id="m3-confirm"></div>';
  wrap.appendChild(justifyBlock);

  function checkM3Ready() {
    document.getElementById("m3-submit").disabled = Object.keys(routeAnswers).length < ROUTES.length || Object.keys(routeLengths).length < ROUTES.length || Object.values(routeLengths).some((length) => !length);
  }

  wrap.querySelector("#m3-submit").addEventListener("click", () => {
    const justify = document.getElementById("m3-justify").value;
    if (Object.keys(routeLengths).length < ROUTES.length || Object.values(routeLengths).some((length) => !length)) {
      alert("Enter the length in metres for all five routes before submitting.");
      return;
    }
    if (!justify.trim()) { alert("Add your written justification before submitting."); return; }

    document.getElementById("m3-submit").style.display = "none";
    const confirm = document.getElementById("m3-confirm");
    confirm.innerHTML =
      '<div class="summary-panel">' +
        '<div class="summary-tag">Routes submitted</div>' +
        '<div class="summary-body">Written justification recorded for facilitator review.</div>' +
        '<div id="m3-send-status" style="margin-top:10px;"></div>' +
        '<button class="continue-btn" id="m3-continue">Continue to Mission 4</button>' +
      '</div>';
    logSubmission("Mission 3 — Trace the Route",
      { routes: ROUTES.map((route, index) => ({
        label: route.label,
        classification: routeAnswers[index],
        lengthMetres: routeLengths[index]
      })), routeJustification: justify },
      "m3-send-status");
    document.getElementById("m3-continue").addEventListener("click", () => unlockNext(2));
  });

  return wrap;
}

/* ============================================================
   Mission 4 — From Data to Information (synthesis)
   ============================================================ */
function buildMission4Content() {
  const wrap = document.createElement("div");
  const block = document.createElement("div");
  block.className = "tool-block";
  block.innerHTML =
    '<div class="tool-label">Synthesise your findings</div>' +
    '<div class="coord-hint" style="margin-bottom:16px;">No new data here — this is entirely from what you found in Missions 2 and 3. Combine it into one honest, defensible statement.</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">Synthesis statement — where is the disturbance, roughly when did it appear, and does access suggest ongoing or historical activity?</label>' +
      '<textarea class="field-input-sm" id="m4-synthesis" style="min-height:120px;" placeholder="Combine location, timing, and access evidence into one coherent statement..."></textarea>' +
    '</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">Confidence level</label>' +
      '<select class="field-input-sm" id="m4-confidence">' +
        '<option value="">— Select —</option>' +
        '<option value="High">High</option>' +
        '<option value="Medium">Medium</option>' +
        '<option value="Low">Low</option>' +
      '</select>' +
    '</div>' +
    '<div class="field-block">' +
      '<label class="field-label-sm">What would raise your confidence? (What evidence is missing?)</label>' +
      '<textarea class="field-input-sm" id="m4-raise" placeholder="e.g. more recent imagery, ground verification, corroborating records..."></textarea>' +
    '</div>' +
    '<button class="submit-btn" id="m4-submit" type="button">Submit synthesis</button>' +
    '<div id="m4-confirm"></div>';
  wrap.appendChild(block);

  wrap.querySelector("#m4-submit").addEventListener("click", () => {
    const synthesis = document.getElementById("m4-synthesis").value;
    const confidence = document.getElementById("m4-confidence").value;
    const raise = document.getElementById("m4-raise").value;
    if (!synthesis.trim() || !confidence || !raise.trim()) {
      alert("Fill in all fields before submitting.");
      return;
    }
    document.getElementById("m4-submit").style.display = "none";
    document.getElementById("m4-confirm").innerHTML =
      '<div class="summary-panel">' +
        '<div class="summary-tag">Synthesis submitted</div>' +
        '<div class="summary-body">Recorded for facilitator review. Stating your confidence honestly — including what you don\'t know — is graded as part of this, not held against you.</div>' +
        '<div id="m4-send-status" style="margin-top:10px;"></div>' +
        '<button class="continue-btn" id="m4-continue">Continue to Mission 5</button>' +
      '</div>';
    logSubmission("Mission 4 — From Data to Information",
      { synthesis: synthesis, confidence: confidence, evidenceNeeded: raise }, "m4-send-status");
    document.getElementById("m4-continue").addEventListener("click", () => unlockNext(3));
  });

  return wrap;
}

/* ============================================================
   Mission 5 — Tell the Story (written deliverables)
   ============================================================ */
function buildMission5Content() {
  const wrap = document.createElement("div");

  const briefBlock = document.createElement("div");
  briefBlock.className = "tool-block";
  briefBlock.innerHTML =
    '<div class="tool-label">Deliverable 1 — Policy brief (~1 page)</div>' +
    '<div class="coord-hint" style="margin-bottom:14px;">Written for the relevant forestry/environment authority. Graded on clarity and actionability — what should they do, and why.</div>' +
    '<div class="field-block">' +
      '<textarea class="field-input-sm" id="m5-brief" style="min-height:200px;" placeholder="Your policy brief..."></textarea>' +
      '<div class="coord-hint" id="m5-brief-count" style="margin-top:6px;">0 words</div>' +
    '</div>';
  wrap.appendChild(briefBlock);

  const reportBlock = document.createElement("div");
  reportBlock.className = "tool-block";
  reportBlock.innerHTML =
    '<div class="tool-label">Deliverable 2 — Field report (~1500 words)</div>' +
    '<div class="coord-hint" style="margin-bottom:14px;">Journalist voice, for a public audience. Structure: <b>Lede → Evidence → Human Stakes → Quote Slot → What Happens Next → Closing Line</b>. Carry your Mission 4 confidence level through honestly — don\'t overclaim. <b>No fabricated quotes attributed to real, named people</b>, under any framing.</div>' +
    '<div class="field-block">' +
      '<textarea class="field-input-sm" id="m5-report" style="min-height:320px;" placeholder="Your field report..."></textarea>' +
      '<div class="coord-hint" id="m5-report-count" style="margin-top:6px;">0 words</div>' +
    '</div>' +
    '<button class="submit-btn" id="m5-submit" type="button">Submit both deliverables</button>' +
    '<div id="m5-confirm"></div>';
  wrap.appendChild(reportBlock);

  function countWords(str) {
    const t = str.trim();
    return t ? t.split(/\s+/).length : 0;
  }
  const briefEl = wrap.querySelector("#m5-brief");
  const reportEl = wrap.querySelector("#m5-report");
  briefEl.addEventListener("input", () => {
    wrap.querySelector("#m5-brief-count").textContent = countWords(briefEl.value) + " words";
  });
  reportEl.addEventListener("input", () => {
    const n = countWords(reportEl.value);
    wrap.querySelector("#m5-report-count").textContent =
      n + " words" + (n >= 1300 && n <= 1700 ? " ✓ in range" : " (target ~1500)");
  });

  wrap.querySelector("#m5-submit").addEventListener("click", () => {
    const brief = briefEl.value, report = reportEl.value;
    if (!brief.trim() || !report.trim()) {
      alert("Both the policy brief and the field report are required.");
      return;
    }
    const reportWordCount = countWords(report);
    const reportTargetNote = reportWordCount < 800
      ? " The report is " + reportWordCount + " words, below the ~1500-word target, but it has still been submitted for review."
      : " The report contains " + reportWordCount + " words.";
    document.getElementById("m5-submit").style.display = "none";
    document.getElementById("m5-confirm").innerHTML =
      '<div class="summary-panel">' +
        '<div class="summary-tag">All missions complete</div>' +
        '<div class="summary-body">Both deliverables submitted.' + reportTargetNote + ' Your total elapsed time (' + elapsedString() + ') has been logged — that\'s the 60% speed component. Quality grading happens after the event.</div>' +
        '<div id="m5-send-status" style="margin-top:10px;"></div>' +
        '<button class="continue-btn" id="m5-resend" type="button">Send Mission 5 again</button>' +
      '</div>';
    logSubmission("Mission 5 — Tell the Story",
      { policyBrief: brief, fieldReport: report, policyBriefWordCount: countWords(brief), fieldReportWordCount: countWords(report) },
      "m5-send-status");
    completed["m5"] = true;
    renderTabs();
    renderProgress();
    document.getElementById("m5-resend").addEventListener("click", () => {
      logSubmission("Mission 5 — Tell the Story",
        { policyBrief: brief, fieldReport: report, policyBriefWordCount: countWords(brief), fieldReportWordCount: countWords(report) },
        "m5-send-status");
    });
  });

  return wrap;
}
/* Populate the team dropdown on load */(function populateTeams() {
  const sel = document.getElementById("team-name-input");
  TEAM_NAMES.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  });

  sel.addEventListener("change", () => {
    Array.from(sel.options).forEach((option) => {
      option.textContent = option.value === sel.value && option.value ? "✓ " + option.value : option.value || "Choose your team";
    });
    document.getElementById("team-name-error").textContent = "";
  });
})();

function startSession() {
  if (started) return;
  if (!teamName) {
    const nameInput = document.getElementById("team-name-input");
    teamName = nameInput.value.trim();
    if (!teamName) {
      document.getElementById("team-name-error").textContent = "Select your team before starting.";
      nameInput.focus();
      return;
    }
    eventStartTime = Date.now();
    eventDeadline = eventStartTime + EVENT_MINUTES * 60 * 1000;
  }
  started = true;
  document.getElementById("intro").style.display = "none";
  document.getElementById("tabs").style.display = "flex";
  document.getElementById("mission-panels").style.display = "block";
  renderTabs();
  renderProgress();
  buildMissionPanels();
  restoreDrafts();
  showMission(activeIndex);
  document.getElementById("event-clock").textContent = formatClock(eventSecondsLeft);
  document.getElementById("team-name-display").textContent = teamName + " · time remaining";
  saveSession();
  tickEventClock();
  clockId = setInterval(tickEventClock, 1000);
}

document.getElementById("start-btn").addEventListener("click", startSession);

if (restoreSession()) {
  const savedTeam = document.getElementById("team-name-input");
  savedTeam.value = teamName;
  Array.from(savedTeam.options).forEach((option) => {
    option.textContent = option.value === teamName ? "✓ " + option.value : option.value || "Choose your team";
  });
  startSession();
}

window.addEventListener("online", () => flushSubmissionQueue());
setInterval(() => flushSubmissionQueue(), 15000);
flushSubmissionQueue();

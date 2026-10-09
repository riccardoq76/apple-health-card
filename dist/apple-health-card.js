/**
 * Apple Health Card — card Lovelace in stile Apple Salute per i sensori
 * salute creati dall'app Home Assistant Companion (iOS).
 *
 * v2.0.0 — riscrittura rispetto alla 1.0.0 generata da Lovable:
 *  - niente più ricerca "a indovinare" tra tutti i sensori: le entità si
 *    costruiscono da un prefisso fisso (es. "iphone") o si indicano a mano;
 *  - ogni riquadro mostra da quanto tempo è arrivato il dato, e segnala i
 *    dati vecchi (i sensori Salute arrivano a pacchetti, non in tempo reale);
 *  - ridisegna solo quando cambia uno dei sensori usati, non a ogni evento HA;
 *  - colori presi dal tema di Home Assistant (funziona anche in tema scuro);
 *  - shadow DOM: gli stili non escono dalla card;
 *  - testi e valori sempre "escaped" prima di finire nell'HTML;
 *  - aggiunte le metriche reali del Companion (fasi del sonno, VO2 max,
 *    calorie a riposo, FC camminando, massa magra, acqua).
 *
 * Installazione: vedi README.md (HACS come repository personalizzato,
 * oppure copia manuale in /config/www e risorsa /local/apple-health-card.js).
 *
 * Configurazione minima:
 *   type: custom:apple-health-card
 *   prefix: iphone
 *
 * Opzioni:
 *   title:        titolo (default "Salute")
 *   prefix:       prefisso dei sensori Companion (sensor.<prefix>_heart_rate ...)
 *   entities:     mappa metrica → entity_id, ha la precedenza sul prefisso
 *   goals:        obiettivi anelli { steps, active_energy, exercise }
 *   stale_hours:  dopo quante ore un dato è "vecchio" (default 12)
 *   hide_missing: nasconde i riquadri senza dato (default true)
 *   language:     "auto" (default, segue la lingua di Home Assistant), "it", "en", "es" o "de"
 *   averages:     mappa metrica → sensore "media 7 giorni" (opzionale).
 *                 Metriche supportate: sleep, resting_heart_rate, hrv.
 *                 Mostra la differenza rispetto alla media sotto il valore.
 *   min_coverage: copertura minima della media, da 0 a 1 (default 0.5).
 *                 Sotto questa soglia la differenza non viene mostrata.
 *   hide:         lista di metriche da nascondere, es. [water, lean_mass].
 *                 Vale anche per anelli (steps, exercise, active_energy)
 *                 e per il sonno (sleep).
 *   goals.sleep:  obiettivo di sonno in ore (opzionale, nessun default).
 *                 Se impostato, mostra "% dell'obiettivo" sotto il sonno.
 *   sparklines:   true oppure lista di metriche (es. [sleep, hrv, weight]).
 *                 Mostra un mini-grafico degli ultimi 7 giorni nel riquadro.
 *                 Con true: sleep, resting_heart_rate, hrv, weight.
 *                 Legge la cronologia di Home Assistant (nessun'altra richiesta).
 *   language:     ora anche "es" e "de".
 */

const VERSION = "2.4.1";

/* ------------------------------------------------------------------ */
/* Definizione metriche                                                */
/* suffix = parte finale dell'entity_id creata dall'app Companion       */
/* body   = true → dato che si aggiorna raramente (peso ecc.):         */
/*          non viene segnato come "vecchio"                            */
/* ------------------------------------------------------------------ */

const RINGS = [
  { key: "active_energy", suffix: "active_energy", color: "#FA114F", goal: 500, unit: "kcal" },
  { key: "exercise", suffix: "exercise_time", color: "#92E82A", goal: 30, unit: "min" },
  { key: "steps", suffix: "health_steps", color: "#FF9F0A", goal: 10000, unit: "passi" },
];

const SECTIONS = [
  {
    id: "activity",
    metrics: [
      { key: "distance", suffix: "walking_running_distance", icon: "location", color: "#0A84FF", digits: 2 },
      { key: "flights", suffix: "flights_climbed", icon: "stairs", color: "#5856D6", digits: 0 },
      { key: "resting_energy", suffix: "resting_energy", icon: "flame", color: "#FF6B35", digits: 0 },
      { key: "vo2max", suffix: "vo2_max", icon: "lungs", color: "#30D158", digits: 1, body: true },
    ],
  },
  {
    id: "heart",
    metrics: [
      { key: "heart_rate", suffix: "heart_rate", icon: "heart", color: "#FF2D55", digits: 0 },
      { key: "resting_heart_rate", suffix: "resting_heart_rate", icon: "heart", color: "#FF453A", digits: 0 },
      { key: "walking_heart_rate", suffix: "walking_heart_rate_average", icon: "heart", color: "#FF6482", digits: 0 },
      { key: "hrv", suffix: "heart_rate_variability", icon: "waveform", color: "#BF5AF2", digits: 1 },
      { key: "spo2", suffix: "blood_oxygen", icon: "lungs", color: "#64D2FF", digits: 0 },
      { key: "respiratory_rate", suffix: "respiratory_rate", icon: "wind", color: "#40C8E0", digits: 0 },
    ],
  },
  {
    id: "body",
    metrics: [
      { key: "weight", suffix: "weight", icon: "scale", color: "#AF8E6B", digits: 1, body: true },
      { key: "body_fat", suffix: "body_fat_percentage", icon: "percent", color: "#C77F3E", digits: 1, body: true },
      { key: "lean_mass", suffix: "lean_body_mass", icon: "scale", color: "#8E8E93", digits: 1, body: true },
      { key: "water", suffix: "water", icon: "drop", color: "#0A84FF", digits: 0 },
    ],
  },
];

const SLEEP = {
  total: { key: "sleep", suffix: "sleep_duration" },
  stages: [
    { key: "sleep_awake", suffix: "awake", color: "#FF9F0A" },
    { key: "sleep_rem", suffix: "rem_sleep", color: "#64D2FF" },
    { key: "sleep_core", suffix: "core_sleep", color: "#0A84FF" },
    { key: "sleep_deep", suffix: "deep_sleep", color: "#5E5CE6" },
  ],
};

/** Metriche per cui si può indicare un sensore "media 7 giorni". */
const AVERAGE_KEYS = ["sleep", "resting_heart_rate", "hrv", "walking_heart_rate", "respiratory_rate", "spo2"];

/**
 * Mini-grafici (opzionali): come riassumere i valori di ciascun giorno.
 * last = ultimo valore del giorno, avg = media, max = massimo (contatori
 * giornalieri che ripartono da zero). Si usa la cronologia grezza, non le
 * statistiche: i dati Salute arrivano a pacchetti e le statistiche
 * ripeterebbero il valore precedente nei giorni senza sincronizzazione.
 */
const SPARK_AGG = {
  sleep: "last", resting_heart_rate: "avg", hrv: "avg", walking_heart_rate: "avg", heart_rate: "avg",
  respiratory_rate: "avg", spo2: "avg", weight: "last", body_fat: "last", lean_mass: "last", vo2max: "last",
  water: "last", distance: "max", flights: "max", resting_energy: "max",
};
/** Metriche che cambiano di rado: la linea unisce i punti anche attraverso i giorni vuoti. */
const SPARK_CONNECT = ["weight", "body_fat", "lean_mass", "vo2max"];
const SPARK_DEFAULT = ["sleep", "resting_heart_rate", "hrv", "weight"];
const SPARK_DAYS = 7;
const SPARK_REFRESH_MS = 10 * 60 * 1000;

/** Unità inviate da Companion → chiave nelle tabelle lingua. */
const UNIT_KEYS = { steps: "steps", floors: "floors", "br/min": "brmin" };

/* ------------------------------------------------------------------ */
/* Lingue. Per aggiungerne una: copia il blocco "en", traduci i testi  */
/* e aggiungila qui sotto (il resto della card non cambia).            */
/* ------------------------------------------------------------------ */

const I18N = {
  it: {
    title: "Salute",
    labels: {
      active_energy: "Movimento", exercise: "Esercizio", steps: "Passi",
      distance: "Distanza a piedi", flights: "Piani saliti", resting_energy: "Energia a riposo", vo2max: "VO2 max",
      heart_rate: "Frequenza cardiaca", resting_heart_rate: "FC a riposo", walking_heart_rate: "FC camminando",
      hrv: "Variabilità (HRV)", spo2: "Ossigeno nel sangue", respiratory_rate: "Freq. respiratoria",
      weight: "Peso", body_fat: "Massa grassa", lean_mass: "Massa magra", water: "Acqua",
      sleep_awake: "Sveglio", sleep_rem: "REM", sleep_core: "Core", sleep_deep: "Profondo",
    },
    sections: { activity: "Attività", heart: "Cuore e respirazione", body: "Corpo", sleep: "Sonno" },
    lastNight: "Ultima notte",
    noData: "nessun dato",
    goal: "{pct}% di {goal}",
    units: { steps: "passi", floors: "piani", brmin: "atti/min" },
    spark: "Ultimi 7 giorni",
    age: { now: "adesso", min: "{n} min fa", hours: "{n} h fa", yesterday: "ieri", days: "{n} giorni fa" },
    delta: {
      same: "In linea con la media 7 gg",
      diff: "{sign}{amount} vs media 7 gg",
      title: "Media 7 giorni: {avg}",
    },
    empty: {
      title: "Nessun dato salute trovato",
      body: "Controlla il prefisso (<code>{prefix}</code>): i sensori devono chiamarsi <code>sensor.&lt;prefisso&gt;_heart_rate</code> e simili. In alternativa indica le entità con <code>entities:</code>.",
    },
    editor: {
      title: "Titolo", prefix: "Prefisso sensori (es. iphone)", kcal: "Obiettivo calorie attive (kcal)",
      min: "Obiettivo esercizio (min)", steps: "Obiettivo passi", stale: 'Dato "vecchio" dopo (ore)',
      language: "Lingua", auto: "Automatica (come Home Assistant)",
      note: "Per indicare entità diverse usa <code>entities:</code> nell'editor YAML.",
    },
  },
  en: {
    title: "Health",
    labels: {
      active_energy: "Move", exercise: "Exercise", steps: "Steps",
      distance: "Walk + run distance", flights: "Flights climbed", resting_energy: "Resting energy", vo2max: "VO2 max",
      heart_rate: "Heart rate", resting_heart_rate: "Resting heart rate", walking_heart_rate: "Walking heart rate",
      hrv: "Heart rate variability", spo2: "Blood oxygen", respiratory_rate: "Respiratory rate",
      weight: "Weight", body_fat: "Body fat", lean_mass: "Lean body mass", water: "Water",
      sleep_awake: "Awake", sleep_rem: "REM", sleep_core: "Core", sleep_deep: "Deep",
    },
    sections: { activity: "Activity", heart: "Heart and breathing", body: "Body", sleep: "Sleep" },
    lastNight: "Last night",
    noData: "no data",
    goal: "{pct}% of {goal}",
    units: { steps: "steps", floors: "floors", brmin: "br/min" },
    spark: "Last 7 days",
    age: { now: "now", min: "{n} min ago", hours: "{n} h ago", yesterday: "yesterday", days: "{n} days ago" },
    delta: {
      same: "In line with 7-day avg",
      diff: "{sign}{amount} vs 7-day avg",
      title: "7-day average: {avg}",
    },
    empty: {
      title: "No health data found",
      body: "Check the prefix (<code>{prefix}</code>): the sensors must be named <code>sensor.&lt;prefix&gt;_heart_rate</code> and so on. Or set the entities one by one with <code>entities:</code>.",
    },
    editor: {
      title: "Title", prefix: "Sensor prefix (e.g. iphone)", kcal: "Active energy goal (kcal)",
      min: "Exercise goal (min)", steps: "Steps goal", stale: "Mark data as old after (hours)",
      language: "Language", auto: "Automatic (same as Home Assistant)",
      note: "To use different entities, set <code>entities:</code> in the YAML editor.",
    },
  },
  es: {
    title: "Salud",
    labels: {
      active_energy: "Movimiento", exercise: "Ejercicio", steps: "Pasos",
      distance: "Distancia a pie", flights: "Pisos subidos", resting_energy: "Energía en reposo", vo2max: "VO2 máx.",
      heart_rate: "Frecuencia cardiaca", resting_heart_rate: "FC en reposo", walking_heart_rate: "FC al caminar",
      hrv: "Variabilidad (VFC)", spo2: "Oxígeno en sangre", respiratory_rate: "Frec. respiratoria",
      weight: "Peso", body_fat: "Grasa corporal", lean_mass: "Masa magra", water: "Agua",
      sleep_awake: "Despierto", sleep_rem: "REM", sleep_core: "Core", sleep_deep: "Profundo",
    },
    sections: { activity: "Actividad", heart: "Corazón y respiración", body: "Cuerpo", sleep: "Sueño" },
    lastNight: "Anoche",
    noData: "sin datos",
    goal: "{pct}% de {goal}",
    units: { steps: "pasos", floors: "pisos", brmin: "resp/min" },
    spark: "Últimos 7 días",
    age: { now: "ahora", min: "hace {n} min", hours: "hace {n} h", yesterday: "ayer", days: "hace {n} días" },
    delta: {
      same: "En línea con la media de 7 días",
      diff: "{sign}{amount} vs media 7 días",
      title: "Media de 7 días: {avg}",
    },
    empty: {
      title: "No se han encontrado datos de salud",
      body: "Revisa el prefijo (<code>{prefix}</code>): los sensores deben llamarse <code>sensor.&lt;prefijo&gt;_heart_rate</code> y similares. O indica las entidades una a una con <code>entities:</code>.",
    },
    editor: {
      title: "Título", prefix: "Prefijo de sensores (p. ej. iphone)", kcal: "Objetivo de energía activa (kcal)",
      min: "Objetivo de ejercicio (min)", steps: "Objetivo de pasos", stale: "Marcar dato como antiguo tras (horas)",
      language: "Idioma", auto: "Automático (igual que Home Assistant)",
      note: "Para usar otras entidades, define <code>entities:</code> en el editor YAML.",
    },
  },
  de: {
    title: "Gesundheit",
    labels: {
      active_energy: "Bewegen", exercise: "Trainieren", steps: "Schritte",
      distance: "Gehen + Laufen", flights: "Etagen gestiegen", resting_energy: "Ruheenergie", vo2max: "VO2 max",
      heart_rate: "Herzfrequenz", resting_heart_rate: "Ruheherzfrequenz", walking_heart_rate: "Ø-Herzfrequenz (Gehen)",
      hrv: "Herzfrequenz­variabilität", spo2: "Blutsauerstoff", respiratory_rate: "Atemfrequenz",
      weight: "Gewicht", body_fat: "Körperfettanteil", lean_mass: "Magere Körpermasse", water: "Wasser",
      sleep_awake: "Wach", sleep_rem: "REM", sleep_core: "Kern", sleep_deep: "Tief",
    },
    sections: { activity: "Aktivität", heart: "Herz und Atmung", body: "Körper", sleep: "Schlaf" },
    lastNight: "Letzte Nacht",
    noData: "keine Daten",
    goal: "{pct}% von {goal}",
    units: { steps: "Schritte", floors: "Etagen", brmin: "Atemzüge/min" },
    spark: "Letzte 7 Tage",
    age: { now: "jetzt", min: "vor {n} Min.", hours: "vor {n} Std.", yesterday: "gestern", days: "vor {n} Tagen" },
    delta: {
      same: "Im 7-Tage-Schnitt",
      diff: "{sign}{amount} ggü. 7-Tage-Schnitt",
      title: "7-Tage-Durchschnitt: {avg}",
    },
    empty: {
      title: "Keine Gesundheitsdaten gefunden",
      body: "Prüfe das Präfix (<code>{prefix}</code>): Die Sensoren müssen <code>sensor.&lt;präfix&gt;_heart_rate</code> usw. heißen. Alternativ kannst du die Entitäten einzeln mit <code>entities:</code> angeben.",
    },
    editor: {
      title: "Titel", prefix: "Sensor-Präfix (z. B. iphone)", kcal: "Ziel Aktivkalorien (kcal)",
      min: "Ziel Trainingsminuten (min)", steps: "Ziel Schritte", stale: "Daten als veraltet markieren nach (Stunden)",
      language: "Sprache", auto: "Automatisch (wie Home Assistant)",
      note: "Für andere Entitäten setze <code>entities:</code> im YAML-Editor.",
    },
  },
};

/** Lingua e locale in uso durante il disegno (impostati da _applyLanguage). */
let I = I18N.it;
let LOCALE = "it";

function rawLanguage(config, hass) {
  const pref = String((config && config.language) || "auto").toLowerCase();
  if (pref !== "auto") return pref;
  return String((hass && (hass.language || (hass.locale && hass.locale.language))) || "en");
}

/** Lingua dei testi: quella di Home Assistant se tradotta, altrimenti inglese. */
function resolveLanguage(config, hass) {
  const base = rawLanguage(config, hass).toLowerCase().split(/[-_]/)[0];
  return I18N[base] ? base : "en";
}

/** Locale per numeri e date (anche per lingue senza traduzione dei testi). */
function resolveLocale(config, hass) {
  const raw = rawLanguage(config, hass);
  try {
    return Intl.NumberFormat.supportedLocalesOf([raw]).length ? raw : "en";
  } catch (e) {
    return "en";
  }
}

/** Sostituisce {nome} con i valori dati. */
const f = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ""));

const GLYPHS = {
  flame: '<path d="M12 2s4 4.2 4 8a4 4 0 0 1-8 0c0-1.3.4-2.2.4-2.2S6 10 6 13.5A6 6 0 0 0 18 14c0-5-6-12-6-12z"/>',
  location: '<path d="M21 3 3 10.5l7.5 2.7L13.2 21 21 3z"/>',
  stairs: '<path d="M3 20h4v-4h4v-4h4V8h5V5h-8v4h-4v4H4v4H0v3h3z"/>',
  heart: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>',
  waveform: '<path d="M2 12h3l2-6 3 14 3-10 2 5 2-3h5v2h-4l-3 5-2-5-3 9L7 10l-1 4H2z"/>',
  bed: '<path d="M3 8v5h18a4 4 0 0 0-4-4h-6V8H3zm0 7v4h2v-2h14v2h2v-4H3z"/>',
  lungs:
    '<path d="M11 3h2v7h-2V3zM9 11c0-2-2-3-3.5-2S3 12 3 15v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-8zm6 0v8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4c0-3-1-6-2.5-6S15 9 15 11z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3h-2a5 5 0 0 1 10 0 5 5 0 0 1-5 5H3V8zm0 5h8a3 3 0 1 1-3 3H6a5 5 0 0 0 10 0 5 5 0 0 0-5-5H3v2z"/>',
  scale:
    '<path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm7 3-4 5h8l-4-5z"/>',
  percent:
    '<path d="M6 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm12 11a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19 4 5 20l1.6 1.2L20.6 5.2 19 4z"/>',
  drop: '<path d="M12 2.5S5 10.2 5 15a7 7 0 0 0 14 0c0-4.8-7-12.5-7-12.5z"/>',
};

/* ------------------------------------------------------------------ */
/* Utilità                                                             */
/* ------------------------------------------------------------------ */

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const isMissing = (st) => !st || st.state === "unavailable" || st.state === "unknown" || st.state === "";

function num(st) {
  if (isMissing(st)) return NaN;
  const n = Number(st.state);
  return isFinite(n) ? n : NaN;
}

function fmtNumber(value, digits) {
  if (!isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits ?? (Math.abs(value) >= 100 ? 0 : 1),
  }).format(value);
}

function fmtMinutes(minutes) {
  if (!isFinite(minutes)) return "—";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

function unitLabel(st) {
  const u = (st && st.attributes && st.attributes.unit_of_measurement) || "";
  return (UNIT_KEYS[u] && I.units[UNIT_KEYS[u]]) || u;
}

/**
 * Istante dell'ultimo dato ricevuto (last_reported se disponibile).
 * Con changed=true usa invece last_changed: serve per le metriche che
 * cambiano di rado (peso ecc.), dove l'app può rimandare lo stesso valore
 * più volte e last_reported darebbe un'età ingannevolmente recente.
 */
function lastSeen(st, changed) {
  const t = st && (changed
    ? (st.last_changed || st.last_updated || st.last_reported)
    : (st.last_reported || st.last_updated || st.last_changed));
  const d = t ? new Date(t) : null;
  return d && !isNaN(d) ? d : null;
}

function fmtAge(date, now) {
  if (!date) return "";
  const min = Math.max(0, Math.round((now - date) / 60000));
  if (min < 1) return I.age.now;
  if (min < 60) return f(I.age.min, { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return f(I.age.hours, { n: h });
  const d = Math.floor(h / 24);
  return d === 1 ? I.age.yesterday : f(I.age.days, { n: d });
}

/**
 * Riassume una cronologia grezza in un valore per giorno.
 * rows: elementi nel formato compatto di Home Assistant (s = stato,
 * lu = istante in secondi) o in quello esteso (state, last_updated).
 * Restituisce un array lungo quanto `days`, con null dove manca il dato.
 */
function bucketDays(rows, days, agg) {
  const out = days.map(() => []);
  for (const r of Array.isArray(rows) ? rows : []) {
    const raw = r.s !== undefined ? r.s : r.state;
    const v = Number(raw);
    if (raw === null || raw === "" || !isFinite(v)) continue;
    const t = r.lu !== undefined ? r.lu * 1000 : r.lc !== undefined ? r.lc * 1000 : Date.parse(r.last_updated || r.last_changed);
    if (!isFinite(t) || t < days[0]) continue;
    let i = days.length - 1;
    while (i > 0 && t < days[i]) i--;
    out[i].push(v);
  }
  return out.map((vs) => {
    if (!vs.length) return null;
    if (agg === "avg") return vs.reduce((a, b) => a + b, 0) / vs.length;
    if (agg === "max") return Math.max(...vs);
    return vs[vs.length - 1];
  });
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

class AppleHealthCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._signature = null;
    this._timer = null;
    this.shadowRoot.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-entity]");
      if (!el) return;
      const e = new Event("hass-more-info", { bubbles: true, composed: true });
      e.detail = { entityId: el.dataset.entity };
      this.dispatchEvent(e);
    });
  }

  static getConfigElement() {
    return document.createElement("apple-health-card-editor");
  }

  static getStubConfig() {
    return { type: "custom:apple-health-card", prefix: "" };
  }

  setConfig(config) {
    if (!config) throw new Error("Configurazione mancante");
    this._config = {
      stale_hours: 12,
      hide_missing: true,
      ...config,
    };
    this._ids = this._buildEntityMap();
    this._avgIds = this._buildAverageMap();
    this._signature = null;
    this._spark = null;
    this._sparkAt = 0;
    if (this._hass) { this._maybeLoadSparks(); this._render(); }
  }

  /** Mappa metrica → entity_id. Nessuna ricerca: solo prefisso o override. */
  _buildEntityMap() {
    const map = {};
    const prefix = (this._config.prefix || "").trim();
    const overrides = this._config.entities || {};
    const all = [
      ...RINGS,
      ...SECTIONS.flatMap((s) => s.metrics),
      SLEEP.total,
      ...SLEEP.stages,
    ];
    for (const m of all) {
      if (overrides[m.key]) map[m.key] = overrides[m.key];
      else if (prefix) map[m.key] = `sensor.${prefix}_${m.suffix}`;
    }
    return map;
  }

  /** Mappa metrica → sensore media. Solo le metriche supportate. */
  _buildAverageMap() {
    const raw = this._config.averages;
    const map = {};
    if (!raw || typeof raw !== "object") return map;
    for (const key of AVERAGE_KEYS) {
      const id = raw[key];
      if (typeof id === "string" && id.trim()) map[key] = id.trim();
    }
    return map;
  }

  /** Metriche con mini-grafico, secondo l'opzione `sparklines`. */
  _sparkKeys() {
    const sp = this._config.sparklines;
    if (sp === true) return SPARK_DEFAULT;
    if (Array.isArray(sp)) return sp.filter((k) => SPARK_AGG[k] && this._ids[k]);
    return [];
  }

  /** Scarica (al massimo ogni 10 minuti) la cronologia degli ultimi giorni. */
  _maybeLoadSparks() {
    const keys = this._sparkKeys();
    if (!keys.length || !this._hass || typeof this._hass.callWS !== "function") return;
    if (this._sparkBusy || Date.now() - (this._sparkAt || 0) < SPARK_REFRESH_MS) return;
    this._sparkBusy = true;
    this._sparkAt = Date.now();
    const days = [];
    const now = new Date();
    for (let i = SPARK_DAYS - 1; i >= 0; i--) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime());
    const ids = keys.map((k) => this._ids[k]);
    this._hass
      .callWS({
        type: "history/history_during_period",
        start_time: new Date(days[0]).toISOString(),
        end_time: new Date().toISOString(),
        entity_ids: ids,
        include_start_time_state: false,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      })
      .then((res) => {
        const out = {};
        for (const k of keys) out[k] = bucketDays(res && res[this._ids[k]], days, SPARK_AGG[k]);
        this._spark = out;
        this._sparkBusy = false;
        this._render();
      })
      .catch(() => {
        // Se la cronologia non è disponibile, la card funziona senza mini-grafici.
        this._sparkBusy = false;
      });
  }

  _sparkHtml(key, color) {
    const pts = this._spark && this._spark[key];
    if (!pts || pts.filter((v) => v !== null).length < 2) return "";
    const vals = pts.filter((v) => v !== null);
    let min = Math.min(...vals), max = Math.max(...vals);
    // Variazione minima: il 10% del valore medio. Senza, uno scarto di 0,1 kg
    // sul peso riempirebbe tutta l'altezza e sembrerebbe una grande variazione.
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const minSpan = Math.abs(mean) * 0.1 || 1;
    if (max - min < minSpan) {
      const mid = (max + min) / 2;
      min = mid - minSpan / 2;
      max = mid + minSpan / 2;
    }
    const span = max - min;
    const W = 100, H = 28, pad = 3;
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
    let d = "", pen = false;
    const dots = [];
    pts.forEach((v, i) => {
      if (v === null) { if (!SPARK_CONNECT.includes(key)) pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
      dots.push(`M${x(i).toFixed(1)} ${y(v).toFixed(1)}h0`);
    });
    const title = `${I.spark}: ${vals.map((v) => fmtNumber(v, key === "sleep" ? 0 : undefined)).join(" · ")}`;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(title)}">
        <title>${esc(title)}</title>
        <path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".85"></path>
        <path d="${dots.join("")}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
      </svg>`;
  }

  set hass(hass) {
    this._hass = hass;
    this._maybeLoadSparks();
    // Ridisegna solo se è cambiato qualcosa nei sensori usati dalla card.
    const ids = [...Object.values(this._ids || {}), ...Object.values(this._avgIds || {})];
    const sig = ids
      .map((id) => {
        const st = hass.states[id];
        return st ? `${st.state}|${st.last_reported || st.last_updated}` : "-";
      })
      .join(";");
    const full = `${hass.language || ""}|${sig}`;
    if (full === this._signature) return;
    this._signature = full;
    this._render();
  }

  _applyLanguage() {
    I = I18N[resolveLanguage(this._config, this._hass)];
    LOCALE = resolveLocale(this._config, this._hass);
  }

  connectedCallback() {
    // Aggiorna le etichette "x min fa" una volta al minuto.
    if (!this._timer) this._timer = setInterval(() => this._render(), 60000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
  }

  getCardSize() {
    return 12;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  _st(key) {
    const id = this._ids[key];
    return id ? this._hass.states[id] : undefined;
  }

  _isHidden(key) {
    const h = this._config.hide;
    return Array.isArray(h) && h.includes(key);
  }

  _isStale(st, metric) {
    if (metric && metric.body) return false;
    const seen = lastSeen(st);
    if (!seen) return false;
    return Date.now() - seen.getTime() > this._config.stale_hours * 3600000;
  }

  _ageHtml(st, metric) {
    const seen = lastSeen(st, !!(metric && metric.body));
    if (!seen || isMissing(st)) return "";
    const stale = this._isStale(st, metric);
    return `<span class="age${stale ? " stale" : ""}" title="${esc(seen.toLocaleString(LOCALE))}">${
      stale ? "⚠ " : ""
    }${esc(fmtAge(seen, Date.now()))}</span>`;
  }

  /**
   * Differenza tra il valore attuale e la media a 7 giorni.
   * Restituisce "" se la media non è configurata, non è disponibile
   * o copre troppo pochi giorni (attributo age_coverage_ratio).
   * Nessun giudizio "meglio/peggio": solo segno e scarto.
   */
  _deltaHtml(key, value, digits, asMinutes) {
    const id = this._avgIds && this._avgIds[key];
    if (!id || !isFinite(value)) return "";
    const st = this._hass.states[id];
    const avg = num(st);
    if (!isFinite(avg)) return "";
    const coverage = Number(st.attributes && st.attributes.age_coverage_ratio);
    const minCoverage = Number.isFinite(Number(this._config.min_coverage)) ? Number(this._config.min_coverage) : 0.5;
    if (isFinite(coverage) && coverage < minCoverage) return "";

    const diff = value - avg;
    const rounded = asMinutes ? Math.round(diff) : Number(diff.toFixed(digits ?? 0));
    const unit = asMinutes ? "" : unitLabel(st);
    const avgText = asMinutes ? fmtMinutes(avg) : `${fmtNumber(avg, digits)} ${unit}`.trim();
    const title = f(I.delta.title, { avg: avgText });
    if (rounded === 0) {
      return `<span class="delta" title="${esc(title)}">${esc(I.delta.same)}</span>`;
    }
    const sign = rounded > 0 ? "+" : "\u2212";
    const abs = Math.abs(rounded);
    const amount = asMinutes ? fmtMinutes(abs) : fmtNumber(abs, digits);
    return `<span class="delta" title="${esc(title)}">${esc(f(I.delta.diff, { sign, amount }))}</span>`;
  }

  _ring(ring) {
    const st = this._st(ring.key);
    const id = this._ids[ring.key];
    const value = num(st);
    const goal = Number((this._config.goals || {})[ring.key]) || ring.goal;
    const pct = isFinite(value) ? Math.min(value / goal, 1) : 0;
    const r = 34;
    const c = 2 * Math.PI * r;
    const goalText = isFinite(value)
      ? f(I.goal, { pct: Math.round((value / goal) * 100), goal: fmtNumber(goal, 0) })
      : I.noData;
    return `
      <div class="ring" ${id && st ? `data-entity="${esc(id)}"` : ""}>
        <div class="ring-figure">
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="${r}" class="ring-bg" style="stroke:${ring.color}"></circle>
            <circle cx="40" cy="40" r="${r}" class="ring-fg"
              style="stroke:${ring.color};stroke-dasharray:${c.toFixed(2)};stroke-dashoffset:${(c * (1 - pct)).toFixed(2)}"></circle>
          </svg>
          <div class="ring-center">
            <span class="ring-value">${esc(fmtNumber(value, 0))}</span>
            <span class="ring-unit">${esc(ring.key === "steps" ? I.units.steps : ring.unit)}</span>
          </div>
        </div>
        <div class="ring-label">${esc(I.labels[ring.key])}</div>
        <div class="ring-goal">${esc(goalText)}</div>
        ${this._ageHtml(st)}
      </div>`;
  }

  _tile(metric) {
    if (this._isHidden(metric.key)) return "";
    const id = this._ids[metric.key];
    const st = this._st(metric.key);
    if (!st && this._config.hide_missing) return "";
    if (isMissing(st) && this._config.hide_missing) return "";
    const value = num(st);
    const display = isFinite(value) ? fmtNumber(value, metric.digits) : isMissing(st) ? "—" : st.state;
    const glyph = GLYPHS[metric.icon] || GLYPHS.heart;
    return `
      <button class="tile${this._isStale(st, metric) ? " is-stale" : ""}" data-entity="${esc(id)}">
        <div class="tile-head">
          <span class="tile-icon" style="color:${metric.color};background:${metric.color}26">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${glyph}</svg>
          </span>
          <span class="tile-label">${esc(I.labels[metric.key])}</span>
        </div>
        <div class="tile-value">${esc(display)}<span class="tile-unit">${esc(unitLabel(st))}</span></div>
        ${this._deltaHtml(metric.key, value, metric.digits, false)}
        ${this._sparkKeys().includes(metric.key) ? this._sparkHtml(metric.key, metric.color) : ""}
        ${this._ageHtml(st, metric)}
      </button>`;
  }

  /** "86% di 7 h" se goals.sleep (ore) è impostato, altrimenti "". */
  _sleepGoalHtml(totalMinutes) {
    const goalH = Number((this._config.goals || {}).sleep);
    if (!(goalH > 0) || !isFinite(totalMinutes)) return "";
    const goalText = `${fmtNumber(goalH, 1)} h`;
    const pct = Math.round((totalMinutes / (goalH * 60)) * 100);
    return `<span class="delta">${esc(f(I.goal, { pct, goal: goalText }))}</span>`;
  }

  _sleep() {
    if (this._isHidden("sleep")) return "";
    const totalSt = this._st(SLEEP.total.key);
    const stages = SLEEP.stages
      .map((s) => ({ ...s, st: this._st(s.key), value: num(this._st(s.key)) }))
      .filter((s) => isFinite(s.value) && s.value > 0);
    const total = num(totalSt);
    if (!isFinite(total) && !stages.length) return "";

    const sum = stages.reduce((a, s) => a + s.value, 0);
    const bar = sum
      ? `<div class="sleep-bar">${stages
          .map(
            (s) =>
              `<span style="width:${((s.value / sum) * 100).toFixed(2)}%;background:${s.color}" title="${esc(
                I.labels[s.key],
              )}: ${esc(fmtMinutes(s.value))}"></span>`,
          )
          .join("")}</div>
        <div class="sleep-legend">${stages
          .map(
            (s) => `
          <div class="legend-item" data-entity="${esc(this._ids[s.key])}">
            <span class="dot" style="background:${s.color}"></span>
            <span class="legend-label">${esc(I.labels[s.key])}</span>
            <span class="legend-value">${esc(fmtMinutes(s.value))}</span>
          </div>`,
          )
          .join("")}</div>`
      : "";

    return `
      <div class="section-title">${esc(I.sections.sleep)}</div>
      <div class="panel sleep">
        <div class="sleep-head" data-entity="${esc(this._ids[SLEEP.total.key])}">
          <span class="tile-icon" style="color:#5E5CE6;background:#5E5CE626">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${GLYPHS.bed}</svg>
          </span>
          <div>
            <div class="tile-label">${esc(I.lastNight)}</div>
            <div class="tile-value">${esc(fmtMinutes(total))}</div>
            ${this._sleepGoalHtml(total)}
            ${this._deltaHtml(SLEEP.total.key, total, 0, true)}
          </div>
          <div class="sleep-age">${this._ageHtml(totalSt)}</div>
        </div>
        ${this._sparkKeys().includes(SLEEP.total.key) ? this._sparkHtml(SLEEP.total.key, "#5E5CE6") : ""}
        ${bar}
      </div>`;
  }

  _render() {
    if (!this._hass || !this._config || !this._ids) return;
    this._applyLanguage();

    const sections = SECTIONS.map((section) => {
      const tiles = section.metrics.map((m) => this._tile(m)).join("");
      if (!tiles.trim()) return "";
      return `<div class="section-title">${esc(I.sections[section.id])}</div><div class="grid">${tiles}</div>`;
    });

    const shownRings = RINGS.filter((r) => !this._isHidden(r.key));
    const rings = shownRings.length
      ? `<div class="rings" style="grid-template-columns:repeat(${shownRings.length},1fr)">${shownRings
          .map((r) => this._ring(r))
          .join("")}</div>`
      : "";

    const anyData = Object.values(this._ids).some((id) => !isMissing(this._hass.states[id]));

    const body = anyData
      ? `
        ${rings}
        ${sections[0]}
        ${sections[1]}
        ${this._sleep()}
        ${sections[2]}`
      : `<div class="empty">
          <strong>${esc(I.empty.title)}</strong>
          <p>${f(I.empty.body, { prefix: esc(this._config.prefix || "—") })}</p>
        </div>`;

    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="wrap">
          <div class="header">
            <div class="title">${esc(this._config.title || I.title)}</div>
            <div class="today">${esc(
              new Date().toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }),
            )}</div>
          </div>
          ${body}
        </div>
      </ha-card>`;
  }
}

const STYLE = `
  :host { display:block; }
  ha-card { overflow:hidden; background: var(--primary-background-color); }
  .wrap {
    container-type: inline-size;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", var(--paper-font-body1_-_font-family, sans-serif);
    padding: 18px 16px 20px;
    color: var(--primary-text-color);
    --ahc-panel: var(--ha-card-background, var(--card-background-color, #fff));
    --ahc-muted: var(--secondary-text-color);
    --ahc-border: var(--divider-color, rgba(0,0,0,.08));
  }
  .header { display:flex; align-items:baseline; justify-content:space-between; margin-bottom:14px; gap:8px; }
  .title { font-size:28px; font-weight:700; letter-spacing:-.5px; }
  .today { font-size:13px; color:var(--ahc-muted); text-transform:capitalize; text-align:right; }
  .panel, .rings, .tile {
    background: var(--ahc-panel); border: 1px solid var(--ahc-border); border-radius: 18px;
  }
  .rings { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:16px 10px; }
  .ring { text-align:center; cursor:pointer; }
  .ring-figure { position:relative; width:80px; height:80px; margin:0 auto; }
  .ring-figure svg { width:100%; height:100%; transform:rotate(-90deg); }
  .ring-bg { fill:none; stroke-width:9; opacity:.2; }
  .ring-fg { fill:none; stroke-width:9; stroke-linecap:round; }
  .ring-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.1; }
  .ring-value { font-size:16px; font-weight:700; letter-spacing:-.4px; }
  .ring-unit { font-size:10px; color:var(--ahc-muted); }
  .ring-label { font-size:12px; font-weight:600; margin-top:6px; }
  .ring-goal { font-size:11px; color:var(--ahc-muted); }
  .section-title { font-size:20px; font-weight:700; letter-spacing:-.3px; margin:20px 2px 8px; }
  .grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
  .tile { all:unset; box-sizing:border-box; cursor:pointer; background:var(--ahc-panel);
    border:1px solid var(--ahc-border); border-radius:18px; padding:14px;
    display:flex; flex-direction:column; gap:8px; }
  .tile:focus-visible { outline:2px solid var(--primary-color); }
  .tile.is-stale .tile-value { opacity:.55; }
  .tile-head { display:flex; align-items:center; gap:8px; }
  .tile-icon { flex:none; width:26px; height:26px; border-radius:9px; display:grid; place-items:center; }
  .tile-icon svg { width:15px; height:15px; }
  .tile-label { font-size:12px; font-weight:600; color:var(--ahc-muted); }
  .tile-value { font-size:24px; font-weight:700; letter-spacing:-.6px; }
  .tile-unit { font-size:12px; font-weight:600; color:var(--ahc-muted); margin-left:4px; }
  .delta { display:block; font-size:11px; font-weight:600; color:var(--ahc-muted); }
  .spark { display:block; width:100%; height:28px; margin-top:2px; overflow:visible; }
  .age { display:block; font-size:11px; color:var(--ahc-muted); margin-top:2px; }
  .tile .age { margin-top:auto; }
  .age.stale { color: var(--warning-color, #FF9F0A); font-weight:600; }
  .sleep { padding:14px; display:flex; flex-direction:column; gap:12px; }
  .sleep-head { display:flex; align-items:center; gap:10px; cursor:pointer; }
  .sleep-head .tile-value { font-size:22px; }
  .sleep-age { margin-left:auto; text-align:right; }
  .sleep-bar { display:flex; height:14px; border-radius:7px; overflow:hidden; gap:2px; }
  .sleep-bar span { display:block; height:100%; }
  .sleep-legend { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 12px; }
  .legend-item { display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; }
  .dot { width:9px; height:9px; border-radius:50%; flex:none; }
  .legend-label { color:var(--ahc-muted); }
  .legend-value { margin-left:auto; font-weight:600; }
  .empty { background:var(--ahc-panel); border-radius:18px; padding:18px; font-size:13px; }
  .empty p { margin:6px 0 0; color:var(--ahc-muted); }
  code { font-size:12px; }
  @container (min-width: 460px) {
    .grid { grid-template-columns:repeat(3,1fr); }
    .ring-figure { width:96px; height:96px; }
    .ring-value { font-size:18px; }
    .sleep-legend { display:flex; flex-wrap:wrap; gap:6px 28px; }
    .sleep-legend .legend-value { margin-left:2px; }
  }
  @container (min-width: 720px) {
    .title { font-size:32px; }
    .rings { padding:20px 14px; gap:14px; }
    .ring-figure { width:112px; height:112px; }
    .ring-value { font-size:21px; }
    .grid { grid-template-columns:repeat(4,1fr); gap:12px; }
    .tile { padding:16px; }
    .tile-value { font-size:28px; }
  }
`;

/* ------------------------------------------------------------------ */
/* Editor visuale (campi base; il resto via YAML)                      */
/* ------------------------------------------------------------------ */

class AppleHealthCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._rendered) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // La lingua dell'interfaccia può arrivare dopo setConfig: ridisegna solo se cambia.
    if (this._rendered && resolveLanguage(this._config, hass) !== this._lang) this._render();
  }

  _emit(config) {
    this._config = config;
    const e = new Event("config-changed", { bubbles: true, composed: true });
    e.detail = { config };
    this.dispatchEvent(e);
  }

  _render() {
    this._rendered = true;
    const c = this._config;
    const g = c.goals || {};
    this._lang = resolveLanguage(c, this._hass);
    const T = I18N[this._lang];
    const E = T.editor;
    const lang = String(c.language || "auto").toLowerCase();
    const sel = (v) => (lang === v ? " selected" : "");
    this.innerHTML = `
      <style>
        .row { display:flex; flex-direction:column; gap:4px; padding:8px 0; }
        label { font-size:12px; color:var(--secondary-text-color); }
        input, select { padding:8px; border-radius:8px; border:1px solid var(--divider-color);
          background:var(--card-background-color); color:var(--primary-text-color); }
        p { font-size:12px; color:var(--secondary-text-color); }
      </style>
      <div class="row"><label>${esc(E.title)}</label><input id="title" type="text" value="${esc(c.title || T.title)}"></div>
      <div class="row"><label>${esc(E.prefix)}</label><input id="prefix" type="text" value="${esc(c.prefix || "")}"></div>
      <div class="row"><label>${esc(E.kcal)}</label><input id="kcal" type="number" value="${esc(g.active_energy || 500)}"></div>
      <div class="row"><label>${esc(E.min)}</label><input id="min" type="number" value="${esc(g.exercise || 30)}"></div>
      <div class="row"><label>${esc(E.steps)}</label><input id="steps" type="number" value="${esc(g.steps || 10000)}"></div>
      <div class="row"><label>${esc(E.stale)}</label><input id="stale" type="number" value="${esc(c.stale_hours || 12)}"></div>
      <div class="row"><label>${esc(E.language)}</label>
        <select id="lang">
          <option value="auto"${sel("auto")}>${esc(E.auto)}</option>
          <option value="it"${sel("it")}>Italiano</option>
          <option value="en"${sel("en")}>English</option>
          <option value="es"${sel("es")}>Español</option>
          <option value="de"${sel("de")}>Deutsch</option>
        </select></div>
      <p>${E.note}</p>
      <p style="opacity:.7">Apple Health Card v${esc(VERSION)}</p>`;

    const val = (id) => this.querySelector(id).value;
    const update = () => {
      const config = {
        ...this._config,
        type: "custom:apple-health-card",
        title: val("#title"),
        prefix: val("#prefix").trim(),
        stale_hours: Number(val("#stale")) || 12,
        goals: {
          ...(this._config.goals || {}),
          active_energy: Number(val("#kcal")) || 500,
          exercise: Number(val("#min")) || 30,
          steps: Number(val("#steps")) || 10000,
        },
      };
      const chosen = val("#lang");
      if (chosen === "auto") delete config.language;
      else config.language = chosen;
      this._emit(config);
      if (resolveLanguage(config, this._hass) !== this._lang) this._render();
    };
    this.querySelectorAll("input, select").forEach((i) => i.addEventListener("change", update));
  }
}

if (!customElements.get("apple-health-card")) {
  customElements.define("apple-health-card", AppleHealthCard);
}
if (!customElements.get("apple-health-card-editor")) {
  customElements.define("apple-health-card-editor", AppleHealthCardEditor);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "apple-health-card")) {
  window.customCards.push({
    type: "apple-health-card",
    name: "Apple Health Card",
    description: "Plancia stile Apple Salute per i sensori della app Companion",
    preview: false,
  });
}
console.info(
  `%c APPLE-HEALTH-CARD %c ${VERSION} `,
  "background:#FF2D55;color:#fff;border-radius:3px 0 0 3px",
  "background:#F2F2F7;color:#1C1C1E;border-radius:0 3px 3px 0",
);

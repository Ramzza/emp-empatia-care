interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: "doctor" | "patient";
}

interface Doctor {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patientName: string;
  doctorName: string;
}

interface TurnstileApi {
  render(container: string, options: {
    sitekey: string;
    theme: "light";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
  }): string;
  remove(widgetId: string): void;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const $ = <T extends Element = HTMLElement>(selector: string, parent: ParentNode = document): T => {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected page element "${selector}" to exist.`);
  return element;
};
const $$ = <T extends Element = HTMLElement>(selector: string, parent: ParentNode = document): T[] =>
  [...parent.querySelectorAll<T>(selector)];

const dialog = $<HTMLDialogElement>(".auth-dialog");
const portal = $<HTMLElement>(".portal");
const toast = $<HTMLElement>(".toast");
const state: {
  user: PortalUser | null;
  csrfToken: string;
  doctors: Doctor[];
  selectedSlot: string;
  turnstileToken: string;
  turnstileWidget: string | null;
  turnstileSiteKey: string;
} = { user: null, csrfToken: "", doctors: [], selectedSlot: "", turnstileToken: "", turnstileWidget: null, turnstileSiteKey: "" };
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let turnstileScriptPromise: Promise<void> | null = null;

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (state.csrfToken && options.method && options.method !== "GET") {
    headers.set("X-CSRF-Token", state.csrfToken);
  }
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
      ? result.error
      : "A apărut o eroare. Încearcă din nou.";
    throw new Error(message);
  }
  return result as T;
}

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    day: "numeric",
    month: "long",
    weekday: "long",
    ...options,
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeText(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "A apărut o eroare. Încearcă din nou.";
}

function makeAppointmentCard(appointment: Appointment): HTMLElement {
  if (!state.user) throw new Error("A signed-in user is required to render an appointment.");
  const card = document.createElement("article");
  card.className = "appointment-item";
  const initials = appointment.patientName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("ro-RO");
  const detail = state.user.role === "doctor"
    ? `<strong>${escapeText(appointment.patientName)}</strong><span>Pacient · ${escapeText(appointment.doctorName)}</span>`
    : `<strong>${escapeText(appointment.doctorName)}</strong><span>Consultație · ${escapeText(appointment.patientName)}</span>`;
  card.innerHTML = `
    <div class="appointment-date"><span>${escapeText(formatDate(appointment.startsAt, { weekday: "short" }).replace(".", ""))}</span><strong>${escapeText(new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit" }).format(new Date(appointment.startsAt)))}</strong></div>
    <div class="appointment-details">${detail}</div>
    <div class="appointment-time">${escapeText(formatTime(appointment.startsAt))}<span>30 min</span></div>
    <span class="appointment-avatar" aria-hidden="true">${escapeText(initials)}</span>`;
  return card;
}

async function loadAppointments(): Promise<void> {
  const list = $("[data-appointments]");
  const empty = $("[data-empty]");
  list.replaceChildren();
  try {
    const { appointments } = await api<{ appointments: Appointment[] }>("/api/appointments");
    $("[data-appointment-count]").textContent = String(appointments.length).padStart(2, "0");
    for (const appointment of appointments) list.append(makeAppointmentCard(appointment));
    empty.hidden = appointments.length !== 0;
  } catch (error) {
    list.innerHTML = `<p class="muted">${escapeText(errorMessage(error))}</p>`;
    empty.hidden = true;
  }
}

function renderSlots(slots: string[]): void {
  const target = $("[data-slots]");
  target.replaceChildren();
  state.selectedSlot = "";
  if (slots.length === 0) {
    const message = document.createElement("span");
    message.className = "muted";
    message.textContent = "Nu sunt ore disponibile în această zi. Încearcă altă dată.";
    target.append(message);
    return;
  }
  for (const slot of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-button";
    button.textContent = formatTime(slot);
    button.addEventListener("click", () => {
      $$(".slot-button", target).forEach((candidate) => candidate.classList.remove("selected"));
      button.classList.add("selected");
      state.selectedSlot = slot;
    });
    target.append(button);
  }
}

async function loadSlots(): Promise<void> {
  const date = $<HTMLInputElement>("#appointment-date").value;
  const doctorId = $<HTMLSelectElement>("#doctor").value;
  state.selectedSlot = "";
  if (!date || !doctorId) return renderSlots([]);
  $("[data-slots]").textContent = "Se verifică orele disponibile…";
  try {
    const result = await api<{ slots: string[] }>(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`);
    renderSlots(result.slots);
  } catch (error) {
    $("[data-slots]").textContent = errorMessage(error);
  }
}

function loadTurnstile(): void {
  const turnstile = window.turnstile;
  if (!state.turnstileSiteKey || !turnstile) return;
  if (state.turnstileWidget !== null) turnstile.remove(state.turnstileWidget);
  state.turnstileToken = "";
  $("#turnstile").replaceChildren();
  state.turnstileWidget = turnstile.render("#turnstile", {
    sitekey: state.turnstileSiteKey,
    theme: "light",
    callback: (token) => { state.turnstileToken = token; },
    "expired-callback": () => { state.turnstileToken = ""; },
    "error-callback": () => { state.turnstileToken = ""; },
  });
}

function ensureTurnstile(): Promise<void> {
  if (window.turnstile) {
    loadTurnstile();
    return Promise.resolve();
  }
  if (turnstileScriptPromise) return turnstileScriptPromise.then(loadTurnstile);
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Verificarea de securitate nu este disponibilă."));
    document.head.append(script);
  });
  return turnstileScriptPromise.then(loadTurnstile);
}

async function loadTurnstileConfig(): Promise<void> {
  try {
    const config = await api<{ turnstileSiteKey: string }>("/api/config");
    state.turnstileSiteKey = config.turnstileSiteKey;
    if (!state.turnstileSiteKey) return;
    await ensureTurnstile();
  } catch {
    $("#booking-message").textContent = "Verificarea de securitate nu este disponibilă. Te rugăm să încerci din nou mai târziu.";
  }
}

function showPortal(): void {
  if (!state.user) return;
  dialog.close();
  portal.hidden = false;
  document.body.classList.add("portal-open");
  const isDoctor = state.user.role === "doctor";
  $(".portal-grid").classList.toggle("doctor-grid", isDoctor);
  $("[data-user-name]").textContent = state.user.name;
  $("[data-avatar]").textContent = state.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toLocaleUpperCase("ro-RO");
  $("[data-portal-heading]").textContent = isDoctor ? `Bună ziua, ${state.user.name}` : `Bun venit, ${state.user.name}`;
  $("[data-portal-intro]").textContent = isDoctor
    ? "Iată programările viitoare din agenda cabinetului."
    : "Alege medicul și un moment potrivit pentru tine.";
  $$("[data-patient-only]").forEach((element) => { element.hidden = isDoctor; });
  $("[data-list-label]").textContent = isDoctor ? "AGENDA CABINETULUI" : "SPAȚIUL TĂU PERSONAL";
  $("[data-list-heading]").textContent = isDoctor ? "Pacienți programați" : "Programările tale";
  if (!isDoctor) {
    const doctorSelect = $<HTMLSelectElement>("#doctor");
    doctorSelect.replaceChildren();
    if (state.doctors.length === 0) {
      const option = new Option("Contactează cabinetul pentru acces", "");
      doctorSelect.add(option);
      doctorSelect.disabled = true;
      $<HTMLButtonElement>("#booking-form button[type=submit]").disabled = true;
    } else {
      doctorSelect.disabled = false;
      $<HTMLButtonElement>("#booking-form button[type=submit]").disabled = false;
      for (const doctor of state.doctors) doctorSelect.add(new Option(doctor.name, doctor.id));
    }
    $<HTMLInputElement>("#appointment-date").min = localToday();
    $<HTMLInputElement>("#appointment-date").value = "";
    renderSlots([]);
  }
  loadAppointments();
  if (!isDoctor) loadTurnstileConfig();
}

function hidePortal() {
  portal.hidden = true;
  document.body.classList.remove("portal-open");
  state.user = null;
  state.csrfToken = "";
}

document.querySelectorAll("[data-open-login]").forEach((button) => button.addEventListener("click", async () => {
  if (state.user) {
    showPortal();
    return;
  }
  $("#login-message").textContent = "";
  dialog.showModal();
}));

$(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

$("#login-form").addEventListener("submit", async (event: Event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("#login-form button[type=submit]");
  const message = $("#login-message");
  message.textContent = "";
  button.disabled = true;
  try {
    await api<{ user: PortalUser }>("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: $<HTMLInputElement>("#email").value,
        password: $<HTMLInputElement>("#password").value,
      }),
    });
    const session = await api<{ user: PortalUser; csrfToken: string; doctors: Doctor[] }>("/api/session");
    state.user = session.user;
    state.csrfToken = session.csrfToken;
    state.doctors = session.doctors;
    $<HTMLInputElement>("#password").value = "";
    showPortal();
  } catch (error) {
    message.textContent = errorMessage(error);
  } finally {
    button.disabled = false;
  }
});

$("#doctor").addEventListener("change", loadSlots);
$("#appointment-date").addEventListener("change", loadSlots);

$("#booking-form").addEventListener("submit", async (event: Event) => {
  event.preventDefault();
  const message = $("#booking-message");
  const button = $<HTMLButtonElement>("#booking-form button[type=submit]");
  message.textContent = "";
  if (!state.selectedSlot) {
    message.textContent = "Alege mai întâi un interval disponibil.";
    return;
  }
  button.disabled = true;
  try {
    await api<{ ok: boolean; id: string }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        doctorId: $<HTMLSelectElement>("#doctor").value,
        startsAt: state.selectedSlot,
        turnstileToken: state.turnstileToken,
        website: $<HTMLInputElement>('input[name="website"]').value,
      }),
    });
    showToast("Programarea ta a fost confirmată.");
    state.selectedSlot = "";
    if (window.turnstile && state.turnstileWidget !== null) window.turnstile.reset(state.turnstileWidget);
    state.turnstileToken = "";
    await Promise.all([loadSlots(), loadAppointments()]);
  } catch (error) {
    message.textContent = errorMessage(error);
    if (window.turnstile && state.turnstileWidget !== null) window.turnstile.reset(state.turnstileWidget);
    state.turnstileToken = "";
  } finally {
    button.disabled = false;
  }
});

$("[data-logout]").addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    hidePortal();
    showToast("Ai ieșit din cont.");
  } catch (error) {
    showToast(errorMessage(error));
  }
});

const menuToggle = $(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isOpen));
  $(".main-nav").classList.toggle("open", !isOpen);
});
$$(".main-nav a").forEach((link) => link.addEventListener("click", () => {
  menuToggle.setAttribute("aria-expanded", "false");
  $(".main-nav").classList.remove("open");
}));
$$("[data-year]").forEach((element) => { element.textContent = String(new Date().getFullYear()); });

try {
  const session = await api<{ user: PortalUser | null; csrfToken?: string; doctors?: Doctor[] }>("/api/session");
  if (session.user) {
    state.user = session.user;
    state.csrfToken = session.csrfToken ?? "";
    state.doctors = session.doctors ?? [];
  }
} catch {
  console.error("Could not restore the current session.");
}

export {};

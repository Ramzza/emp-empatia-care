import { hashCnp } from "./cnp.js";
const $ = (selector, parent = document) => {
    const element = parent.querySelector(selector);
    if (!element)
        throw new Error(`Expected page element "${selector}" to exist.`);
    return element;
};
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const adminDialog = $("#admin-dialog");
const cancelDialog = $("#cancel-dialog");
const portal = $(".portal");
const toast = $(".toast");
const state = {
    csrfToken: "",
    doctors: [],
    selectedSlot: "",
    turnstileToken: "",
    turnstileWidget: null,
    turnstileSiteKey: "",
};
let toastTimer;
let turnstileScriptPromise = null;
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}
async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body)
        headers.set("Content-Type", "application/json");
    if (state.csrfToken && options.method && options.method !== "GET") {
        headers.set("X-CSRF-Token", state.csrfToken);
    }
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    const result = await response.json();
    if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "A apărut o eroare. Încearcă din nou.";
        throw new Error(message);
    }
    return result;
}
function localToday() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}
function formatDate(value, options = {}) {
    return new Intl.DateTimeFormat("ro-RO", {
        timeZone: "Europe/Bucharest",
        day: "numeric",
        month: "long",
        weekday: "long",
        ...options,
    }).format(new Date(value));
}
function formatTime(value) {
    return new Intl.DateTimeFormat("ro-RO", {
        timeZone: "Europe/Bucharest",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function escapeText(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char] ?? char);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : "A apărut o eroare. Încearcă din nou.";
}
function makeAppointmentCard(appointment) {
    const card = document.createElement("article");
    card.className = "appointment-item";
    card.innerHTML = `
    <div class="appointment-date"><span>${escapeText(formatDate(appointment.startsAt, { weekday: "short" }).replace(".", ""))}</span><strong>${escapeText(new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "2-digit" }).format(new Date(appointment.startsAt)))}</strong></div>
    <div class="appointment-details"><strong>${escapeText(appointment.doctorName)}</strong><span>Programare activă</span></div>
    <div class="appointment-time">${escapeText(formatTime(appointment.startsAt))}<span>30 min</span></div>
    <span class="appointment-avatar" aria-hidden="true">✳</span>`;
    return card;
}
async function loadAppointments() {
    const list = $("[data-appointments]");
    const empty = $("[data-empty]");
    list.replaceChildren();
    try {
        const { appointments } = await api("/api/appointments");
        $("[data-appointment-count]").textContent = String(appointments.length).padStart(2, "0");
        for (const appointment of appointments)
            list.append(makeAppointmentCard(appointment));
        empty.hidden = appointments.length !== 0;
    }
    catch (error) {
        list.innerHTML = `<p class="muted">${escapeText(errorMessage(error))}</p>`;
        empty.hidden = true;
    }
}
function renderSlots(slots) {
    const target = $("[data-slots]");
    target.replaceChildren();
    state.selectedSlot = "";
    if (slots.length === 0) {
        const message = document.createElement("span");
        message.className = "muted";
        message.textContent = "Nu sunt ore disponibile în această zi. Încearcă altă dată.";
        target.append(message);
    }
    else {
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
}
async function loadSlots() {
    const date = $("#appointment-date").value;
    const doctorId = $("#doctor").value;
    state.selectedSlot = "";
    if (!date || !doctorId) {
        renderSlots([]);
    }
    else {
        $("[data-slots]").textContent = "Se verifică orele disponibile…";
        try {
            const result = await api(`/api/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`);
            renderSlots(result.slots);
        }
        catch (error) {
            $("[data-slots]").textContent = errorMessage(error);
        }
    }
}
async function loadDoctors() {
    const select = $("#doctor");
    const button = $("#booking-form button[type=submit]");
    select.disabled = true;
    button.disabled = true;
    try {
        const result = await api("/api/doctors");
        state.doctors = result.doctors;
        select.replaceChildren();
        if (state.doctors.length === 0) {
            select.add(new Option("Contactează cabinetul pentru acces", ""));
            $("[data-slots]").textContent = "Nu există medici disponibili pentru programare.";
        }
        else {
            for (const doctor of state.doctors)
                select.add(new Option(doctor.name, doctor.id));
            select.disabled = false;
            button.disabled = false;
        }
    }
    catch (error) {
        $("[data-booking-message]").textContent = errorMessage(error);
    }
}
function loadTurnstile() {
    const turnstile = window.turnstile;
    if (state.turnstileSiteKey && turnstile) {
        if (state.turnstileWidget !== null)
            turnstile.remove(state.turnstileWidget);
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
}
function ensureTurnstile() {
    let loadPromise;
    if (window.turnstile) {
        loadTurnstile();
        loadPromise = Promise.resolve();
    }
    else if (turnstileScriptPromise) {
        loadPromise = turnstileScriptPromise.then(loadTurnstile);
    }
    else {
        turnstileScriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Verificarea de securitate nu este disponibilă."));
            document.head.append(script);
        });
        loadPromise = turnstileScriptPromise.then(loadTurnstile);
    }
    return loadPromise;
}
async function loadTurnstileConfig() {
    try {
        const config = await api("/api/config");
        state.turnstileSiteKey = config.turnstileSiteKey;
        if (state.turnstileSiteKey)
            await ensureTurnstile();
    }
    catch {
        $("[data-booking-message]").textContent = "Verificarea de securitate nu este disponibilă. Încearcă din nou mai târziu.";
    }
}
function showBookingPortal() {
    adminDialog.close();
    portal.hidden = false;
    document.body.classList.add("portal-open");
    state.csrfToken = "";
    $("[data-booking-only]").hidden = false;
    $("[data-admin-only]").hidden = true;
    $("[data-admin-controls]").hidden = true;
    $(".portal-grid").classList.remove("admin-grid");
    $(".portal-grid").classList.add("booking-grid");
    $("[data-portal-label]").textContent = "PROGRAMARE ONLINE";
    $("[data-portal-heading]").textContent = "Alege programarea.";
    $("[data-portal-intro]").textContent = "Introdu CNP-ul înregistrat la clinică, datele de contact și intervalul preferat.";
    $("#booking-message").textContent = "";
    $("#appointment-date").min = localToday();
    $("#appointment-date").value = "";
    $("#cnp").value = "";
    $("#booking-email").value = "";
    renderSlots([]);
    void loadDoctors();
    void loadTurnstileConfig();
}
function showAdminPortal() {
    adminDialog.close();
    portal.hidden = false;
    document.body.classList.add("portal-open");
    $("[data-booking-only]").hidden = true;
    $("[data-admin-only]").hidden = false;
    $("[data-admin-controls]").hidden = false;
    $(".portal-grid").classList.remove("booking-grid");
    $(".portal-grid").classList.add("admin-grid");
    $("[data-portal-label]").textContent = "ADMINISTRARE";
    $("[data-portal-heading]").textContent = "Programări active";
    $("[data-portal-intro]").textContent = "Agenda cu toate programările viitoare confirmate.";
    loadAppointments();
}
function hidePortal() {
    portal.hidden = true;
    document.body.classList.remove("portal-open");
    state.csrfToken = "";
    $("#cnp").value = "";
    $("#booking-email").value = "";
    $("#password").value = "";
    $("#admin-username").value = "";
}
$$("[data-open-booking]").forEach((button) => {
    button.addEventListener("click", showBookingPortal);
});
$$("[data-open-admin]").forEach((button) => {
    button.addEventListener("click", () => {
        $("#admin-login-message").textContent = "";
        adminDialog.showModal();
    });
});
$(".dialog-close").addEventListener("click", () => adminDialog.close());
adminDialog.addEventListener("click", (event) => {
    if (event.target === adminDialog)
        adminDialog.close();
});
adminDialog.addEventListener("close", () => {
    $("#admin-username").value = "";
    $("#password").value = "";
});
$("#admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#admin-login-form button[type=submit]");
    const message = $("#admin-login-message");
    message.textContent = "";
    button.disabled = true;
    try {
        await api("/api/admin/login", {
            method: "POST",
            body: JSON.stringify({
                username: $("#admin-username").value,
                password: $("#password").value,
            }),
        });
        const session = await api("/api/admin/session");
        if (!session.admin || !session.csrfToken)
            throw new Error("Administrator access could not be verified.");
        state.csrfToken = session.csrfToken;
        $("#password").value = "";
        showAdminPortal();
    }
    catch (error) {
        message.textContent = errorMessage(error);
    }
    finally {
        button.disabled = false;
    }
});
$("#doctor").addEventListener("change", () => { void loadSlots(); });
$("#appointment-date").addEventListener("change", () => { void loadSlots(); });
$("#booking-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#booking-message");
    const button = $("#booking-form button[type=submit]");
    message.textContent = "";
    if (!state.selectedSlot) {
        message.textContent = "Alege mai întâi un interval disponibil.";
    }
    else {
        button.disabled = true;
        try {
            const cnpHash = await hashCnp($("#cnp").value);
            await api("/api/appointments", {
                method: "POST",
                body: JSON.stringify({
                    cnpHash,
                    email: $("#booking-email").value.trim(),
                    doctorId: $("#doctor").value,
                    startsAt: state.selectedSlot,
                    turnstileToken: state.turnstileToken,
                    website: $('input[name="website"]').value,
                }),
            });
            $("#cnp").value = "";
            $("#booking-email").value = "";
            showToast("Programarea este confirmată. Verifică e-mailul pentru detalii și anulare.");
            state.selectedSlot = "";
            if (window.turnstile && state.turnstileWidget !== null)
                window.turnstile.reset(state.turnstileWidget);
            state.turnstileToken = "";
            await loadSlots();
        }
        catch (error) {
            message.textContent = errorMessage(error);
            if (window.turnstile && state.turnstileWidget !== null)
                window.turnstile.reset(state.turnstileWidget);
            state.turnstileToken = "";
        }
        finally {
            button.disabled = false;
        }
    }
});
$("[data-logout]").addEventListener("click", async () => {
    try {
        await api("/api/admin/logout", { method: "POST", body: "{}" });
        hidePortal();
        showToast("Ai ieșit din cont.");
    }
    catch (error) {
        showToast(errorMessage(error));
    }
});
$("#cancel-confirm").addEventListener("click", async () => {
    const appointmentId = new URLSearchParams(window.location.search).get("cancel") || "";
    const message = $("#cancel-message");
    const button = $("#cancel-confirm");
    message.textContent = "";
    button.disabled = true;
    try {
        await api(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
            method: "POST",
            body: "{}",
        });
        message.textContent = "Programarea a fost anulată.";
        history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
    catch (error) {
        message.textContent = errorMessage(error);
    }
});
$(".cancel-close").addEventListener("click", () => cancelDialog.close());
const cancelId = new URLSearchParams(window.location.search).get("cancel");
if (cancelId) {
    cancelDialog.showModal();
    const validCancelId = /^[0-9a-f]{64}$/.test(cancelId);
    if (!validCancelId) {
        $("#cancel-message").textContent = "Linkul de anulare nu este valid.";
        $("#cancel-confirm").disabled = true;
    }
}
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
    const session = await api("/api/admin/session");
    if (session.admin && session.csrfToken) {
        state.csrfToken = session.csrfToken;
        showAdminPortal();
    }
}
catch {
    console.error("Could not restore the current admin session.");
}

// =====================================================
// TNF ADMIN DASHBOARD - admin.js
// =====================================================

// =====================================================
// API BASE URL
// =====================================================

// Same-origin: netlify.toml routes /api/* to the Netlify Function
// (/.netlify/functions/api/:splat), so no full URL and no CORS needed.
const API_URL = "";

const REQUEST_TIMEOUT_MS = 30000;


// =====================================================
// ELEMENTS
// =====================================================

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginText = document.getElementById("loginText");
const loginError = document.getElementById("loginError");

const logoutButton = document.getElementById("logoutButton");
const refreshButton = document.getElementById("refreshButton");

const usersTableBody = document.getElementById("usersTableBody");

const totalUsers = document.getElementById("totalUsers");
const registeredUsers = document.getElementById("registeredUsers");
const availableUsers = document.getElementById("availableUsers");


// =====================================================
// HELPERS
// =====================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setText(element, value) {
    if (element) {
        element.textContent = value;
    }
}

// =====================================================
// API REQUEST
// =====================================================

async function apiRequest(url, options = {}) {

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {

        const response = await fetch(`${API_URL}${url}`, {
            ...options,
            credentials: "include",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        const text = await response.text();
        let data = {};

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            throw new Error(`Invalid server response (HTTP ${response.status})`);
        }

        if (!response.ok) {
            throw new Error(
                data.message ||
                data.error ||
                `Request failed (HTTP ${response.status})`
            );
        }

        return data;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error(
                "Server request timed out. Please try again."
            );
        }

        // fetch() throws TypeError for network failures
        if (error instanceof TypeError) {
            throw new Error(
                "Cannot reach the server. Check your internet connection and try again."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


// =====================================================
// SHOW / HIDE SECTIONS
// =====================================================

function showLogin() {
    if (loginSection) loginSection.hidden = false;
    if (dashboardSection) dashboardSection.hidden = true;
    setText(loginError, "");
}

function showDashboard() {
    if (loginSection) loginSection.hidden = true;
    if (dashboardSection) dashboardSection.hidden = false;
}


// =====================================================
// LOGIN
// =====================================================

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();
        setText(loginError, "");

        const usernameElement = document.getElementById("username");
        const passwordElement = document.getElementById("password");

        const username = usernameElement ? usernameElement.value.trim() : "";
        const password = passwordElement ? passwordElement.value : "";

        if (!username || !password) {
            setText(loginError, "Please enter username and password.");
            return;
        }

        if (loginButton) loginButton.disabled = true;
        setText(loginText, "Logging in...");

        try {

            const result = await apiRequest("/api/admin/login", {
                method: "POST",
                body: JSON.stringify({ username, password })
            });

            console.log("Admin login response:", result);

            showDashboard();
            loginForm.reset();

            await loadUsers();

        } catch (error) {

            console.error("Admin login error:", error);
            setText(loginError, error.message || "Login failed.");

        } finally {

            if (loginButton) loginButton.disabled = false;
            setText(loginText, "Login");

        }
    });
}


// =====================================================
// LOAD NFC REGISTRATIONS
// =====================================================

function extractList(result) {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.data)) return result.data;
    if (result && Array.isArray(result.users)) return result.users;
    if (result && Array.isArray(result.nfc)) return result.nfc;
    return [];
}

function countByStatus(users, status) {
    return users.filter(
        user => String(user.status || "").toLowerCase() === status
    ).length;
}

async function loadUsers() {

    if (!usersTableBody) {
        console.error("usersTableBody element not found.");
        return;
    }

    usersTableBody.innerHTML = `
        <tr>
            <td colspan="6" class="loading">Loading NFC registrations...</td>
        </tr>
    `;

    try {

        const result = await apiRequest("/api/nfc/all");
        console.log("NFC API response:", result);

        const users = extractList(result);

        setText(totalUsers, users.length);
        setText(registeredUsers, countByStatus(users, "registered"));
        setText(availableUsers, countByStatus(users, "available"));

        if (users.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading">No NFC registrations found.</td>
                </tr>
            `;
            return;
        }

        usersTableBody.innerHTML = users.map(user => {

            const date = user.createdAt
                ? new Date(user.createdAt).toLocaleString()
                : "-";

            return `
                <tr>
                    <td><strong>${escapeHtml(user.nfcId || "-")}</strong></td>
                    <td>${escapeHtml(user.name || "-")}</td>
                    <td>${escapeHtml(user.course || "-")}</td>
                    <td>${escapeHtml(user.item || "-")}</td>
                    <td><span class="status">${escapeHtml(user.status || "-")}</span></td>
                    <td>${escapeHtml(date)}</td>
                </tr>
            `;

        }).join("");

    } catch (error) {

        console.error("Load NFC registrations error:", error);

        setText(totalUsers, "0");
        setText(registeredUsers, "0");
        setText(availableUsers, "0");

        // If the session expired, go back to login
        if (/401|403|unauthor|not authenticated/i.test(error.message)) {
            showLogin();
            setText(loginError, "Session expired. Please log in again.");
            return;
        }

        usersTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading">${escapeHtml(error.message)}</td>
            </tr>
        `;
    }
}


// =====================================================
// LOGOUT
// =====================================================

if (logoutButton) {

    logoutButton.addEventListener("click", async function () {

        try {
            await apiRequest("/api/admin/logout", { method: "POST" });
        } catch (error) {
            console.error("Logout error:", error);
        }

        showLogin();
    });
}


// =====================================================
// REFRESH
// =====================================================

if (refreshButton) {

    refreshButton.addEventListener("click", async function () {

        refreshButton.disabled = true;

        try {
            await loadUsers();
        } catch (error) {
            console.error("Refresh error:", error);
        } finally {
            refreshButton.disabled = false;
        }
    });
}


// =====================================================
// CHECK EXISTING ADMIN SESSION
// =====================================================

async function checkAdminSession() {

    try {

        const result = await apiRequest("/api/admin/me");
        console.log("Admin session:", result);

        if (result && result.authenticated === true) {
            showDashboard();
            await loadUsers();
            return;
        }

        showLogin();

    } catch (error) {

        console.error("Session check error:", error);
        showLogin();
    }
}


// =====================================================
// START ADMIN PAGE
// =====================================================

document.addEventListener("DOMContentLoaded", checkAdminSession);
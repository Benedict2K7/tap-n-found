// =====================================================
// TNF ADMIN DASHBOARD
// =====================================================

// IMPORTANT:
// Change this ONE line after deploying your server.js.
//
// Local backend:
// http://localhost:5000
//
// Example deployed backend:
// https://tnf-backend.onrender.com
//
const API_BASE_URL = "http://localhost:5000";


// =====================================================
// DOM ELEMENTS
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
// API URL HELPER
// =====================================================

function getApiUrl(endpoint) {

    if (!endpoint.startsWith("/")) {
        endpoint = "/" + endpoint;
    }

    return API_BASE_URL.replace(/\/$/, "") + endpoint;
}


// =====================================================
// API REQUEST
// =====================================================

async function apiRequest(endpoint, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 15000);

    try {

        const response = await fetch(
            getApiUrl(endpoint),
            {
                ...options,

                // Important for admin session cookie
                credentials: "include",

                signal: controller.signal,

                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            }
        );


        const text = await response.text();

        let data = {};


        // Try to read JSON
        try {

            data = text
                ? JSON.parse(text)
                : {};

        } catch {

            throw new Error(
                `Invalid server response (HTTP ${response.status})`
            );

        }


        // HTTP error
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
                "Server request timed out. Check that the backend server is running."
            );

        }


        // Browser network error
        if (
            error instanceof TypeError &&
            error.message === "Failed to fetch"
        ) {

            throw new Error(
                "Unable to connect to the backend server. Check the API URL, server status, and CORS settings."
            );

        }


        throw error;

    } finally {

        clearTimeout(timeout);

    }

}


// =====================================================
// SHOW LOGIN
// =====================================================

function showLogin() {

    loginSection.hidden = false;

    dashboardSection.hidden = true;

    loginError.textContent = "";

}


// =====================================================
// SHOW DASHBOARD
// =====================================================

function showDashboard() {

    loginSection.hidden = true;

    dashboardSection.hidden = false;

}


// =====================================================
// LOGIN
// =====================================================

loginForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        loginError.textContent = "";


        const username =
            document
                .getElementById("username")
                .value
                .trim();


        const password =
            document
                .getElementById("password")
                .value;


        // Check fields
        if (!username || !password) {

            loginError.textContent =
                "Please enter username and password.";

            return;

        }


        // Disable button
        loginButton.disabled = true;

        loginText.textContent = "Logging in...";


        try {

            // =================================================
            // ADMIN LOGIN
            // =================================================

            const result =
                await apiRequest(
                    "/api/admin/login",
                    {
                        method: "POST",

                        body: JSON.stringify({
                            username: username,
                            password: password
                        })
                    }
                );


            console.log(
                "Admin login response:",
                result
            );


            // =================================================
            // CHECK SESSION AFTER LOGIN
            // =================================================

            const session =
                await apiRequest(
                    "/api/admin/me"
                );


            if (
                !session ||
                session.authenticated !== true
            ) {

                throw new Error(
                    "Login succeeded, but the admin session could not be created."
                );

            }


            // Show dashboard
            showDashboard();


            // Reset login
            loginForm.reset();


            // Load users
            await loadUsers();


        } catch (error) {

            console.error(
                "Admin login error:",
                error
            );


            loginError.textContent =
                error.message ||
                "Login failed.";

        } finally {

            loginButton.disabled = false;

            loginText.textContent = "Login";

        }

    }
);


// =====================================================
// LOAD USERS
// =====================================================

async function loadUsers() {

    usersTableBody.innerHTML = `
        <tr>
            <td colspan="6" class="loading">
                Loading users...
            </td>
        </tr>
    `;


    try {

        const result =
            await apiRequest(
                "/api/admin/users"
            );


        console.log(
            "Admin users response:",
            result
        );


        // =================================================
        // YOUR CURRENT SERVER RETURNS AN ARRAY
        //
        // Example:
        //
        // [
        //   {
        //      name: "...",
        //      email: "...",
        //      course: "...",
        //      createdAt: "..."
        //   }
        // ]
        //
        // This code also supports:
        //
        // {
        //    users: [...]
        // }
        // =================================================

        let users = [];


        if (Array.isArray(result)) {

            users = result;

        } else if (
            result &&
            Array.isArray(result.users)
        ) {

            users = result.users;

        }


        // =================================================
        // STATS
        // =================================================

        let stats = {};


        if (
            result &&
            !Array.isArray(result) &&
            result.stats
        ) {

            stats = result.stats;

        }


        totalUsers.textContent =
            stats.total ??
            users.length;


        registeredUsers.textContent =
            stats.registered ??
            users.length;


        availableUsers.textContent =
            stats.available ??
            0;


        // =================================================
        // NO USERS
        // =================================================

        if (users.length === 0) {

            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading">
                        No registered users found.
                    </td>
                </tr>
            `;

            return;

        }


        // =================================================
        // CREATE TABLE
        // =================================================

        usersTableBody.innerHTML =
            users
                .map(function (user) {

                    const date =
                        user.createdAt
                            ? new Date(
                                user.createdAt
                            ).toLocaleString()
                            : "-";


                    // Your current /api/admin/users
                    // returns Owner information.
                    //
                    // NFC fields may not exist yet.
                    const nfcId =
                        user.nfcId ||
                        "-";


                    const name =
                        user.name ||
                        "-";


                    const course =
                        user.course ||
                        "-";


                    const item =
                        user.item ||
                        "-";


                    const status =
                        user.status ||
                        "registered";


                    return `
                        <tr>

                            <td>
                                <strong>
                                    ${escapeHtml(nfcId)}
                                </strong>
                            </td>

                            <td>
                                ${escapeHtml(name)}
                            </td>

                            <td>
                                ${escapeHtml(course)}
                            </td>

                            <td>
                                ${escapeHtml(item)}
                            </td>

                            <td>
                                <span class="status">
                                    ${escapeHtml(status)}
                                </span>
                            </td>

                            <td>
                                ${escapeHtml(date)}
                            </td>

                        </tr>
                    `;

                })
                .join("");


    } catch (error) {

        console.error(
            "Load users error:",
            error
        );


        usersTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading">
                    ${escapeHtml(error.message)}
                </td>
            </tr>
        `;

    }

}


// =====================================================
// LOGOUT
// =====================================================

logoutButton.addEventListener(
    "click",
    async function () {

        logoutButton.disabled = true;


        try {

            await apiRequest(
                "/api/admin/logout",
                {
                    method: "POST"
                }
            );


        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

        } finally {

            logoutButton.disabled = false;

            showLogin();

        }

    }
);


// =====================================================
// REFRESH
// =====================================================

refreshButton.addEventListener(
    "click",
    async function () {

        refreshButton.disabled = true;


        try {

            await loadUsers();

        } finally {

            refreshButton.disabled = false;

        }

    }
);


// =====================================================
// HTML ESCAPE
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =====================================================
// CHECK EXISTING ADMIN SESSION
// =====================================================

async function checkAdminSession() {

    try {

        const result =
            await apiRequest(
                "/api/admin/me"
            );


        console.log(
            "Admin session:",
            result
        );


        if (
            result &&
            result.authenticated === true
        ) {

            showDashboard();

            await loadUsers();

            return;

        }


        showLogin();


    } catch (error) {

        console.error(
            "Session check error:",
            error
        );


        showLogin();

    }

}


// =====================================================
// TEST BACKEND CONNECTION
// =====================================================

async function testBackendConnection() {

    try {

        const result =
            await apiRequest(
                "/api/health"
            );


        console.log(
            "Backend health:",
            result
        );


        return true;

    } catch (error) {

        console.error(
            "Backend connection failed:",
            error
        );


        return false;

    }

}


// =====================================================
// START ADMIN PAGE
// =====================================================

async function startAdminPage() {

    console.log(
        "TNF Admin Dashboard starting..."
    );


    console.log(
        "Backend URL:",
        API_BASE_URL
    );


    // First check backend
    const backendOnline =
        await testBackendConnection();


    if (!backendOnline) {

        console.error(
            "TNF backend is not reachable."
        );

        showLogin();

        loginError.textContent =
            "Unable to connect to the backend server.";

        return;

    }


    // Check admin login
    await checkAdminSession();

}


// =====================================================
// START
// =====================================================

startAdminPage();
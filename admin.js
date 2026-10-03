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
// API REQUEST
// =====================================================

async function apiRequest(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 15000);

    try {

        const response = await fetch(url, {
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
            throw new Error(
                `Invalid server response (HTTP ${response.status})`
            );
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
                "Server request timed out. Check that the server is running."
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

loginForm.addEventListener("submit", async function (event) {

    event.preventDefault();

    loginError.textContent = "";

    const username =
        document.getElementById("username").value.trim();

    const password =
        document.getElementById("password").value;


    if (!username || !password) {

        loginError.textContent =
            "Please enter username and password.";

        return;

    }


    loginButton.disabled = true;
    loginText.textContent = "Logging...";


    try {

        // Login only
        const result =
            await apiRequest(
                "/api/admin/login",
                {
                    method: "POST",

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );


        console.log(
            "Login response:",
            result
        );


        // Open dashboard immediately
        showDashboard();


        // Reset login button
        loginButton.disabled = false;
        loginText.textContent = "Login";

        loginForm.reset();


        // Load users separately
        loadUsers();


    } catch (error) {

        console.error(
            "Admin login error:",
            error
        );


        loginError.textContent =
            error.message ||
            "Login failed.";


        loginButton.disabled = false;
        loginText.textContent = "Login";

    }

});


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
            "Users response:",
            result
        );


        const stats =
            result.stats || {};


        const users =
            Array.isArray(result.users)
                ? result.users
                : [];


        totalUsers.textContent =
            stats.total ?? users.length;

        registeredUsers.textContent =
            stats.registered ?? 0;

        availableUsers.textContent =
            stats.available ?? 0;


        if (users.length === 0) {

            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading">
                        No NFC registrations found.
                    </td>
                </tr>
            `;

            return;
        }


        usersTableBody.innerHTML =
            users.map(user => {

                const date =
                    user.createdAt
                        ? new Date(
                            user.createdAt
                        ).toLocaleString()
                        : "-";


                return `
                    <tr>

                        <td>
                            <strong>
                                ${escapeHtml(
                                    user.nfcId
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                user.name
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.course
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                user.item
                            )}
                        </td>

                        <td>
                            <span class="status">
                                ${escapeHtml(
                                    user.status
                                )}
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(
                                date
                            )}
                        </td>

                    </tr>
                `;

            }).join("");


    } catch (error) {

        console.error(
            "Load users error:",
            error
        );


        usersTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="loading">
                    ${escapeHtml(
                        error.message
                    )}
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

        }

        showLogin();

    }
);


// =====================================================
// REFRESH
// =====================================================

refreshButton.addEventListener(
    "click",
    async function () {

        await loadUsers();

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
// CHECK EXISTING SESSION
// =====================================================

async function checkAdminSession() {

    try {

        const result =
            await apiRequest(
                "/api/admin/me"
            );


        if (
            result &&
            result.authenticated === true
        ) {

            showDashboard();

            loadUsers();

            return;

        }


        showLogin();

    } catch (error) {

        showLogin();

    }

}


// =====================================================
// START
// =====================================================

checkAdminSession();
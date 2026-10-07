// =====================================================
// TAP N FOUND - ADMIN DASHBOARD
// =====================================================

// IMPORTANT:
// If your backend is running on localhost:
//     http://localhost:5000
//
// If your backend is deployed online:
//     put your deployed backend URL here.
//
// Example:
// const API_BASE_URL = "https://your-backend.onrender.com";
//
// DO NOT put /api at the end.

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

        const url = getApiUrl(endpoint);

        console.log("API Request:", url);


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

            data = text
                ? JSON.parse(text)
                : {};

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

        console.error(
            "API request error:",
            error
        );


        if (error.name === "AbortError") {

            throw new Error(
                "Server request timed out. Check that the backend server is running."
            );

        }


        if (
            error instanceof TypeError &&
            error.message.toLowerCase().includes("fetch")
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

    if (loginSection) {
        loginSection.hidden = false;
    }

    if (dashboardSection) {
        dashboardSection.hidden = true;
    }

    if (loginError) {
        loginError.textContent = "";
    }

}


// =====================================================
// SHOW DASHBOARD
// =====================================================

function showDashboard() {

    if (loginSection) {
        loginSection.hidden = true;
    }

    if (dashboardSection) {
        dashboardSection.hidden = false;
    }

}


// =====================================================
// LOGIN
// =====================================================

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            if (loginError) {
                loginError.textContent = "";
            }


            const usernameElement =
                document.getElementById("username");

            const passwordElement =
                document.getElementById("password");


            const username =
                usernameElement
                    ? usernameElement.value.trim()
                    : "";


            const password =
                passwordElement
                    ? passwordElement.value
                    : "";


            if (!username || !password) {

                if (loginError) {

                    loginError.textContent =
                        "Please enter username and password.";

                }

                return;

            }


            if (loginButton) {
                loginButton.disabled = true;
            }

            if (loginText) {
                loginText.textContent = "Logging in...";
            }


            try {

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
                    "Admin login response:",
                    result
                );


                showDashboard();


                if (loginForm) {
                    loginForm.reset();
                }


                await loadUsers();


            } catch (error) {

                console.error(
                    "Admin login error:",
                    error
                );


                if (loginError) {

                    loginError.textContent =
                        error.message ||
                        "Login failed.";

                }


            } finally {

                if (loginButton) {
                    loginButton.disabled = false;
                }

                if (loginText) {
                    loginText.textContent = "Login";
                }

            }

        }
    );

}


// =====================================================
// LOAD USERS
// =====================================================

async function loadUsers() {

    if (!usersTableBody) {
        return;
    }


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


        if (totalUsers) {

            totalUsers.textContent =
                stats.total ?? users.length;

        }


        if (registeredUsers) {

            registeredUsers.textContent =
                stats.registered ?? 0;

        }


        if (availableUsers) {

            availableUsers.textContent =
                stats.available ?? 0;

        }


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

if (logoutButton) {

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

}


// =====================================================
// REFRESH
// =====================================================

if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        async function () {

            await loadUsers();

        }
    );

}


// =====================================================
// HTML ESCAPE
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


// =====================================================
// CHECK ADMIN SESSION
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
            "Admin session check error:",
            error
        );


        showLogin();

    }

}


// =====================================================
// START
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        checkAdminSession();

    }
);
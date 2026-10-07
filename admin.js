// =====================================================
// API BASE URL
// =====================================================

// IMPORTANT:
// Replace this with your deployed backend URL.
//
// Example:
// const API_URL = "https://tnf-backend.onrender.com";

const API_URL = "YOUR_BACKEND_URL";


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
// API REQUEST
// =====================================================

async function apiRequest(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 15000);

    try {

        const response = await fetch(
            `${API_URL}${url}`,
            {
                ...options,

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

        if (error.name === "AbortError") {

            throw new Error(
                "Server request timed out. Check that the backend server is running."
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


                // Login successful
                showDashboard();


                if (loginForm) {
                    loginForm.reset();
                }


                // Load NFC registrations
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
// LOAD NFC REGISTRATIONS
// =====================================================

async function loadUsers() {

    if (!usersTableBody) {
        console.error(
            "usersTableBody element was not found."
        );

        return;
    }


    usersTableBody.innerHTML = `
        <tr>
            <td colspan="6" class="loading">
                Loading NFC registrations...
            </td>
        </tr>
    `;


    try {

        // =================================================
        // GET NFC REGISTRATIONS
        // =================================================

        const result =
            await apiRequest(
                "/api/nfc/all"
            );


        console.log(
            "NFC registrations response:",
            result
        );


        // =================================================
        // IMPORTANT
        // /api/nfc/all RETURNS AN ARRAY DIRECTLY
        // =================================================

        const users =
            Array.isArray(result)
                ? result
                : (
                    Array.isArray(result.users)
                        ? result.users
                        : []
                );


        // =================================================
        // CALCULATE STATS
        // =================================================

        const total =
            users.length;


        const registered =
            users.filter(
                user =>
                    String(
                        user.status || ""
                    ).toLowerCase() === "registered"
            ).length;


        const available =
            users.filter(
                user =>
                    String(
                        user.status || ""
                    ).toLowerCase() === "available"
            ).length;


        // =================================================
        // DISPLAY STATS
        // =================================================

        if (totalUsers) {
            totalUsers.textContent = total;
        }

        if (registeredUsers) {
            registeredUsers.textContent = registered;
        }

        if (availableUsers) {
            availableUsers.textContent = available;
        }


        // =================================================
        // NO REGISTRATIONS
        // =================================================

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


        // =================================================
        // DISPLAY NFC REGISTRATIONS
        // =================================================

        usersTableBody.innerHTML =
            users
                .map(
                    user => {

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

                    }
                )
                .join("");


    } catch (error) {

        console.error(
            "Load NFC registrations error:",
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
// CHECK EXISTING ADMIN SESSION
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
// START
// =====================================================

checkAdminSession();


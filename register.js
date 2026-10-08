// =====================================================
// REGISTER OWNER + NFC
// =====================================================

const REGISTER_URL = "/api/nfc/register";
const REQUEST_TIMEOUT_MS = 30000;

const form = document.getElementById("registerForm");

const submitButton = document.getElementById("submitButton");
const submitText = document.getElementById("submitText");
const successMessage = document.getElementById("successMessage");


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

function resetButton() {
    if (submitButton) submitButton.disabled = false;
    if (submitText) submitText.textContent = "Register";
}

function failValidation(message) {
    alert(message);
    resetButton();
}


// =====================================================
// SUBMIT HANDLER
// =====================================================

if (!form) {
    console.error("registerForm element not found.");
} else {

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        // Disable button while registering
        if (submitButton) submitButton.disabled = true;
        if (submitText) submitText.textContent = "Registering...";

        if (successMessage) {
            successMessage.textContent = "";
            successMessage.style.display = "none";
        }

        // =====================================================
        // GET FORM ELEMENTS
        // =====================================================

        const nameElement = document.getElementById("name");
        const emailElement = document.getElementById("email");
        const passwordElement = document.getElementById("password");
        const courseElement = document.getElementById("course");
        const itemElement = document.getElementById("item");

        if (
            !nameElement ||
            !emailElement ||
            !passwordElement ||
            !courseElement ||
            !itemElement
        ) {
            console.error("Registration form elements are missing.");
            failValidation(
                "Registration form error. Please make sure the Gmail, password, name, course and item fields exist."
            );
            return;
        }

        // =====================================================
        // READ VALUES
        // =====================================================

        const name = nameElement.value.trim();
        const email = emailElement.value.trim().toLowerCase();
        const password = passwordElement.value;
        const course = courseElement.value.trim();
        const item = itemElement.value.trim();

        // =====================================================
        // VALIDATION
        // =====================================================

        if (!name || !email || !password || !course || !item) {
            failValidation("Please fill all fields.");
            return;
        }

        if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
            failValidation("Please enter a valid Gmail address.");
            return;
        }

        if (password.length < 6) {
            failValidation("Password must be at least 6 characters.");
            return;
        }

        // =====================================================
        // SEND DATA TO SERVER
        // =====================================================

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {

            const response = await fetch(REGISTER_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                signal: controller.signal,
                body: JSON.stringify({ name, email, password, course, item })
            });

            // Read as text first so an HTML error page (404/502)
            // doesn't crash with "Unexpected token '<'"
            const text = await response.text();
            let data = {};

            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                console.error(
                    `Non-JSON response (HTTP ${response.status}):`,
                    text.slice(0, 200)
                );
                throw new Error(
                    `Server error (HTTP ${response.status}). The registration service is not responding correctly.`
                );
            }

            // =====================================================
            // SERVER ERROR
            // =====================================================

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    data.error ||
                    `Registration failed (HTTP ${response.status}).`
                );
            }

            // =====================================================
            // SUCCESS
            // =====================================================

            console.log("Registration successful:", data);

            const nfcId = data.nfcId || "-";

            if (successMessage) {
                successMessage.style.display = "block";
                successMessage.innerHTML =
                    "Registration successful!<br>" +
                    "Your NFC ID is: <strong>" +
                    escapeHtml(nfcId) +
                    "</strong>";
            }

            alert(
                "Registration successful!\n\n" +
                "NFC ID: " +
                nfcId
            );

            // =====================================================
            // REDIRECT TO LOGIN
            // =====================================================

            setTimeout(function () {
                window.location.href = "/login.html";
            }, 2000);

        } catch (error) {

            console.error("REGISTRATION ERROR:", error);

            let message = error.message || "Unable to register. Please try again.";

            if (error.name === "AbortError") {
                message = "Server request timed out. Please try again.";
            } else if (error instanceof TypeError) {
                message = "Cannot reach the server. Check your internet connection and try again.";
            }

            alert(message);

        } finally {

            clearTimeout(timeout);
            resetButton();
        }
    });
}
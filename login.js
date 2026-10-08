// =====================================================
// OWNER LOGIN
// =====================================================

const form = document.getElementById("loginForm");

const loginButton = document.getElementById("loginButton");
const loginText = document.getElementById("loginText");

form.addEventListener("submit", async function (event) {

    event.preventDefault();

    // Disable button
    loginButton.disabled = true;

    if (loginText) {
        loginText.textContent = "Logging in...";
    }

    // =====================================================
    // GET FORM ELEMENTS
    // =====================================================

    const emailElement = document.getElementById("email");
    const passwordElement = document.getElementById("password");

    // Check elements
    if (!emailElement || !passwordElement) {

        console.error(
            "Login form elements are missing."
        );

        alert(
            "Login form error. Please make sure the Gmail and password fields exist."
        );

        loginButton.disabled = false;

        if (loginText) {
            loginText.textContent = "Login";
        }

        return;
    }

    // =====================================================
    // GET VALUES
    // =====================================================

    const email =
        emailElement.value
            .trim()
            .toLowerCase();

    const password =
        passwordElement.value;

    // =====================================================
    // VALIDATION
    // =====================================================

    if (!email || !password) {

        alert(
            "Please enter your Gmail address and password."
        );

        loginButton.disabled = false;

        if (loginText) {
            loginText.textContent = "Login";
        }

        return;
    }

    // =====================================================
    // GMAIL VALIDATION
    // =====================================================

    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {

        alert(
            "Please enter a valid Gmail address."
        );

        loginButton.disabled = false;

        if (loginText) {
            loginText.textContent = "Login";
        }

        return;
    }

    // =====================================================
    // SEND LOGIN REQUEST
    // =====================================================

    try {

        const response = await fetch(
            "/api/owner/login",
            {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                credentials: "include",

                body: JSON.stringify({

                    email: email,

                    password: password

                })

            }
        );

        const data =
            await response.json();

        // =====================================================
        // LOGIN ERROR
        // =====================================================

        if (!response.ok) {

            throw new Error(
                data.message ||
                "Login failed."
            );
        }

        // =====================================================
        // LOGIN SUCCESS
        // =====================================================

        console.log(
            "Login successful:",
            data
        );

        alert(
            "Login successful!"
        );

        // =====================================================
        // GO TO OWNER DASHBOARD
        // =====================================================

        window.location.href =
            "/owner.html";

    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        alert(
            error.message ||
            "Unable to login. Please try again."
        );

    } finally {

        loginButton.disabled = false;

        if (loginText) {
            loginText.textContent = "Login";
        }

    }

});
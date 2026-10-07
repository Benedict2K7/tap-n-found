// =====================================================
// REGISTER OWNER + NFC
// =====================================================

const form = document.getElementById("registerForm");

const submitButton = document.getElementById("submitButton");
const submitText = document.getElementById("submitText");
const successMessage = document.getElementById("successMessage");

form.addEventListener("submit", async function (event) {

    event.preventDefault();

    // Disable button while registering
    submitButton.disabled = true;

    if (submitText) {
        submitText.textContent = "Registering...";
    }

    if (successMessage) {
        successMessage.textContent = "";
        successMessage.style.display = "none";
    }

    // =====================================================
    // GET FORM VALUES
    // =====================================================

    const nameElement = document.getElementById("name");
    const emailElement = document.getElementById("email");
    const passwordElement = document.getElementById("password");
    const courseElement = document.getElementById("course");
    const itemElement = document.getElementById("item");

    // Check that all required elements exist
    if (
        !nameElement ||
        !emailElement ||
        !passwordElement ||
        !courseElement ||
        !itemElement
    ) {
        console.error("Registration form elements are missing.");

        alert(
            "Registration form error. Please make sure the Gmail, password, name, course and item fields exist."
        );

        submitButton.disabled = false;

        if (submitText) {
            submitText.textContent = "Register";
        }

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
    // BASIC VALIDATION
    // =====================================================

    if (!name || !email || !password || !course || !item) {

        alert("Please fill all fields.");

        submitButton.disabled = false;

        if (submitText) {
            submitText.textContent = "Register";
        }

        return;
    }

    // =====================================================
    // GMAIL VALIDATION
    // =====================================================

    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {

        alert("Please enter a valid Gmail address.");

        submitButton.disabled = false;

        if (submitText) {
            submitText.textContent = "Register";
        }

        return;
    }

    // =====================================================
    // PASSWORD VALIDATION
    // =====================================================

    if (password.length < 6) {

        alert("Password must be at least 6 characters.");

        submitButton.disabled = false;

        if (submitText) {
            submitText.textContent = "Register";
        }

        return;
    }

    // =====================================================
    // SEND DATA TO SERVER
    // =====================================================

    try {

        const response = await fetch("/api/nfc/register", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            credentials: "include",

            body: JSON.stringify({

                name: name,

                email: email,

                password: password,

                course: course,

                item: item

            })

        });

        const data = await response.json();

        // =====================================================
        // SERVER ERROR
        // =====================================================

        if (!response.ok) {

            throw new Error(
                data.message ||
                "Registration failed."
            );
        }

        // =====================================================
        // SUCCESS
        // =====================================================

        console.log(
            "Registration successful:",
            data
        );

        if (successMessage) {

            successMessage.style.display = "block";

            successMessage.innerHTML =
                "Registration successful!<br>" +
                "Your NFC ID is: <strong>" +
                data.nfcId +
                "</strong>";
        }

        // Show NFC ID
        alert(
            "Registration successful!\n\n" +
            "NFC ID: " +
            data.nfcId
        );

        // =====================================================
        // REDIRECT TO LOGIN
        // =====================================================

        setTimeout(function () {

            window.location.href = "/login.html";

        }, 2000);

    } catch (error) {

        console.error(
            "REGISTRATION ERROR:",
            error
        );

        alert(
            error.message ||
            "Unable to register. Please try again."
        );

    } finally {

        submitButton.disabled = false;

        if (submitText) {
            submitText.textContent = "Register";
        }
    }

});
const form = document.getElementById("registerForm");

const submitButton = document.getElementById("submitButton");
const submitText = document.getElementById("submitText");
const successMessage = document.getElementById("successMessage");

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const course = document.getElementById("course").value.trim();
    const item = document.getElementById("item").value.trim();

    if (!name || !course || !item) {
        alert("Please fill all fields.");
        return;
    }

    submitButton.disabled = true;
    submitText.textContent = "Registering...";

    try {
        const response = await fetch("/api/nfc/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                course,
                item
            })
        });

        // Read the response as text first.
        // This helps us see HTML/Netlify errors instead of hiding them.
        const rawResponse = await response.text();

        console.log("HTTP status:", response.status);
        console.log("Raw server response:", rawResponse);

        let result;

        try {
            result = JSON.parse(rawResponse);
        } catch {
            throw new Error(
                `Server returned non-JSON response (HTTP ${response.status}): ${rawResponse.substring(0, 300)}`
            );
        }

        if (!response.ok) {
            throw new Error(
                result.message ||
                `Server error: HTTP ${response.status}`
            );
        }

        console.log("NFC ID:", result.nfcId);

        form.reset();

        successMessage.classList.add("show");

        setTimeout(() => {
            successMessage.classList.remove("show");
        }, 5000);

    } catch (error) {
        console.error("TNF API ERROR:", error);

        alert(
            "TNF Server Error:\n\n" +
            error.message
        );

    } finally {
        submitButton.disabled = false;
        submitText.textContent = "Register NFC";
    }
});
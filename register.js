const form = document.getElementById("registerForm");

const submitButton =
    document.getElementById("submitButton");

const submitText =
    document.getElementById("submitText");

const successMessage =
    document.getElementById("successMessage");


form.addEventListener("submit", async function (event) {

    event.preventDefault();

    const name =
        document.getElementById("name").value.trim();

    const course =
        document.getElementById("course").value.trim();

    const item =
        document.getElementById("item").value.trim();


    // =====================================
    // VALIDATION
    // =====================================

    if (!name || !course || !item) {

        alert("Please fill all fields.");

        return;
    }


    // =====================================
    // BUTTON LOADING
    // =====================================

    submitButton.disabled = true;

    submitText.textContent =
        "Registering...";


    try {

        // =====================================
        // SEND DATA TO SERVER
        // =====================================

        const response = await fetch(
            "/api/nfc/register",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    name: name,
                    course: course,
                    item: item

                })
            }
        );


        const result =
            await response.json();


        console.log(
            "Server response:",
            result
        );


        // =====================================
        // SUCCESS
        // =====================================

        if (response.ok) {

            form.reset();

            successMessage.classList.add(
                "show"
            );

            console.log(
                "NFC ID:",
                result.nfcId
            );


            // Hide message after 5 seconds

            setTimeout(() => {

                successMessage.classList.remove(
                    "show"
                );

            }, 5000);


        }

        // =====================================
        // SERVER ERROR
        // =====================================

        else {

            alert(
                result.message ||
                "Registration failed."
            );

        }


    } catch (error) {

        console.error(
            "Connection error:",
            error
        );

        alert(
            "Unable to connect to the server."
        );

    }


    // =====================================
    // RESET BUTTON
    // =====================================

    submitButton.disabled = false;

    submitText.textContent =
        "Register NFC";

});
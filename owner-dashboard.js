// =====================================================
// ELEMENTS
// =====================================================

const ownerName =
    document.getElementById("ownerName");

const profileName =
    document.getElementById("profileName");

const profilePhone =
    document.getElementById("profilePhone");

const profileCourse =
    document.getElementById("profileCourse");

const itemsContainer =
    document.getElementById("itemsContainer");

const logoutButton =
    document.getElementById("logoutButton");


// =====================================================
// LOAD OWNER DASHBOARD
// =====================================================

async function loadOwnerDashboard() {

    try {

        const response =
            await fetch(
                "/api/owner/me",
                {
                    method: "GET",

                    credentials:
                        "include"
                }
            );


        const rawResponse =
            await response.text();


        console.log(
            "Owner dashboard response:",
            rawResponse
        );


        let result;

        try {

            result =
                JSON.parse(
                    rawResponse
                );

        } catch {

            throw new Error(
                "Server returned an invalid response."
            );

        }


        // =================================================
        // NOT LOGGED IN
        // =================================================

        if (
            response.status === 401
        ) {

            window.location.href =
                "login.html";

            return;

        }


        if (!response.ok) {

            throw new Error(

                result.message ||
                "Unable to load owner dashboard."

            );

        }


        // =================================================
        // OWNER INFORMATION
        // =================================================

        const owner =
            result.owner;


        ownerName.textContent =
            owner.name || "Owner";


        profileName.textContent =
            owner.name || "-";


        profilePhone.textContent =
            owner.phone || "-";


        profileCourse.textContent =
            owner.course || "-";


        // =================================================
        // NFC ITEMS
        // =================================================

        const nfcs =
            Array.isArray(result.nfcs)
                ? result.nfcs
                : [];


        renderItems(nfcs);


    } catch (error) {

        console.error(
            "OWNER DASHBOARD ERROR:",
            error
        );


        itemsContainer.innerHTML = `

            <div class="error-message">

                ${escapeHtml(
                    error.message ||
                    "Unable to load dashboard."
                )}

            </div>

        `;

    }

}


// =====================================================
// RENDER NFC ITEMS
// =====================================================

function renderItems(
    nfcs
) {

    if (
        nfcs.length === 0
    ) {

        itemsContainer.innerHTML = `

            <div class="empty-message">

                <h3>
                    No NFC items found
                </h3>

                <p>
                    You don't have any registered NFC
                    items yet.
                </p>

            </div>

        `;

        return;

    }


    itemsContainer.innerHTML =
        nfcs
            .map(
                nfc => {

                    const nfcId =
                        String(
                            nfc.nfcId ||
                            ""
                        );


                    const ownerToken =
                        String(
                            nfc.ownerToken ||
                            ""
                        );


                    const ownerChatUrl =
                        "owner.html?" +
                        "nfcId=" +
                        encodeURIComponent(
                            nfcId
                        ) +
                        "&token=" +
                        encodeURIComponent(
                            ownerToken
                        );


                    const status =
                        nfc.status ||
                        "registered";


                    return `

                        <article
                            class="item-card"
                        >

                            <div
                                class="item-top"
                            >

                                <div
                                    class="item-icon"
                                >
                                    ◉
                                </div>

                                <span
                                    class="status"
                                >
                                    ${escapeHtml(
                                        status
                                    )}
                                </span>

                            </div>


                            <h3>
                                ${escapeHtml(
                                    nfc.item ||
                                    "Registered Item"
                                )}
                            </h3>


                            <p
                                class="item-course"
                            >
                                ${escapeHtml(
                                    nfc.course ||
                                    ""
                                )}
                            </p>


                            <div
                                class="nfc-id-box"
                            >

                                <span
                                    class="nfc-label"
                                >
                                    NFC ID
                                </span>

                                <span
                                    class="nfc-id"
                                >
                                    ${escapeHtml(
                                        nfcId
                                    )}
                                </span>

                            </div>


                            <a
                                href="${ownerChatUrl}"
                                class="chat-button"
                            >

                                <span>
                                    💬
                                </span>

                                Open Owner Chat

                            </a>

                        </article>

                    `;

                }
            )
            .join("");

}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(
            value ?? ""
        );

    return div.innerHTML;

}


// =====================================================
// LOGOUT
// =====================================================

logoutButton.addEventListener(
    "click",
    async function () {

        try {

            const response =
                await fetch(
                    "/api/owner/logout",
                    {
                        method: "POST",

                        credentials:
                            "include"
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Logout failed."
                );

            }


            window.location.href =
                "index.html";


        } catch (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );


            alert(
                "Unable to logout."
            );

        }

    }
);


// =====================================================
// START
// =====================================================

loadOwnerDashboard();
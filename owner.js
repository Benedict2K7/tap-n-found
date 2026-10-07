// =====================================================
// OWNER DASHBOARD
// Gmail Session Based
// =====================================================


// =====================================================
// URL PARAMETERS
// =====================================================

const params =
    new URLSearchParams(
        window.location.search
    );

// NFC ID is optional now.
// The server can automatically find it
// from the logged-in Gmail owner.
let nfcId =
    params.get("nfcId");


// =====================================================
// HTML ELEMENTS
// =====================================================

const itemInfo =
    document.getElementById(
        "itemInfo"
    );

const chatList =
    document.getElementById(
        "chatList"
    );

const loadingMessage =
    document.getElementById(
        "loadingMessage"
    );

const emptyMessage =
    document.getElementById(
        "emptyMessage"
    );

const errorMessage =
    document.getElementById(
        "errorMessage"
    );

const refreshButton =
    document.getElementById(
        "refreshButton"
    );


// =====================================================
// SHOW ERROR
// =====================================================

function showError(message) {

    if (!errorMessage) {
        console.error(message);
        return;
    }

    errorMessage.textContent =
        message;

    errorMessage.style.display =
        "block";
}


// =====================================================
// CLEAR ERROR
// =====================================================

function clearError() {

    if (!errorMessage) {
        return;
    }

    errorMessage.textContent =
        "";

    errorMessage.style.display =
        "none";
}


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(dateString) {

    const date =
        new Date(dateString);

    return date.toLocaleString(
        [],
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}


// =====================================================
// FIND OWNER'S NFC AUTOMATICALLY
// =====================================================

async function findOwnerNFC() {

    // -------------------------------------------------
    // If NFC ID already exists in the URL,
    // use it.
    // -------------------------------------------------

    if (nfcId) {

        console.log(
            "NFC ID from URL:",
            nfcId
        );

        return true;
    }


    // -------------------------------------------------
    // Otherwise ask the server.
    // The server identifies the owner using
    // the logged-in Gmail session.
    // -------------------------------------------------

    try {

        const response =
            await fetch(
                "/api/owner/nfc",
                {
                    method: "GET",

                    credentials:
                        "include"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to find your NFC."
            );

        }


        // -------------------------------------------------
        // Get NFC ID from server
        // -------------------------------------------------

        if (
            !data.nfc ||
            !data.nfc.nfcId
        ) {

            throw new Error(
                "No NFC is registered for this Gmail account."
            );

        }


        nfcId =
            data.nfc.nfcId;


        console.log(
            "Automatically found owner's NFC:",
            nfcId
        );


        // -------------------------------------------------
        // Show item information
        // -------------------------------------------------

        if (
            itemInfo &&
            data.nfc
        ) {

            itemInfo.textContent =
                `${data.nfc.item} • ${data.nfc.course}`;

        }


        return true;


    } catch (error) {

        console.error(
            "Find owner NFC error:",
            error
        );

        showError(
            error.message
        );

        return false;
    }
}


// =====================================================
// LOAD OWNER CHATS
// =====================================================

async function loadOwnerChats() {

    clearError();


    // -------------------------------------------------
    // Loading state
    // -------------------------------------------------

    if (loadingMessage) {

        loadingMessage.style.display =
            "block";

    }


    if (emptyMessage) {

        emptyMessage.classList.add(
            "hidden"
        );

    }


    if (chatList) {

        chatList.innerHTML =
            "";

    }


    // -------------------------------------------------
    // Automatically find owner's NFC
    // -------------------------------------------------

    const ownerNfcFound =
        await findOwnerNFC();


    if (!ownerNfcFound) {

        if (loadingMessage) {

            loadingMessage.style.display =
                "none";

        }

        return;
    }


    // -------------------------------------------------
    // NFC ID is now available
    // -------------------------------------------------

    if (!nfcId) {

        if (loadingMessage) {

            loadingMessage.style.display =
                "none";

        }

        showError(
            "Unable to determine your NFC ID."
        );

        return;
    }


    try {

        // -------------------------------------------------
        // Get owner's chats
        // -------------------------------------------------
        //
        // IMPORTANT:
        // The server now checks the logged-in Gmail
        // session automatically.
        //
        // No owner token is needed.
        // -------------------------------------------------

        const response =
            await fetch(
                `/api/owner/${encodeURIComponent(
                    nfcId
                )}/chats`,
                {
                    method: "GET",

                    credentials:
                        "include"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load owner chats."
            );

        }


        // -------------------------------------------------
        // Show item information
        // -------------------------------------------------

        if (
            itemInfo &&
            data.nfc
        ) {

            itemInfo.textContent =
                `${data.nfc.item} • ${data.nfc.course}`;

        }


        // -------------------------------------------------
        // Get chats
        // -------------------------------------------------

        const chats =
            Array.isArray(data)
                ? data
                : (
                    data.chats || []
                );


        if (loadingMessage) {

            loadingMessage.style.display =
                "none";

        }


        // -------------------------------------------------
        // No chats
        // -------------------------------------------------

        if (
            chats.length === 0
        ) {

            if (emptyMessage) {

                emptyMessage.classList.remove(
                    "hidden"
                );

            }

            return;
        }


        // -------------------------------------------------
        // Display chats
        // -------------------------------------------------

        chats.forEach(
            createChatCard
        );


    } catch (error) {

        console.error(
            "Owner chats error:",
            error
        );


        if (loadingMessage) {

            loadingMessage.style.display =
                "none";

        }


        showError(
            error.message
        );

    }

}


// =====================================================
// CREATE CHAT CARD
// =====================================================

function createChatCard(chat) {

    const card =
        document.createElement(
            "div"
        );


    card.className =
        "chat-card";


    const expired =
        chat.status ===
        "expired";


    card.innerHTML = `
        <div class="chat-left">

            <div class="chat-icon">
                ${expired ? "⌛" : "💬"}
            </div>

            <div class="chat-info">

                <h3>
                    ${expired
                        ? "Expired Chat"
                        : "New Finder Chat"}
                </h3>

                <p>
                    Started:
                    ${formatDate(
                        chat.createdAt
                    )}
                </p>

                <p>
                    ${expired
                        ? "Chat expired"
                        : "Chat available"}
                </p>

            </div>

        </div>

        <div class="chat-arrow">
            →
        </div>
    `;


    // -------------------------------------------------
    // Only active chats can be opened
    // -------------------------------------------------

    if (!expired) {

        card.addEventListener(
            "click",
            () => {

                openChat(
                    chat.chatId
                );

            }
        );

    }


    if (chatList) {

        chatList.appendChild(
            card
        );

    }

}


// =====================================================
// OPEN OWNER CHAT
// =====================================================

function openChat(chatId) {

    if (!nfcId) {

        showError(
            "Unable to open chat because NFC ID is missing."
        );

        return;
    }


    if (!chatId) {

        showError(
            "Chat ID is missing."
        );

        return;
    }


    // -------------------------------------------------
    // IMPORTANT
    //
    // No owner token is placed in the URL.
    //
    // The server identifies the owner using
    // the Gmail login session.
    // -------------------------------------------------

    const url =
        `/chat.html?nfcId=${encodeURIComponent(
            nfcId
        )}&chatId=${encodeURIComponent(
            chatId
        )}&role=owner`;


    console.log(
        "Opening owner chat:",
        url
    );


    window.location.href =
        url;

}


// =====================================================
// REFRESH BUTTON
// =====================================================

if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        loadOwnerChats
    );

}


// =====================================================
// AUTO REFRESH
// =====================================================

setInterval(
    loadOwnerChats,
    5000
);


// =====================================================
// START OWNER DASHBOARD
// =====================================================

loadOwnerChats();


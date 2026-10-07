// =====================================================
// GET URL PARAMETERS
// =====================================================

const params = new URLSearchParams(window.location.search);

const nfcId = params.get("nfcId");

let chatId = params.get("chatId");
let role = params.get("role");
let token = params.get("token");


// =====================================================
// CLEAN INVALID VALUES
// =====================================================

if (
    !chatId ||
    chatId === "undefined" ||
    chatId === "null"
) {
    chatId = null;
}

if (
    !token ||
    token === "undefined" ||
    token === "null"
) {
    token = null;
}

if (
    !role ||
    role === "undefined" ||
    role === "null"
) {
    role = null;
}


// =====================================================
// VARIABLES
// =====================================================

let expiresAt = null;
let pollInterval = null;
let timerInterval = null;


// =====================================================
// DOM
// =====================================================

const messagesContainer =
    document.getElementById("chatMessages");

const messageForm =
    document.getElementById("messageForm");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const chatError =
    document.getElementById("chatError");

const timer =
    document.getElementById("timer");

const itemInfo =
    document.getElementById("itemInfo");


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}


// =====================================================
// SHOW ERROR
// =====================================================

function showError(message) {

    if (chatError) {
        chatError.textContent = message;
    }
}


// =====================================================
// SYSTEM MESSAGE
// =====================================================

function addSystemMessage(message) {

    if (!messagesContainer) {
        return;
    }

    const div = document.createElement("div");

    div.className = "system-message";

    div.textContent = message;

    messagesContainer.appendChild(div);
}


// =====================================================
// DISABLE CHAT
// =====================================================

function disableChat() {

    if (messageInput) {
        messageInput.disabled = true;
    }

    if (sendButton) {
        sendButton.disabled = true;
    }
}


// =====================================================
// ENABLE CHAT
// =====================================================

function enableChat() {

    if (messageInput) {
        messageInput.disabled = false;
    }

    if (sendButton) {
        sendButton.disabled = false;
    }
}


// =====================================================
// UPDATE URL
// =====================================================

function updateChatUrl() {

    if (!nfcId || !chatId) {
        return;
    }

    let url =
        `/chat.html?nfcId=${encodeURIComponent(nfcId)}` +
        `&chatId=${encodeURIComponent(chatId)}` +
        `&role=${encodeURIComponent(role)}`;

    if (role === "finder" && token) {

        url +=
            `&token=${encodeURIComponent(token)}`;
    }

    window.history.replaceState(
        {},
        "",
        url
    );
}


// =====================================================
// START FINDER CHAT
// =====================================================

async function startFinderChat() {

    try {

        if (!nfcId) {

            throw new Error(
                "NFC ID is missing."
            );
        }


        if (itemInfo) {

            itemInfo.textContent =
                "Starting private chat...";
        }


        const response =
            await fetch(
                "/api/chat/start",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    credentials: "include",

                    body: JSON.stringify({
                        nfcId: nfcId
                    })
                }
            );


        const data =
            await response.json();


        console.log(
            "CHAT START RESPONSE:",
            data
        );


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to start chat."
            );
        }


        // =================================================
        // SERVER DETECTED OWNER
        // =================================================

        if (data.role === "owner") {

            window.location.href =
                `/owner.html?nfcId=${encodeURIComponent(
                    nfcId
                )}`;

            return;
        }


        // =================================================
        // FINDER
        // =================================================

        if (!data.chatId) {

            throw new Error(
                "Chat ID was not created."
            );
        }


        if (!data.finderToken) {

            throw new Error(
                "Finder chat token was not created."
            );
        }


        chatId =
            data.chatId;

        role =
            "finder";

        token =
            data.finderToken;

        expiresAt =
            data.expiresAt || null;


        // =================================================
        // SAVE SESSION
        // =================================================

        sessionStorage.setItem(
            "tnf_chat_id",
            chatId
        );

        sessionStorage.setItem(
            "tnf_chat_token",
            token
        );

        sessionStorage.setItem(
            "tnf_chat_role",
            "finder"
        );

        if (expiresAt) {

            sessionStorage.setItem(
                "tnf_chat_expires",
                expiresAt
            );
        }


        // =================================================
        // UPDATE URL
        // =================================================

        updateChatUrl();


        // =================================================
        // SHOW ITEM
        // =================================================

        if (data.nfc) {

            if (itemInfo) {

                itemInfo.textContent =
                    `${data.nfc.item || "Item"} • Private chat`;
            }

        } else {

            if (itemInfo) {

                itemInfo.textContent =
                    "Private chat with owner";
            }
        }


        // =================================================
        // ENABLE CHAT
        // =================================================

        enableChat();


        // =================================================
        // LOAD CHAT
        // =================================================

        addSystemMessage(
            "Private chat started. You can now message the owner."
        );


        await loadMessages();


        startChatTimer();


        clearInterval(
            pollInterval
        );

        pollInterval =
            setInterval(
                loadMessages,
                3000
            );


    } catch (error) {

        console.error(
            "Start finder chat error:",
            error
        );

        showError(
            error.message ||
            "Unable to start private chat."
        );

        disableChat();
    }
}


// =====================================================
// LOAD EXISTING SESSION
// =====================================================

function loadSavedSession() {

    if (!chatId || !role) {
        return false;
    }


    // =================================================
    // FINDER
    // =================================================

    if (role === "finder") {

        const savedChatId =
            sessionStorage.getItem(
                "tnf_chat_id"
            );

        const savedToken =
            sessionStorage.getItem(
                "tnf_chat_token"
            );

        const savedRole =
            sessionStorage.getItem(
                "tnf_chat_role"
            );

        const savedExpires =
            sessionStorage.getItem(
                "tnf_chat_expires"
            );


        // If URL token is missing,
        // use saved token.

        if (
            !token &&
            savedChatId === chatId &&
            savedToken
        ) {

            token =
                savedToken;

            role =
                savedRole || "finder";

            expiresAt =
                savedExpires;
        }


        if (!token) {
            return false;
        }


        sessionStorage.setItem(
            "tnf_chat_id",
            chatId
        );

        sessionStorage.setItem(
            "tnf_chat_token",
            token
        );

        sessionStorage.setItem(
            "tnf_chat_role",
            "finder"
        );


        if (expiresAt) {

            sessionStorage.setItem(
                "tnf_chat_expires",
                expiresAt
            );
        }
    }


    // =================================================
    // START CHAT
    // =================================================

    enableChat();

    loadMessages();

    clearInterval(
        pollInterval
    );

    pollInterval =
        setInterval(
            loadMessages,
            3000
        );

    startChatTimer();

    return true;
}


// =====================================================
// LOAD MESSAGES
// =====================================================

async function loadMessages() {

    if (!chatId || !role) {
        return;
    }


    // Finder needs token.
    if (
        role === "finder" &&
        !token
    ) {
        return;
    }


    try {

        const headers = {

            "x-chat-role":
                role
        };


        if (role === "finder") {

            headers["x-chat-token"] =
                token;
        }


        const response =
            await fetch(
                `/api/chat/${encodeURIComponent(
                    chatId
                )}/messages`,
                {
                    method: "GET",

                    credentials: "include",

                    headers: headers
                }
            );


        const data =
            await response.json();


        console.log(
            "LOAD MESSAGES:",
            data
        );


        if (response.status === 410) {

            chatExpired();

            return;
        }


        if (!response.ok) {

            throw new Error(
                data.message ||
                "Unable to load chat."
            );
        }


        // =================================================
        // EXPIRY
        // =================================================

        if (data.expiresAt) {

            expiresAt =
                data.expiresAt;

            sessionStorage.setItem(
                "tnf_chat_expires",
                data.expiresAt
            );

            startChatTimer();
        }


        // =================================================
        // NFC INFO
        // =================================================

        if (
            data.nfc &&
            itemInfo
        ) {

            itemInfo.textContent =
                `${data.nfc.item || "Item"} • Private chat`;
        }


        // =================================================
        // MESSAGES
        // =================================================

        renderMessages(
            data.messages || []
        );


        enableChat();


    } catch (error) {

        console.error(
            "Load messages error:",
            error
        );

        showError(
            error.message
        );
    }
}


// =====================================================
// RENDER MESSAGES
// =====================================================

function renderMessages(messages) {

    messagesContainer.innerHTML = "";


    if (messages.length === 0) {

        addSystemMessage(
            "No messages yet. Send a message to the owner."
        );

        return;
    }


    messages.forEach(
        message => {

            const wrapper =
                document.createElement("div");


            const isMine =
                message.sender === role;


            wrapper.className =
                isMine
                    ? "message mine"
                    : "message theirs";


            const safeMessage =
                escapeHtml(
                    message.message
                );


            const time =
                new Date(
                    message.sentAt
                ).toLocaleTimeString(
                    [],
                    {
                        hour: "2-digit",
                        minute: "2-digit"
                    }
                );


            wrapper.innerHTML = `
                <div class="message-bubble">

                    <div class="message-text">
                        ${safeMessage}
                    </div>

                    <div class="message-time">
                        ${time}
                    </div>

                </div>
            `;


            messagesContainer.appendChild(
                wrapper
            );
        }
    );


    messagesContainer.scrollTop =
        messagesContainer.scrollHeight;
}


// =====================================================
// SEND MESSAGE
// =====================================================

messageForm.addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();


        const message =
            messageInput.value.trim();


        if (!message) {
            return;
        }


        if (!chatId || !role) {

            showError(
                "Chat is not ready."
            );

            return;
        }


        if (
            role === "finder" &&
            !token
        ) {

            showError(
                "Finder chat token is missing."
            );

            return;
        }


        sendButton.disabled =
            true;


        try {

            const headers = {

                "Content-Type":
                    "application/json",

                "x-chat-role":
                    role
            };


            if (role === "finder") {

                headers["x-chat-token"] =
                    token;
            }


            const response =
                await fetch(
                    `/api/chat/${encodeURIComponent(
                        chatId
                    )}/messages`,
                    {
                        method: "POST",

                        credentials: "include",

                        headers: headers,

                        body:
                            JSON.stringify({
                                message:
                                    message
                            })
                    }
                );


            const data =
                await response.json();


            if (response.status === 410) {

                chatExpired();

                return;
            }


            if (!response.ok) {

                throw new Error(
                    data.message ||
                    "Message could not be sent."
                );
            }


            messageInput.value = "";


            await loadMessages();


        } catch (error) {

            console.error(
                "Send message error:",
                error
            );

            showError(
                error.message
            );


        } finally {

            sendButton.disabled =
                false;

            messageInput.focus();
        }

    }
);


// =====================================================
// TIMER
// =====================================================

function startChatTimer() {

    if (!expiresAt || !timer) {
        return;
    }


    clearInterval(
        timerInterval
    );


    function updateTimer() {

        const remaining =
            new Date(
                expiresAt
            ).getTime() -
            Date.now();


        if (remaining <= 0) {

            timer.textContent =
                "Expired";

            chatExpired();

            return;
        }


        const totalSeconds =
            Math.floor(
                remaining / 1000
            );


        const minutes =
            Math.floor(
                totalSeconds / 60
            );


        const seconds =
            totalSeconds % 60;


        timer.textContent =
            `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }


    updateTimer();


    timerInterval =
        setInterval(
            updateTimer,
            1000
        );
}


// =====================================================
// CHAT EXPIRED
// =====================================================

function chatExpired() {

    clearInterval(
        pollInterval
    );

    clearInterval(
        timerInterval
    );


    disableChat();


    addSystemMessage(
        "This private chat has expired."
    );
}


// =====================================================
// INITIALIZE
// =====================================================

async function initializeChat() {

    // =================================================
    // EXISTING FINDER CHAT
    // =================================================

    if (
        chatId &&
        role === "finder"
    ) {

        const saved =
            loadSavedSession();


        if (saved) {
            return;
        }


        // If URL already has a finder token,
        // use it.

        if (token) {

            sessionStorage.setItem(
                "tnf_chat_id",
                chatId
            );

            sessionStorage.setItem(
                "tnf_chat_token",
                token
            );

            sessionStorage.setItem(
                "tnf_chat_role",
                "finder"
            );


            enableChat();

            await loadMessages();

            startChatTimer();

            clearInterval(
                pollInterval
            );

            pollInterval =
                setInterval(
                    loadMessages,
                    3000
                );

            return;
        }
    }


    // =================================================
    // OWNER CHAT
    // =================================================

    if (
        chatId &&
        role === "owner"
    ) {

        enableChat();

        await loadMessages();

        startChatTimer();

        clearInterval(
            pollInterval
        );

        pollInterval =
            setInterval(
                loadMessages,
                3000
            );

        return;
    }


    // =================================================
    // NEW FINDER
    // =================================================

    if (
        nfcId &&
        role !== "owner"
    ) {

        await startFinderChat();

        return;
    }


    // =================================================
    // NOTHING
    // =================================================

    showError(
        "No chat information was provided."
    );

    disableChat();
}


// =====================================================
// START
// =====================================================

initializeChat();
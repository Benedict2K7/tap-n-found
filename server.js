require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();

// Behind Netlify / proxies: lets req.protocol and req.secure be correct
app.set("trust proxy", 1);


// =====================================================
// NETLIFY PATH FIX
// Netlify can pass the path as /.netlify/functions/api/...
// Map it back to /api/... so the routes below match.
// =====================================================

app.use((req, res, next) => {
    const prefix = "/.netlify/functions/api";

    if (req.url.startsWith(prefix)) {
        req.url = "/api" + req.url.slice(prefix.length);
    }

    next();
});


// =====================================================
// MIDDLEWARE
// =====================================================

const ALLOWED_ORIGINS = [
    "https://tap-n-found.netlify.app",
    "https://tap-n-found.onrender.com",
    "http://localhost:5000",
    "http://localhost:8888"
];
app.use(
    cors({
        origin: (origin, callback) => {

            // Allow requests without an Origin header
            if (!origin) {
                return callback(null, true);
            }

            // Allow approved frontend origins
            if (ALLOWED_ORIGINS.includes(origin)) {
                return callback(null, true);
            }

            // Reject unknown origins
            return callback(new Error("CORS: Origin not allowed"));
        },

        credentials: true,

        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Chat-Role",
            "X-Chat-Token"
        ]
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files locally
app.use(express.static(__dirname));

// =====================================================
// SCHEMAS
// =====================================================

const ownerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
        lowercase: true
    },
    passwordHash: { type: String, required: true },
    course: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

const nfcSchema = new mongoose.Schema({
    nfcId: { type: String, required: true, unique: true, index: true },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Owner",
        required: true,
        index: true
    },
    name: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    item: { type: String, required: true, trim: true },
    status: { type: String, default: "registered" },

    // Internal compatibility token. NOT stored inside the NFC tag.
    ownerToken: { type: String, unique: true, sparse: true },

    createdAt: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
    chatId: { type: String, required: true, unique: true, index: true },
    nfcId: { type: String, required: true, index: true },
    finderToken: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, default: "active" }
});

const messageSchema = new mongoose.Schema({
    chatId: { type: String, required: true, index: true },
    sender: { type: String, enum: ["finder", "owner"], required: true },
    message: { type: String, required: true, maxlength: 500, trim: true },
    sentAt: { type: Date, default: Date.now }
});

const Owner = mongoose.models.Owner || mongoose.model("Owner", ownerSchema);
const NFC = mongoose.models.NFC || mongoose.model("NFC", nfcSchema);
const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);
const Message =
    mongoose.models.Message || mongoose.model("Message", messageSchema);


// =====================================================
// MONGODB CONNECTION (cached, safe for serverless)
// =====================================================

let mongoPromise = null;

function connectMongoDB() {
    if (mongoose.connection.readyState === 1) {
        return Promise.resolve(true);
    }

    if (mongoPromise) {
        return mongoPromise;
    }

    mongoPromise = (async () => {
        try {
            if (!process.env.MONGODB_URI) {
                throw new Error("MONGODB_URI is missing");
            }

            await mongoose.connect(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 10000,
                maxIdleTimeMS: 60000
            });

            console.log("MongoDB connected:", mongoose.connection.name);

            // Remove old phone indexes if they still exist
            try {
                const indexes = await Owner.collection.indexes();

                for (const index of indexes) {
                    if (
                        index.name !== "_id_" &&
                        index.key &&
                        Object.prototype.hasOwnProperty.call(index.key, "phone")
                    ) {
                        await Owner.collection.dropIndex(index.name);
                        console.log("Removed old phone index:", index.name);
                    }
                }
            } catch (indexError) {
                console.log(
                    "Old phone index cleanup skipped:",
                    indexError.message
                );
            }

            return true;

        } catch (error) {
            console.error("MongoDB connection failed:", error.message);
            mongoPromise = null; // allow a retry on the next request
            return false;
        }
    })();

    return mongoPromise;
}

// Make sure the database is connected before any API route runs
app.use("/api", async (req, res, next) => {
    const connected = await connectMongoDB();

    if (!connected && req.path !== "/health") {
        return res.status(503).json({
            message: "Database is not available. Please try again shortly."
        });
    }

    next();
});


// =====================================================
// HELPERS
// =====================================================

function generateToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
}

function getPublicNFC(nfc) {
    if (!nfc) return null;

    return {
        nfcId: nfc.nfcId,
        name: nfc.name,
        course: nfc.course,
        item: nfc.item,
        status: nfc.status,
        createdAt: nfc.createdAt
    };
}

function getPublicOwner(owner) {
    return {
        name: owner.name,
        email: owner.email,
        course: owner.course
    };
}

function chatIsExpired(chat) {
    if (!chat) return true;
    return new Date() > new Date(chat.expiresAt);
}

function secureCompare(a, b) {
    if (!a || !b) return false;

    const bufferA = Buffer.from(String(a));
    const bufferB = Buffer.from(String(b));

    if (bufferA.length !== bufferB.length) return false;

    return crypto.timingSafeEqual(bufferA, bufferB);
}


// =====================================================
// PASSWORD HASHING
// =====================================================

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString("hex");

        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) return reject(error);
            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
}

function verifyPassword(password, storedHash) {
    return new Promise((resolve, reject) => {
        try {
            const parts = String(storedHash || "").split(":");

            if (parts.length !== 2) return resolve(false);

            const salt = parts[0];
            const storedKey = Buffer.from(parts[1], "hex");

            crypto.scrypt(password, salt, 64, (error, derivedKey) => {
                if (error) return reject(error);

                if (storedKey.length !== derivedKey.length) {
                    return resolve(false);
                }

                resolve(crypto.timingSafeEqual(storedKey, derivedKey));
            });

        } catch (error) {
            reject(error);
        }
    });
}


// =====================================================
// COOKIE HELPERS
// =====================================================

function parseCookies(req) {
    const cookies = {};
    const cookieHeader = req.headers.cookie;

    if (!cookieHeader) return cookies;

    cookieHeader.split(";").forEach(cookie => {
        const parts = cookie.trim().split("=");
        const key = parts.shift();

        if (!key) return;

        try {
            cookies[key] = decodeURIComponent(parts.join("="));
        } catch {
            cookies[key] = parts.join("=");
        }
    });

    return cookies;
}

function setSessionCookie(req, res, name, value, maxAgeSeconds) {
    const secure =
        req.secure || req.headers["x-forwarded-proto"] === "https";

    res.setHeader(
        "Set-Cookie",
        `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; ` +
        `Max-Age=${maxAgeSeconds}; SameSite=Lax${secure ? "; Secure" : ""}`
    );
}

function clearSessionCookie(req, res, name) {
    setSessionCookie(req, res, name, "", 0);
}


// =====================================================
// SESSION TOKENS (HMAC signed)
// =====================================================

function signPayload(payload, secret) {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}


// ---------- Owner ----------

const OWNER_COOKIE_NAME = "tnf_owner_session";
const OWNER_SESSION_SECONDS = 7 * 24 * 60 * 60;

function ownerSecret() {
    return (
        process.env.OWNER_SECRET ||
        process.env.ADMIN_SECRET ||
        "tnf-development-secret"
    );
}

function createOwnerToken(ownerId) {
    const expiresAt = Date.now() + OWNER_SESSION_SECONDS * 1000;
    const payload = `${ownerId}.${expiresAt}`;

    return `${payload}.${signPayload(payload, ownerSecret())}`;
}

function verifyOwnerToken(token) {
    try {
        if (!token) return null;

        const parts = token.split(".");
        if (parts.length !== 3) return null;

        const ownerId = parts[0];
        const expiresAt = Number(parts[1]);
        const signature = parts[2];

        if (!ownerId || !expiresAt || !signature) return null;
        if (Date.now() > expiresAt) return null;

        const expected = signPayload(`${ownerId}.${expiresAt}`, ownerSecret());

        if (!secureCompare(signature, expected)) return null;

        return { ownerId, expiresAt };

    } catch {
        return null;
    }
}

async function getLoggedInOwner(req) {
    try {
        const cookies = parseCookies(req);
        const verified = verifyOwnerToken(cookies[OWNER_COOKIE_NAME]);

        if (!verified) return null;

        const owner = await Owner.findById(verified.ownerId);

        return owner || null;

    } catch {
        return null;
    }
}


// ---------- Admin ----------

const ADMIN_COOKIE_NAME = "tnf_admin_session";
const ADMIN_SESSION_SECONDS = 24 * 60 * 60;

function adminSecret() {
    return process.env.ADMIN_SECRET || "tnf-admin-development-secret";
}

function createAdminToken() {
    const expiresAt = Date.now() + ADMIN_SESSION_SECONDS * 1000;
    const payload = `admin.${expiresAt}`;

    return `${payload}.${signPayload(payload, adminSecret())}`;
}

function verifyAdminToken(token) {
    try {
        if (!token) return false;

        const parts = token.split(".");
        if (parts.length !== 3) return false;

        const expiresAt = Number(parts[1]);
        const signature = parts[2];

        if (!expiresAt || !signature) return false;
        if (Date.now() > expiresAt) return false;

        const expected = signPayload(`admin.${expiresAt}`, adminSecret());

        return secureCompare(signature, expected);

    } catch {
        return false;
    }
}

function adminAuthenticated(req) {
    const cookies = parseCookies(req);
    return verifyAdminToken(cookies[ADMIN_COOKIE_NAME]);
}


// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        message: "TNF server is running",
        mongo:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected"
    });
});


// =====================================================
// OWNER + NFC REGISTRATION
// =====================================================

app.post("/api/nfc/register", async (req, res) => {
    try {

        const { name, email, password, course, item } = req.body || {};

        if (!name || !email || !password || !course || !item) {
            return res.status(400).json({
                message:
                    "Name, Gmail address, password, course and item are required."
            });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanCourse = String(course).trim();
        const cleanItem = String(item).trim();

        if (!/^[^\s@]+@gmail\.com$/i.test(cleanEmail)) {
            return res.status(400).json({
                message:
                    "Please enter a valid Gmail address ending with @gmail.com."
            });
        }

        if (String(password).length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long."
            });
        }

        const existingOwner = await Owner.findOne({ email: cleanEmail });

        if (existingOwner) {
            return res.status(409).json({
                message: "This Gmail address is already registered."
            });
        }

        const passwordHash = await hashPassword(String(password));

        const owner = new Owner({
            name: cleanName,
            email: cleanEmail,
            passwordHash,
            course: cleanCourse
        });

        await owner.save();

        // Generate NFC ID
        const nfcId = "TNF-" + Date.now().toString(36).toUpperCase();

        const nfc = new NFC({
            nfcId,
            ownerId: owner._id,
            name: cleanName,
            course: cleanCourse,
            item: cleanItem,
            status: "registered",
            ownerToken: generateToken(32)
        });

        await nfc.save();

        // Automatically log the owner in
        setSessionCookie(
            req,
            res,
            OWNER_COOKIE_NAME,
            createOwnerToken(owner._id.toString()),
            OWNER_SESSION_SECONDS
        );

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const nfcUrl = `${baseUrl}/nfc/${encodeURIComponent(nfcId)}`;
        const ownerAccessUrl =
            `${baseUrl}/owner.html?nfcId=${encodeURIComponent(nfcId)}`;

        console.log("New owner registered:", cleanEmail, nfcId);

        return res.status(201).json({
            message: "NFC registered successfully!",
            nfcId,
            nfcUrl,
            ownerAccessUrl,
            owner: getPublicOwner(owner)
        });

    } catch (error) {

        console.error("NFC registration error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                message: "This Gmail address or NFC ID is already registered."
            });
        }

        return res.status(500).json({
            message: "Server error while registering NFC.",
            error: error.message
        });
    }
});


// =====================================================
// GET ALL NFCs
// =====================================================

app.get("/api/nfc/all", async (req, res) => {
    try {
        const nfcList = await NFC.find().sort({ createdAt: -1 });

        res.json(nfcList.map(getPublicNFC));

    } catch (error) {
        console.error("Get all NFC error:", error);

        res.status(500).json({
            message: "Failed to fetch NFC records."
        });
    }
});


// =====================================================
// GET ONE NFC
// =====================================================

app.get("/api/nfc/:nfcId", async (req, res) => {
    try {
        const nfc = await NFC.findOne({ nfcId: req.params.nfcId });

        if (!nfc) {
            return res.status(404).json({ message: "NFC not found." });
        }

        res.json(getPublicNFC(nfc));

    } catch (error) {
        console.error("Get NFC error:", error);

        res.status(500).json({ message: "Failed to fetch NFC." });
    }
});


// =====================================================
// IDENTIFY OWNER OR FINDER
// =====================================================

app.get("/api/nfc/:nfcId/identify", async (req, res) => {
    try {
        const nfc = await NFC.findOne({ nfcId: req.params.nfcId });

        if (!nfc) {
            return res.status(404).json({ message: "NFC not found." });
        }

        const owner = await getLoggedInOwner(req);

        if (owner && owner._id.toString() === nfc.ownerId.toString()) {
            return res.json({
                role: "owner",
                nfc: getPublicNFC(nfc),
                owner: getPublicOwner(owner)
            });
        }

        return res.json({
            role: "finder",
            nfc: getPublicNFC(nfc)
        });

    } catch (error) {
        console.error("NFC identification error:", error);

        res.status(500).json({ message: "Unable to identify NFC user." });
    }
});


// =====================================================
// ADMIN LOGIN / LOGOUT / ME
// =====================================================

app.post("/api/admin/login", (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }

        const validUsername = secureCompare(
            username,
            process.env.ADMIN_USERNAME
        );

        const validPassword = secureCompare(
            password,
            process.env.ADMIN_PASSWORD
        );

        if (!validUsername || !validPassword) {
            return res.status(401).json({
                message: "Invalid admin username or password."
            });
        }

        setSessionCookie(
            req,
            res,
            ADMIN_COOKIE_NAME,
            createAdminToken(),
            ADMIN_SESSION_SECONDS
        );

        res.json({ message: "Admin login successful." });

    } catch (error) {
        console.error("Admin login error:", error);

        res.status(500).json({ message: "Admin login failed." });
    }
});

app.post("/api/admin/logout", (req, res) => {
    clearSessionCookie(req, res, ADMIN_COOKIE_NAME);

    res.json({ message: "Admin logged out." });
});

app.get("/api/admin/me", (req, res) => {
    if (!adminAuthenticated(req)) {
        return res.status(401).json({ authenticated: false });
    }

    res.json({ authenticated: true });
});


// =====================================================
// ADMIN USERS + NFC REGISTRATIONS
// =====================================================

app.get("/api/admin/users", async (req, res) => {
    try {

        if (!adminAuthenticated(req)) {
            return res.status(401).json({
                message: "Admin authentication required."
            });
        }

        const owners = await Owner.find()
            .select("_id name email course createdAt")
            .sort({ createdAt: -1 });

        const nfcList = await NFC.find()
            .select("nfcId ownerId name course item status createdAt")
            .sort({ createdAt: -1 });

        const countStatus = status =>
            nfcList.filter(
                nfc => String(nfc.status).toLowerCase() === status
            ).length;

        res.json({
            stats: {
                total: nfcList.length,
                registered: countStatus("registered"),
                available: countStatus("available")
            },
            users: nfcList,
            owners
        });

    } catch (error) {
        console.error("Admin users error:", error);

        res.status(500).json({
            message: "Failed to fetch users.",
            error: error.message
        });
    }
});


// =====================================================
// OWNER LOGIN / ME / LOGOUT
// =====================================================

app.post("/api/owner/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return res.status(400).json({
                message: "Gmail address and password are required."
            });
        }

        const cleanEmail = String(email).trim().toLowerCase();

        if (!/^[^\s@]+@gmail\.com$/i.test(cleanEmail)) {
            return res.status(400).json({
                message: "Please enter a valid Gmail address."
            });
        }

        const owner = await Owner.findOne({ email: cleanEmail });

        if (!owner) {
            return res.status(401).json({
                message: "Invalid Gmail address or password."
            });
        }

        const passwordCorrect = await verifyPassword(
            String(password),
            owner.passwordHash
        );

        if (!passwordCorrect) {
            return res.status(401).json({
                message: "Invalid Gmail address or password."
            });
        }

        setSessionCookie(
            req,
            res,
            OWNER_COOKIE_NAME,
            createOwnerToken(owner._id.toString()),
            OWNER_SESSION_SECONDS
        );

        console.log("Owner logged in:", owner.email);

        res.json({
            message: "Owner login successful.",
            owner: getPublicOwner(owner)
        });

    } catch (error) {
        console.error("Owner login error:", error);

        res.status(500).json({ message: "Owner login failed." });
    }
});

app.get("/api/owner/me", async (req, res) => {
    try {
        const owner = await getLoggedInOwner(req);

        if (!owner) {
            return res.status(401).json({ authenticated: false });
        }

        res.json({
            authenticated: true,
            owner: getPublicOwner(owner)
        });

    } catch (error) {
        console.error("Owner me error:", error);

        res.status(500).json({
            message: "Failed to get owner information."
        });
    }
});

app.post("/api/owner/logout", (req, res) => {
    clearSessionCookie(req, res, OWNER_COOKIE_NAME);

    res.json({ message: "Owner logged out." });
});


// =====================================================
// GET LOGGED-IN OWNER'S NFC
// =====================================================

app.get("/api/owner/nfc", async (req, res) => {
    try {
        const owner = await getLoggedInOwner(req);

        if (!owner) {
            return res.status(401).json({
                message: "Owner login required."
            });
        }

        const nfc = await NFC.findOne({ ownerId: owner._id }).sort({
            createdAt: -1
        });

        if (!nfc) {
            return res.status(404).json({
                message: "No NFC is registered for this owner."
            });
        }

        res.json({
            nfc: getPublicNFC(nfc),
            owner: getPublicOwner(owner)
        });

    } catch (error) {
        console.error("Get owner NFC error:", error);

        res.status(500).json({ message: "Failed to find owner's NFC." });
    }
});


// =====================================================
// START FINDER CHAT
// =====================================================

app.post("/api/chat/start", async (req, res) => {
    try {
        const { nfcId } = req.body || {};

        if (!nfcId) {
            return res.status(400).json({ message: "NFC ID is required." });
        }

        const nfc = await NFC.findOne({ nfcId: String(nfcId) });

        if (!nfc) {
            return res.status(404).json({ message: "NFC not found." });
        }

        // If the logged-in person is the owner, no finder chat is created
        const owner = await getLoggedInOwner(req);

        if (owner && owner._id.toString() === nfc.ownerId.toString()) {
            return res.json({
                role: "owner",
                nfc: getPublicNFC(nfc),
                message: "You are the owner of this NFC."
            });
        }

        const chat = new Chat({
            chatId: "CHAT-" + generateToken(12).toUpperCase(),
            nfcId: String(nfcId),
            finderToken: generateToken(32),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            status: "active"
        });

        await chat.save();

        console.log("Finder chat created:", chat.chatId, "for", nfcId);

        return res.status(201).json({
            role: "finder",
            nfc: getPublicNFC(nfc),
            nfcId: nfc.nfcId,
            chatId: chat.chatId,
            finderToken: chat.finderToken,
            expiresAt: chat.expiresAt
        });

    } catch (error) {
        console.error("Start chat error:", error);

        res.status(500).json({
            message: "Unable to start chat.",
            error: error.message
        });
    }
});


// =====================================================
// CHAT AUTHORIZATION
// =====================================================

async function authorizeChat(chat, role, token, req) {
    if (!chat) return false;
    if (chatIsExpired(chat)) return false;

    // Finder
    if (role === "finder") {
        return secureCompare(token, chat.finderToken);
    }

    // Owner
    if (role === "owner") {
        const nfc = await NFC.findOne({ nfcId: chat.nfcId });

        if (!nfc) return false;

        const owner = await getLoggedInOwner(req);

        if (owner && owner._id.toString() === nfc.ownerId.toString()) {
            return true;
        }

        // Old owner-token compatibility
        if (token && nfc.ownerToken && secureCompare(token, nfc.ownerToken)) {
            return true;
        }
    }

    return false;
}


// =====================================================
// GET CHAT MESSAGES
// =====================================================

app.get("/api/chat/:chatId/messages", async (req, res) => {
    try {
        const { chatId } = req.params;
        const role = req.headers["x-chat-role"];
        const token = req.headers["x-chat-token"];

        if (!chatId) {
            return res.status(400).json({ message: "Chat ID is missing." });
        }

        const chat = await Chat.findOne({ chatId });

        if (!chat) {
            return res.status(404).json({ message: "Chat not found." });
        }

        if (chatIsExpired(chat)) {
            chat.status = "expired";
            await chat.save();

            return res.status(410).json({
                message: "This chat has expired."
            });
        }

        const authorized = await authorizeChat(chat, role, token, req);

        if (!authorized) {
            return res.status(403).json({
                message: "Unauthorized chat access."
            });
        }

        const messages = await Message.find({ chatId }).sort({ sentAt: 1 });

        res.json({
            messages,
            expiresAt: chat.expiresAt
        });

    } catch (error) {
        console.error("Get messages error:", error);

        res.status(500).json({ message: "Failed to get messages." });
    }
});


// =====================================================
// SEND CHAT MESSAGE
// =====================================================

app.post("/api/chat/:chatId/messages", async (req, res) => {
    try {
        const { chatId } = req.params;
        const { message } = req.body || {};
        const role = req.headers["x-chat-role"];
        const token = req.headers["x-chat-token"];

        if (!message || !String(message).trim()) {
            return res.status(400).json({
                message: "Message cannot be empty."
            });
        }

        if (!["finder", "owner"].includes(role)) {
            return res.status(400).json({ message: "Invalid chat role." });
        }

        if (!chatId || chatId === "undefined") {
            return res.status(400).json({ message: "Chat ID is missing." });
        }

        const chat = await Chat.findOne({ chatId });

        if (!chat) {
            return res.status(404).json({ message: "Chat not found." });
        }

        if (chatIsExpired(chat)) {
            chat.status = "expired";
            await chat.save();

            return res.status(410).json({
                message: "This chat has expired."
            });
        }

        const authorized = await authorizeChat(chat, role, token, req);

        if (!authorized) {
            return res.status(403).json({
                message: "Unauthorized chat access."
            });
        }

        const newMessage = new Message({
            chatId,
            sender: role,
            message: String(message).trim().substring(0, 500)
        });

        await newMessage.save();

        res.status(201).json(newMessage);

    } catch (error) {
        console.error("Send message error:", error);

        res.status(500).json({ message: "Failed to send message." });
    }
});


// =====================================================
// OWNER CHAT LIST
// =====================================================

app.get("/api/owner/:nfcId/chats", async (req, res) => {
    try {
        const owner = await getLoggedInOwner(req);

        if (!owner) {
            return res.status(401).json({
                message: "Owner login required."
            });
        }

        const nfc = await NFC.findOne({ nfcId: req.params.nfcId });

        if (!nfc) {
            return res.status(404).json({ message: "NFC not found." });
        }

        if (owner._id.toString() !== nfc.ownerId.toString()) {
            return res.status(403).json({
                message: "You are not the owner of this NFC."
            });
        }

        const chats = await Chat.find({ nfcId: req.params.nfcId }).sort({
            createdAt: -1
        });

        res.json({
            nfc: getPublicNFC(nfc),
            chats
        });

    } catch (error) {
        console.error("Owner chats error:", error);

        res.status(500).json({ message: "Failed to load owner chats." });
    }
});


// =====================================================
// OWNER OPEN CHAT
// =====================================================

app.get("/api/owner/:nfcId/chat/:chatId", async (req, res) => {
    try {
        const owner = await getLoggedInOwner(req);

        if (!owner) {
            return res.status(401).json({
                message: "Owner login required."
            });
        }

        const nfc = await NFC.findOne({ nfcId: req.params.nfcId });

        if (!nfc) {
            return res.status(404).json({ message: "NFC not found." });
        }

        if (owner._id.toString() !== nfc.ownerId.toString()) {
            return res.status(403).json({
                message: "You are not the owner of this NFC."
            });
        }

        const chat = await Chat.findOne({
            chatId: req.params.chatId,
            nfcId: req.params.nfcId
        });

        if (!chat) {
            return res.status(404).json({ message: "Chat not found." });
        }

        if (chatIsExpired(chat)) {
            chat.status = "expired";
            await chat.save();

            return res.status(410).json({
                message: "This chat has expired."
            });
        }

        res.json({
            role: "owner",
            authenticated: true,
            nfc: getPublicNFC(nfc),
            chatId: chat.chatId,
            expiresAt: chat.expiresAt
        });

    } catch (error) {
        console.error("Owner open chat error:", error);

        res.status(500).json({ message: "Failed to open owner chat." });
    }
});


// =====================================================
// FRONTEND ROUTES (local development)
// On Netlify, static files are served by the CDN and
// /nfc/* is rewritten to /nfc.html in netlify.toml.
// =====================================================

function sendPage(fileName) {
    return (req, res) => {
        res.sendFile(path.join(__dirname, fileName));
    };
}

app.get("/", sendPage("index.html"));
app.get("/register.html", sendPage("register.html"));
app.get("/login.html", sendPage("login.html"));
app.get("/admin.html", sendPage("admin.html"));
app.get("/chat.html", sendPage("chat.html"));
app.get("/owner.html", sendPage("owner.html"));
app.get("/nfc/:nfcId", sendPage("nfc.html"));


// =====================================================
// 404 API HANDLER
// =====================================================

app.use("/api", (req, res) => {
    console.log("API endpoint not found:", req.method, req.originalUrl);

    res.status(404).json({ message: "API endpoint not found." });
});


// =====================================================
// ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
    console.error("Unhandled server error:", error);

    res.status(500).json({ message: "Internal server error." });
});


// =====================================================
// START SERVER
// Local:   node server.js   -> listens on a port
// Netlify: required by netlify/functions/api.js -> no listen
// =====================================================

const PORT = process.env.PORT || 5000;

async function startServer() {
    await connectMongoDB();

    app.listen(PORT, () => {
        console.log("=====================================");
        console.log(`TNF server running on port ${PORT}`);
        console.log(`http://localhost:${PORT}`);
        console.log("=====================================");
    });
}

if (require.main === module) {
    startServer();
}

module.exports = app;
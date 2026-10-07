require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();

// =====================================================
// CONFIGURATION
// =====================================================

const PORT = process.env.PORT || 5000;

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://tap-n-found.netlify.app";

const OWNER_COOKIE_NAME = "tnf_owner_session";
const ADMIN_COOKIE_NAME = "tnf_admin_session";

// =====================================================
// MIDDLEWARE
// =====================================================

// IMPORTANT:
// Netlify frontend -> Render backend
// Do NOT put brackets around the URL.
// Do NOT put / at the end.

const allowedOrigins = [
    "https://tap-n-found.netlify.app",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
];

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests without an Origin header
            // such as direct browser/server requests.
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            console.log(
                "Blocked CORS origin:",
                origin
            );

            return callback(
                new Error("Not allowed by CORS")
            );
        },

        credentials: true,

        methods: [
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Owner-Token",
            "X-Chat-Token",
            "X-Chat-Role"
        ]
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files if they exist in the backend folder.
app.use(express.static(__dirname));

// =====================================================
// MONGODB CONNECTION
// =====================================================

let mongoConnectionPromise = null;

async function connectMongoDB() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error(
            "MONGODB_URI is missing in Render environment variables."
        );
    }

    // Already connected
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // Connection already in progress
    if (mongoConnectionPromise) {
        return mongoConnectionPromise;
    }

    mongoConnectionPromise = mongoose
        .connect(mongoUri, {
            serverSelectionTimeoutMS: 10000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 10000,
            maxIdleTimeMS: 60000
        })
        .then(() => {
            console.log("=====================================");
            console.log("MongoDB connected successfully");
            console.log(
                "Database:",
                mongoose.connection.name
            );
            console.log("=====================================");

            return mongoose.connection;
        })
        .catch((error) => {
            mongoConnectionPromise = null;

            console.error(
                "MongoDB connection failed:",
                error.message
            );

            throw error;
        });

    return mongoConnectionPromise;
}

// =====================================================
// OWNER SCHEMA
// =====================================================

const ownerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true,
            lowercase: true
        },

        passwordHash: {
            type: String,
            required: true
        },

        course: {
            type: String,
            required: true,
            trim: true
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: "owners"
    }
);

const Owner =
    mongoose.models.Owner ||
    mongoose.model("Owner", ownerSchema);

// =====================================================
// NFC SCHEMA
// =====================================================

const nfcSchema = new mongoose.Schema(
    {
        nfcId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Owner",
            required: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        course: {
            type: String,
            required: true,
            trim: true
        },

        item: {
            type: String,
            required: true,
            trim: true
        },

        status: {
            type: String,
            default: "registered"
        },

        // Internal owner access token.
        // This is NOT written into the NFC tag.
        ownerToken: {
            type: String,
            unique: true,
            sparse: true
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: "nfcs"
    }
);

const NFC =
    mongoose.models.NFC ||
    mongoose.model("NFC", nfcSchema);

// =====================================================
// CHAT SCHEMA
// =====================================================

const chatSchema = new mongoose.Schema(
    {
        chatId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        nfcId: {
            type: String,
            required: true,
            index: true
        },

        finderToken: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        createdAt: {
            type: Date,
            default: Date.now
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        },

        status: {
            type: String,
            default: "active"
        }
    },
    {
        collection: "chats"
    }
);

const Chat =
    mongoose.models.Chat ||
    mongoose.model("Chat", chatSchema);

// =====================================================
// MESSAGE SCHEMA
// =====================================================

const messageSchema = new mongoose.Schema(
    {
        chatId: {
            type: String,
            required: true,
            index: true
        },

        sender: {
            type: String,
            enum: ["finder", "owner"],
            required: true
        },

        message: {
            type: String,
            required: true,
            maxlength: 500,
            trim: true
        },

        sentAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: "messages"
    }
);

const Message =
    mongoose.models.Message ||
    mongoose.model("Message", messageSchema);

// =====================================================
// TOKEN HELPERS
// =====================================================

function generateToken(bytes = 32) {
    return crypto
        .randomBytes(bytes)
        .toString("hex");
}

// =====================================================
// SECURE COMPARE
// =====================================================

function secureCompare(a, b) {
    if (a === undefined || a === null) {
        return false;
    }

    if (b === undefined || b === null) {
        return false;
    }

    const bufferA =
        Buffer.from(String(a));

    const bufferB =
        Buffer.from(String(b));

    if (
        bufferA.length !==
        bufferB.length
    ) {
        return false;
    }

    return crypto.timingSafeEqual(
        bufferA,
        bufferB
    );
}

// =====================================================
// PASSWORD HASHING
// =====================================================

function hashPassword(password) {
    return new Promise(
        (resolve, reject) => {
            const salt = crypto
                .randomBytes(16)
                .toString("hex");

            crypto.scrypt(
                String(password),
                salt,
                64,
                (error, derivedKey) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(
                        `${salt}:${derivedKey.toString(
                            "hex"
                        )}`
                    );
                }
            );
        }
    );
}

function verifyPassword(
    password,
    storedHash
) {
    return new Promise(
        (resolve, reject) => {
            try {
                if (
                    !storedHash ||
                    typeof storedHash !== "string"
                ) {
                    resolve(false);
                    return;
                }

                const parts =
                    storedHash.split(":");

                if (
                    parts.length !== 2
                ) {
                    resolve(false);
                    return;
                }

                const salt =
                    parts[0];

                const storedKey =
                    Buffer.from(
                        parts[1],
                        "hex"
                    );

                crypto.scrypt(
                    String(password),
                    salt,
                    64,
                    (
                        error,
                        derivedKey
                    ) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        if (
                            storedKey.length !==
                            derivedKey.length
                        ) {
                            resolve(false);
                            return;
                        }

                        resolve(
                            crypto.timingSafeEqual(
                                storedKey,
                                derivedKey
                            )
                        );
                    }
                );
            } catch (error) {
                reject(error);
            }
        }
    );
}

// =====================================================
// COOKIE HELPERS
// =====================================================

function parseCookies(req) {
    const cookies = {};

    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return cookies;
    }

    cookieHeader
        .split(";")
        .forEach((cookie) => {
            const parts =
                cookie.trim().split("=");

            const key =
                parts.shift();

            if (!key) {
                return;
            }

            try {
                cookies[key] =
                    decodeURIComponent(
                        parts.join("=")
                    );
            } catch {
                cookies[key] =
                    parts.join("=");
            }
        });

    return cookies;
}

// =====================================================
// OWNER SESSION TOKEN
// =====================================================

function createOwnerToken(ownerId) {
    const secret =
        process.env.OWNER_SECRET ||
        process.env.ADMIN_SECRET ||
        "tnf-development-secret";

    const expiresAt =
        Date.now() +
        7 *
            24 *
            60 *
            60 *
            1000;

    const payload =
        `${ownerId}.${expiresAt}`;

    const signature =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(payload)
            .digest("hex");

    return `${payload}.${signature}`;
}

function verifyOwnerToken(token) {
    try {
        if (!token) {
            return null;
        }

        const parts =
            token.split(".");

        if (
            parts.length !== 3
        ) {
            return null;
        }

        const ownerId =
            parts[0];

        const expiresAt =
            Number(parts[1]);

        const signature =
            parts[2];

        if (
            !ownerId ||
            !expiresAt ||
            !signature
        ) {
            return null;
        }

        if (
            Date.now() >
            expiresAt
        ) {
            return null;
        }

        const secret =
            process.env.OWNER_SECRET ||
            process.env.ADMIN_SECRET ||
            "tnf-development-secret";

        const payload =
            `${ownerId}.${expiresAt}`;

        const expectedSignature =
            crypto
                .createHmac(
                    "sha256",
                    secret
                )
                .update(payload)
                .digest("hex");

        if (
            !secureCompare(
                signature,
                expectedSignature
            )
        ) {
            return null;
        }

        return {
            ownerId,
            expiresAt
        };
    } catch {
        return null;
    }
}

// =====================================================
// LOGGED-IN OWNER
// =====================================================

async function getLoggedInOwner(req) {
    try {
        const cookies =
            parseCookies(req);

        const token =
            cookies[
                OWNER_COOKIE_NAME
            ];

        const verified =
            verifyOwnerToken(token);

        if (!verified) {
            return null;
        }

        const owner =
            await Owner.findById(
                verified.ownerId
            );

        return owner || null;
    } catch {
        return null;
    }
}

// =====================================================
// PUBLIC NFC DATA
// =====================================================

function getPublicNFC(nfc) {
    if (!nfc) {
        return null;
    }

    return {
        nfcId: nfc.nfcId,
        name: nfc.name,
        course: nfc.course,
        item: nfc.item,
        status: nfc.status,
        createdAt: nfc.createdAt
    };
}

// =====================================================
// OWNER NFC DATA
// =====================================================

function getOwnerNFC(nfc) {
    if (!nfc) {
        return null;
    }

    return {
        nfcId: nfc.nfcId,
        name: nfc.name,
        course: nfc.course,
        item: nfc.item,
        status: nfc.status,
        createdAt: nfc.createdAt,
        ownerToken: nfc.ownerToken
    };
}

// =====================================================
// CHAT EXPIRATION
// =====================================================

function chatIsExpired(chat) {
    if (!chat) {
        return true;
    }

    return (
        new Date() >
        new Date(chat.expiresAt)
    );
}

// =====================================================
// OWNER ACCESS
// =====================================================

function getOwnerTokenFromRequest(req) {
    return (
        req.headers["x-owner-token"] ||
        req.query.token ||
        req.body?.token ||
        null
    );
}

async function canOwnerAccessNFC(
    req,
    nfc
) {
    if (!nfc) {
        return false;
    }

    // First method:
    // logged-in owner session
    const loggedInOwner =
        await getLoggedInOwner(req);

    if (
        loggedInOwner &&
        nfc.ownerId &&
        String(nfc.ownerId) ===
            String(loggedInOwner._id)
    ) {
        return true;
    }

    // Second method:
    // owner token
    const token =
        getOwnerTokenFromRequest(req);

    if (
        token &&
        nfc.ownerToken &&
        secureCompare(
            token,
            nfc.ownerToken
        )
    ) {
        return true;
    }

    return false;
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/api/health",
    async (req, res) => {
        try {
            let mongoStatus =
                "disconnected";

            if (
                mongoose.connection.readyState ===
                1
            ) {
                mongoStatus =
                    "connected";
            } else {
                try {
                    await connectMongoDB();

                    mongoStatus =
                        "connected";
                } catch {
                    mongoStatus =
                        "disconnected";
                }
            }

            return res.status(200).json({
                ok: true,
                status: "OK",
                message:
                    "Tap N Found API is running.",
                mongo: mongoStatus,
                database:
                    mongoose.connection.name ||
                    null
            });
        } catch (error) {
            console.error(
                "Health check error:",
                error.message
            );

            return res.status(500).json({
                ok: false,
                message:
                    "Health check failed."
            });
        }
    }
);

// =====================================================
// ROOT BACKEND TEST
// =====================================================

app.get(
    "/",
    (req, res) => {
        res.json({
            ok: true,
            message:
                "Tap N Found backend is running.",
            backend:
                "https://tap-n-found-backend.onrender.com",
            frontend:
                FRONTEND_URL
        });
    }
);

// =====================================================
// OWNER + NFC REGISTRATION
// =====================================================

app.post(
    "/api/nfc/register",
    async (req, res) => {
        try {
            await connectMongoDB();

            const {
                name,
                email,
                password,
                course,
                item
            } = req.body;

            // ---------------------------------------------
            // REQUIRED FIELDS
            // ---------------------------------------------

            if (
                !name ||
                !email ||
                !password ||
                !course ||
                !item
            ) {
                return res.status(400).json({
                    message:
                        "Name, Gmail address, password, course and item are required."
                });
            }

            const cleanName =
                String(name).trim();

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const cleanCourse =
                String(course).trim();

            const cleanItem =
                String(item).trim();

            const cleanPassword =
                String(password);

            // ---------------------------------------------
            // GMAIL VALIDATION
            // ---------------------------------------------

            if (
                !/^[^\s@]+@gmail\.com$/i.test(
                    cleanEmail
                )
            ) {
                return res.status(400).json({
                    message:
                        "Please enter a valid Gmail address ending with @gmail.com."
                });
            }

            // ---------------------------------------------
            // PASSWORD VALIDATION
            // ---------------------------------------------

            if (
                cleanPassword.length < 6
            ) {
                return res.status(400).json({
                    message:
                        "Password must be at least 6 characters long."
                });
            }

            // ---------------------------------------------
            // CHECK EXISTING OWNER
            // ---------------------------------------------

            const existingOwner =
                await Owner.findOne({
                    email: cleanEmail
                });

            if (existingOwner) {
                return res.status(409).json({
                    message:
                        "This Gmail address is already registered."
                });
            }

            // ---------------------------------------------
            // HASH PASSWORD
            // ---------------------------------------------

            const passwordHash =
                await hashPassword(
                    cleanPassword
                );

            // ---------------------------------------------
            // CREATE OWNER
            // ---------------------------------------------

            const owner =
                new Owner({
                    name: cleanName,
                    email: cleanEmail,
                    passwordHash,
                    course:
                        cleanCourse
                });

            await owner.save();

            // ---------------------------------------------
            // GENERATE NFC ID
            // ---------------------------------------------

            const nfcId =
                "TNF-" +
                Date.now()
                    .toString(36)
                    .toUpperCase();

            const ownerToken =
                generateToken(32);

            // ---------------------------------------------
            // CREATE NFC
            // ---------------------------------------------

            const nfc =
                new NFC({
                    nfcId,
                    ownerId:
                        owner._id,
                    name:
                        cleanName,
                    course:
                        cleanCourse,
                    item:
                        cleanItem,
                    status:
                        "registered",
                    ownerToken
                });

            await nfc.save();

            // ---------------------------------------------
            // AUTOMATIC OWNER LOGIN
            // ---------------------------------------------

            const ownerSession =
                createOwnerToken(
                    owner._id.toString()
                );

            res.setHeader(
                "Set-Cookie",
                [
                    `${OWNER_COOKIE_NAME}=${encodeURIComponent(
                        ownerSession
                    )}`,
                    "HttpOnly",
                    "Path=/",
                    "Max-Age=604800",
                    "SameSite=None",
                    "Secure"
                ].join("; ")
            );

            // ---------------------------------------------
            // DEPLOYED NFC URL
            // ---------------------------------------------

            const nfcUrl =
                `${FRONTEND_URL}/nfc/${encodeURIComponent(
                    nfcId
                )}`;

            // ---------------------------------------------
            // OWNER URL
            // ---------------------------------------------

            const ownerAccessUrl =
                `${FRONTEND_URL}/owner.html?nfcId=${encodeURIComponent(
                    nfcId
                )}&token=${encodeURIComponent(
                    ownerToken
                )}`;

            console.log(
                "====================================="
            );

            console.log(
                "New owner registered"
            );

            console.log(
                "Name:",
                cleanName
            );

            console.log(
                "Gmail:",
                cleanEmail
            );

            console.log(
                "NFC ID:",
                nfcId
            );

            console.log(
                "NFC URL:",
                nfcUrl
            );

            console.log(
                "====================================="
            );

            return res.status(201).json({
                message:
                    "NFC registered successfully!",

                nfcId,

                nfcUrl,

                ownerAccessUrl,

                owner: {
                    name:
                        owner.name,
                    email:
                        owner.email,
                    course:
                        owner.course
                }
            });
        } catch (error) {
            console.error(
                "NFC registration error:",
                error
            );

            // Duplicate key
            if (
                error.code === 11000
            ) {
                return res.status(409).json({
                    message:
                        "This Gmail address or NFC ID is already registered."
                });
            }

            return res.status(500).json({
                message:
                    "Server error while registering NFC.",
                error:
                    error.message
            });
        }
    }
);

// =====================================================
// GET ALL NFCs
// =====================================================

app.get(
    "/api/nfc/all",
    async (req, res) => {
        try {
            await connectMongoDB();

            const nfcList =
                await NFC.find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json(
                nfcList.map(
                    getPublicNFC
                )
            );
        } catch (error) {
            console.error(
                "Get all NFC error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch NFC records."
            });
        }
    }
);

// =====================================================
// GET ONE NFC
// =====================================================

app.get(
    "/api/nfc/:nfcId",
    async (req, res) => {
        try {
            await connectMongoDB();

            const nfc =
                await NFC.findOne({
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            res.json(
                getPublicNFC(nfc)
            );
        } catch (error) {
            console.error(
                "Get NFC error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch NFC."
            });
        }
    }
);

// =====================================================
// IDENTIFY OWNER OR FINDER
// =====================================================

app.get(
    "/api/nfc/:nfcId/identify",
    async (req, res) => {
        try {
            await connectMongoDB();

            const nfc =
                await NFC.findOne({
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            const owner =
                await getLoggedInOwner(req);

            // ---------------------------------------------
            // OWNER
            // ---------------------------------------------

            if (
                owner &&
                owner._id.toString() ===
                    nfc.ownerId.toString()
            ) {
                return res.json({
                    role: "owner",

                    nfc:
                        getPublicNFC(nfc),

                    owner: {
                        name:
                            owner.name,

                        email:
                            owner.email,

                        course:
                            owner.course
                    }
                });
            }

            // ---------------------------------------------
            // FINDER
            // ---------------------------------------------

            return res.json({
                role: "finder",

                nfc:
                    getPublicNFC(nfc)
            });
        } catch (error) {
            console.error(
                "NFC identification error:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to identify NFC user."
            });
        }
    }
);

// =====================================================
// OWNER LOGIN USING GMAIL
// =====================================================

app.post(
    "/api/owner/login",
    async (req, res) => {
        try {
            await connectMongoDB();

            const {
                email,
                password
            } = req.body;

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    message:
                        "Gmail address and password are required."
                });
            }

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            if (
                !/^[^\s@]+@gmail\.com$/i.test(
                    cleanEmail
                )
            ) {
                return res.status(400).json({
                    message:
                        "Please enter a valid Gmail address."
                });
            }

            const owner =
                await Owner.findOne({
                    email:
                        cleanEmail
                });

            if (!owner) {
                return res.status(401).json({
                    message:
                        "Invalid Gmail address or password."
                });
            }

            const passwordCorrect =
                await verifyPassword(
                    String(password),
                    owner.passwordHash
                );

            if (!passwordCorrect) {
                return res.status(401).json({
                    message:
                        "Invalid Gmail address or password."
                });
            }

            const sessionToken =
                createOwnerToken(
                    owner._id.toString()
                );

            res.setHeader(
                "Set-Cookie",
                [
                    `${OWNER_COOKIE_NAME}=${encodeURIComponent(
                        sessionToken
                    )}`,
                    "HttpOnly",
                    "Path=/",
                    "Max-Age=604800",
                    "SameSite=None",
                    "Secure"
                ].join("; ")
            );

            console.log(
                "Owner logged in:",
                owner.email
            );

            return res.json({
                message:
                    "Owner login successful.",

                owner: {
                    name:
                        owner.name,

                    email:
                        owner.email,

                    course:
                        owner.course
                }
            });
        } catch (error) {
            console.error(
                "Owner login error:",
                error
            );

            res.status(500).json({
                message:
                    "Owner login failed."
            });
        }
    }
);

// =====================================================
// OWNER ME
// =====================================================

app.get(
    "/api/owner/me",
    async (req, res) => {
        try {
            await connectMongoDB();

            const owner =
                await getLoggedInOwner(req);

            if (!owner) {
                return res.status(401).json({
                    authenticated:
                        false
                });
            }

            const nfcs =
                await NFC.find({
                    ownerId:
                        owner._id
                })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            res.json({
                authenticated:
                    true,

                owner: {
                    id:
                        owner._id,

                    name:
                        owner.name,

                    email:
                        owner.email,

                    course:
                        owner.course
                },

                nfcs:
                    nfcs.map(
                        getPublicNFC
                    )
            });
        } catch (error) {
            console.error(
                "Owner me error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to get owner information."
            });
        }
    }
);

// =====================================================
// OWNER LOGOUT
// =====================================================

app.post(
    "/api/owner/logout",
    (req, res) => {
        res.setHeader(
            "Set-Cookie",
            [
                `${OWNER_COOKIE_NAME}=`,
                "HttpOnly",
                "Path=/",
                "Max-Age=0",
                "SameSite=None",
                "Secure"
            ].join("; ")
        );

        res.json({
            message:
                "Owner logged out."
        });
    }
);

// =====================================================
// GET LOGGED-IN OWNER'S NFC
// =====================================================

app.get(
    "/api/owner/nfc",
    async (req, res) => {
        try {
            await connectMongoDB();

            const owner =
                await getLoggedInOwner(req);

            if (!owner) {
                return res.status(401).json({
                    message:
                        "Owner login required."
                });
            }

            const nfc =
                await NFC.findOne({
                    ownerId:
                        owner._id
                })
                    .sort({
                        createdAt: -1
                    });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "No NFC is registered for this owner."
                });
            }

            res.json({
                nfc:
                    getPublicNFC(nfc),

                owner: {
                    name:
                        owner.name,

                    email:
                        owner.email,

                    course:
                        owner.course
                }
            });
        } catch (error) {
            console.error(
                "Get owner NFC error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to find owner's NFC."
            });
        }
    }
);

// =====================================================
// ADMIN AUTHENTICATION
// =====================================================

function createAdminToken() {
    const secret =
        process.env.ADMIN_SECRET ||
        "tnf-admin-development-secret";

    const expiresAt =
        Date.now() +
        24 *
            60 *
            60 *
            1000;

    const payload =
        `admin.${expiresAt}`;

    const signature =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(payload)
            .digest("hex");

    return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
    try {
        if (!token) {
            return false;
        }

        const parts =
            token.split(".");

        if (
            parts.length !== 3
        ) {
            return false;
        }

        const expiresAt =
            Number(parts[1]);

        const signature =
            parts[2];

        if (
            !expiresAt ||
            !signature
        ) {
            return false;
        }

        if (
            Date.now() >
            expiresAt
        ) {
            return false;
        }

        const secret =
            process.env.ADMIN_SECRET ||
            "tnf-admin-development-secret";

        const payload =
            `admin.${expiresAt}`;

        const expectedSignature =
            crypto
                .createHmac(
                    "sha256",
                    secret
                )
                .update(payload)
                .digest("hex");

        return secureCompare(
            signature,
            expectedSignature
        );
    } catch {
        return false;
    }
}

function adminAuthenticated(req) {
    const cookies =
        parseCookies(req);

    return verifyAdminToken(
        cookies[
            ADMIN_COOKIE_NAME
        ]
    );
}

// =====================================================
// ADMIN LOGIN
// =====================================================

app.post(
    "/api/admin/login",
    async (req, res) => {
        try {
            const {
                username,
                password
            } = req.body;

            if (
                !username ||
                !password
            ) {
                return res.status(400).json({
                    message:
                        "Username and password are required."
                });
            }

            if (
                !process.env.ADMIN_USERNAME ||
                !process.env.ADMIN_PASSWORD ||
                !process.env.ADMIN_SECRET
            ) {
                console.error(
                    "Admin environment variables are missing."
                );

                return res.status(500).json({
                    message:
                        "Admin configuration is incomplete."
                });
            }

            const usernameMatch =
                secureCompare(
                    String(username),
                    process.env.ADMIN_USERNAME
                );

            const passwordMatch =
                secureCompare(
                    String(password),
                    process.env.ADMIN_PASSWORD
                );

            if (
                !usernameMatch ||
                !passwordMatch
            ) {
                return res.status(401).json({
                    message:
                        "Invalid admin username or password."
                });
            }

            const token =
                createAdminToken();

            res.setHeader(
                "Set-Cookie",
                [
                    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(
                        token
                    )}`,
                    "HttpOnly",
                    "Path=/",
                    "Max-Age=86400",
                    "SameSite=None",
                    "Secure"
                ].join("; ")
            );

            console.log(
                "Admin login successful"
            );

            return res.status(200).json({
                message:
                    "Admin login successful."
            });
        } catch (error) {
            console.error(
                "Admin login error:",
                error
            );

            res.status(500).json({
                message:
                    "Admin login failed."
            });
        }
    }
);

// =====================================================
// ADMIN ME
// =====================================================

app.get(
    "/api/admin/me",
    (req, res) => {
        if (
            !adminAuthenticated(req)
        ) {
            return res.status(401).json({
                authenticated:
                    false
            });
        }

        res.json({
            authenticated:
                true
        });
    }
);

// =====================================================
// ADMIN USERS
// =====================================================

app.get(
    "/api/admin/users",
    async (req, res) => {
        try {
            if (
                !adminAuthenticated(req)
            ) {
                return res.status(401).json({
                    message:
                        "Admin authentication required."
                });
            }

            await connectMongoDB();

            const owners =
                await Owner.find()
                    .select(
                        "_id name email course createdAt"
                    )
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            const nfcList =
                await NFC.find()
                    .select(
                        "nfcId ownerId name course item status createdAt"
                    )
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            const total =
                nfcList.length;

            const registered =
                nfcList.filter(
                    (nfc) =>
                        String(
                            nfc.status
                        ).toLowerCase() ===
                        "registered"
                ).length;

            const available =
                nfcList.filter(
                    (nfc) =>
                        String(
                            nfc.status
                        ).toLowerCase() ===
                        "available"
                ).length;

            return res.json({
                stats: {
                    total,
                    registered,
                    available
                },

                users:
                    nfcList,

                owners
            });
        } catch (error) {
            console.error(
                "Admin users error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch users.",
                error:
                    error.message
            });
        }
    }
);

// =====================================================
// GET ALL NFC FOR ADMIN.JS
// =====================================================

app.get(
    "/api/admin/nfc",
    async (req, res) => {
        try {
            if (
                !adminAuthenticated(req)
            ) {
                return res.status(401).json({
                    message:
                        "Admin authentication required."
                });
            }

            await connectMongoDB();

            const nfcList =
                await NFC.find()
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            return res.json(
                nfcList.map(
                    getPublicNFC
                )
            );
        } catch (error) {
            console.error(
                "Admin NFC error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to fetch admin NFC records."
            });
        }
    }
);

// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
    "/api/admin/logout",
    (req, res) => {
        res.setHeader(
            "Set-Cookie",
            [
                `${ADMIN_COOKIE_NAME}=`,
                "HttpOnly",
                "Path=/",
                "Max-Age=0",
                "SameSite=None",
                "Secure"
            ].join("; ")
        );

        res.json({
            message:
                "Admin logged out."
        });
    }
);

// =====================================================
// START FINDER CHAT
// =====================================================

app.post(
    "/api/chat/start",
    async (req, res) => {
        try {
            await connectMongoDB();

            const {
                nfcId
            } = req.body;

            console.log(
                "Starting chat for NFC:",
                nfcId
            );

            if (!nfcId) {
                return res.status(400).json({
                    message:
                        "NFC ID is required."
                });
            }

            const cleanNfcId =
                String(nfcId).trim();

            const nfc =
                await NFC.findOne({
                    nfcId:
                        cleanNfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            if (
                String(nfc.status).toLowerCase() !==
                "registered"
            ) {
                return res.status(400).json({
                    message:
                        "This NFC is not active."
                });
            }

            // Check whether current user is owner
            const owner =
                await getLoggedInOwner(req);

            if (
                owner &&
                owner._id.toString() ===
                    nfc.ownerId.toString()
            ) {
                return res.json({
                    role: "owner",

                    nfc:
                        getPublicNFC(nfc),

                    message:
                        "You are the owner of this NFC."
                });
            }

            // Finder chat
            const chatId =
                "CHAT-" +
                generateToken(
                    12
                ).toUpperCase();

            const finderToken =
                generateToken(32);

            const expiresAt =
                new Date(
                    Date.now() +
                    60 *
                        60 *
                        1000
                );

            const chat =
                new Chat({
                    chatId,
                    nfcId:
                        cleanNfcId,
                    finderToken,
                    expiresAt,
                    status:
                        "active"
                });

            await chat.save();

            console.log(
                "====================================="
            );

            console.log(
                "Finder chat created"
            );

            console.log(
                "NFC:",
                cleanNfcId
            );

            console.log(
                "Chat ID:",
                chatId
            );

            console.log(
                "Expires:",
                expiresAt
            );

            console.log(
                "====================================="
            );

            return res.status(201).json({
                role: "finder",

                nfc:
                    getPublicNFC(nfc),

                nfcId:
                    nfc.nfcId,

                chatId:
                    chat.chatId,

                finderToken:
                    chat.finderToken,

                expiresAt:
                    chat.expiresAt
            });
        } catch (error) {
            console.error(
                "Start chat error:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to start chat.",
                error:
                    error.message
            });
        }
    }
);

// =====================================================
// CHAT AUTHORIZATION
// =====================================================

async function authorizeChat(
    chat,
    role,
    token,
    req
) {
    if (!chat) {
        return false;
    }

    if (
        chatIsExpired(chat)
    ) {
        return false;
    }

    // ---------------------------------------------
    // FINDER
    // ---------------------------------------------

    if (
        role === "finder"
    ) {
        return secureCompare(
            token,
            chat.finderToken
        );
    }

    // ---------------------------------------------
    // OWNER
    // ---------------------------------------------

    if (
        role === "owner"
    ) {
        // Owner session
        const owner =
            await getLoggedInOwner(req);

        if (owner) {
            const nfc =
                await NFC.findOne({
                    nfcId:
                        chat.nfcId
                });

            if (
                nfc &&
                owner._id.toString() ===
                    nfc.ownerId.toString()
            ) {
                return true;
            }
        }

        // Owner token compatibility
        const nfc =
            await NFC.findOne({
                nfcId:
                    chat.nfcId
            });

        if (
            nfc &&
            nfc.ownerToken &&
            secureCompare(
                token,
                nfc.ownerToken
            )
        ) {
            return true;
        }
    }

    return false;
}

// =====================================================
// GET CHAT MESSAGES
// =====================================================

app.get(
    "/api/chat/:chatId/messages",
    async (req, res) => {
        try {
            await connectMongoDB();

            const {
                chatId
            } = req.params;

            const role =
                String(
                    req.headers[
                        "x-chat-role"
                    ] || ""
                ).toLowerCase();

            const token =
                req.headers[
                    "x-chat-token"
                ];

            if (!chatId) {
                return res.status(400).json({
                    message:
                        "Chat ID is missing."
                });
            }

            const chat =
                await Chat.findOne({
                    chatId
                });

            if (!chat) {
                return res.status(404).json({
                    message:
                        "Chat not found."
                });
            }

            if (
                chatIsExpired(chat)
            ) {
                chat.status =
                    "expired";

                await chat.save();

                return res.status(410).json({
                    message:
                        "This chat has expired."
                });
            }

            const authorized =
                await authorizeChat(
                    chat,
                    role,
                    token,
                    req
                );

            if (!authorized) {
                return res.status(403).json({
                    message:
                        "Unauthorized chat access."
                });
            }

            const messages =
                await Message.find({
                    chatId
                })
                    .sort({
                        sentAt: 1
                    })
                    .lean();

            res.json({
                chatId:
                    chat.chatId,

                nfcId:
                    chat.nfcId,

                status:
                    chat.status,

                createdAt:
                    chat.createdAt,

                expiresAt:
                    chat.expiresAt,

                role,

                messages
            });
        } catch (error) {
            console.error(
                "Get messages error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to get messages."
            });
        }
    }
);

// =====================================================
// SEND CHAT MESSAGE
// =====================================================

app.post(
    "/api/chat/:chatId/messages",
    async (req, res) => {
        try {
            await connectMongoDB();

            const {
                chatId
            } = req.params;

            const {
                message
            } = req.body;

            const role =
                String(
                    req.headers[
                        "x-chat-role"
                    ] || ""
                ).toLowerCase();

            const token =
                req.headers[
                    "x-chat-token"
                ];

            if (
                !message ||
                !String(message).trim()
            ) {
                return res.status(400).json({
                    message:
                        "Message cannot be empty."
                });
            }

            if (
                !["finder", "owner"].includes(
                    role
                )
            ) {
                return res.status(400).json({
                    message:
                        "Invalid chat role."
                });
            }

            if (
                !chatId ||
                chatId ===
                    "undefined"
            ) {
                return res.status(400).json({
                    message:
                        "Chat ID is missing."
                });
            }

            const chat =
                await Chat.findOne({
                    chatId
                });

            if (!chat) {
                return res.status(404).json({
                    message:
                        "Chat not found."
                });
            }

            if (
                chatIsExpired(chat)
            ) {
                chat.status =
                    "expired";

                await chat.save();

                return res.status(410).json({
                    message:
                        "This chat has expired."
                });
            }

            const authorized =
                await authorizeChat(
                    chat,
                    role,
                    token,
                    req
                );

            if (!authorized) {
                return res.status(403).json({
                    message:
                        "Unauthorized chat access."
                });
            }

            const messageText =
                String(message)
                    .trim()
                    .substring(0, 500);

            const newMessage =
                new Message({
                    chatId,

                    sender:
                        role,

                    message:
                        messageText,

                    sentAt:
                        new Date()
                });

            await newMessage.save();

            res.status(201).json(
                newMessage
            );
        } catch (error) {
            console.error(
                "Send message error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to send message."
            });
        }
    }
);

// =====================================================
// OWNER CHAT LIST
// =====================================================

app.get(
    "/api/owner/:nfcId/chats",
    async (req, res) => {
        try {
            await connectMongoDB();

            const owner =
                await getLoggedInOwner(req);

            const nfc =
                await NFC.findOne({
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            const hasAccess =
                owner &&
                owner._id.toString() ===
                    nfc.ownerId.toString();

            const token =
                getOwnerTokenFromRequest(req);

            const tokenAccess =
                token &&
                nfc.ownerToken &&
                secureCompare(
                    token,
                    nfc.ownerToken
                );

            if (
                !hasAccess &&
                !tokenAccess
            ) {
                return res.status(403).json({
                    message:
                        "You are not the owner of this NFC."
                });
            }

            const chats =
                await Chat.find({
                    nfcId:
                        req.params.nfcId
                })
                    .sort({
                        createdAt: -1
                    })
                    .lean();

            const chatList =
                chats.map(
                    (chat) => ({
                        chatId:
                            chat.chatId,

                        createdAt:
                            chat.createdAt,

                        expiresAt:
                            chat.expiresAt,

                        status:
                            chatIsExpired(
                                chat
                            )
                                ? "expired"
                                : chat.status,

                        ownerRole:
                            "owner",

                        finderRole:
                            "finder"
                    })
                );

            res.json({
                nfc:
                    getPublicNFC(nfc),

                chats:
                    chatList
            });
        } catch (error) {
            console.error(
                "Owner chats error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to load owner chats."
            });
        }
    }
);

// =====================================================
// OWNER OPEN CHAT
// =====================================================

app.get(
    "/api/owner/:nfcId/chat/:chatId",
    async (req, res) => {
        try {
            await connectMongoDB();

            const owner =
                await getLoggedInOwner(req);

            const nfc =
                await NFC.findOne({
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            const token =
                getOwnerTokenFromRequest(req);

            const sessionAccess =
                owner &&
                owner._id.toString() ===
                    nfc.ownerId.toString();

            const tokenAccess =
                token &&
                nfc.ownerToken &&
                secureCompare(
                    token,
                    nfc.ownerToken
                );

            if (
                !sessionAccess &&
                !tokenAccess
            ) {
                return res.status(403).json({
                    message:
                        "You are not the owner of this NFC."
                });
            }

            const chat =
                await Chat.findOne({
                    chatId:
                        req.params.chatId,

                    nfcId:
                        req.params.nfcId
                });

            if (!chat) {
                return res.status(404).json({
                    message:
                        "Chat not found."
                });
            }

            if (
                chatIsExpired(chat)
            ) {
                chat.status =
                    "expired";

                await chat.save();

                return res.status(410).json({
                    message:
                        "This chat has expired."
                });
            }

            res.json({
                role: "owner",

                authenticated:
                    true,

                nfc:
                    getPublicNFC(nfc),

                chatId:
                    chat.chatId,

                expiresAt:
                    chat.expiresAt
            });
        } catch (error) {
            console.error(
                "Owner open chat error:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to open owner chat."
            });
        }
    }
);

// =====================================================
// FRONTEND ROUTES
// =====================================================

app.get(
    "/register.html",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "register.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "register.html not found on backend."
                    });
                }
            }
        );
    }
);

app.get(
    "/login.html",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "login.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "login.html not found on backend."
                    });
                }
            }
        );
    }
);

app.get(
    "/admin.html",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "admin.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "admin.html not found on backend."
                    });
                }
            }
        );
    }
);

app.get(
    "/owner.html",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "owner.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "owner.html not found on backend."
                    });
                }
            }
        );
    }
);

app.get(
    "/chat.html",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "chat.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "chat.html not found on backend."
                    });
                }
            }
        );
    }
);

// NFC public URL
app.get(
    "/nfc/:nfcId",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "nfc.html"
            ),
            (error) => {
                if (error) {
                    res.status(404).json({
                        message:
                            "nfc.html not found on backend."
                    });
                }
            }
        );
    }
);

// =====================================================
// API 404 HANDLER
// =====================================================

app.use(
    "/api",
    (req, res) => {
        console.log(
            "API endpoint not found:",
            req.method,
            req.originalUrl
        );

        res.status(404).json({
            message:
                "API endpoint not found.",
            path:
                req.originalUrl
        });
    }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {
        console.error(
            "Unhandled server error:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(error);
        }

        res.status(500).json({
            message:
                "Internal server error.",
            error:
                error.message
        });
    }
);

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
    try {
        console.log(
            "====================================="
        );

        console.log(
            "Starting Tap N Found backend..."
        );

        console.log(
            "PORT:",
            PORT
        );

        console.log(
            "Frontend:",
            FRONTEND_URL
        );

        console.log(
            "MongoDB URI configured:",
            !!process.env.MONGODB_URI
        );

        console.log(
            "Admin configured:",
            !!(
                process.env.ADMIN_USERNAME &&
                process.env.ADMIN_PASSWORD &&
                process.env.ADMIN_SECRET
            )
        );

        console.log(
            "====================================="
        );

        // Try MongoDB connection before starting
        // the HTTP server.
        await connectMongoDB();

        app.listen(
            PORT,
            () => {
                console.log(
                    "====================================="
                );

                console.log(
                    `TNF server running on port ${PORT}`
                );

                console.log(
                    "Backend URL:",
                    "https://tap-n-found-backend.onrender.com"
                );

                console.log(
                    "Health URL:",
                    "https://tap-n-found-backend.onrender.com/api/health"
                );

                console.log(
                    "CORS frontend:",
                    FRONTEND_URL
                );

                console.log(
                    "Gmail owner authentication enabled"
                );

                console.log(
                    "Finder/Owner private chat enabled"
                );

                console.log(
                    "====================================="
                );
            }
        );
    } catch (error) {
        console.error(
            "====================================="
        );

        console.error(
            "SERVER STARTUP FAILED"
        );

        console.error(
            error.message
        );

        console.error(
            "====================================="
        );

        // Keep the process alive so Render logs
        // clearly show the actual problem.
        app.listen(
            PORT,
            () => {
                console.log(
                    `TNF server running on port ${PORT} without MongoDB`
                );
            }
        );
    }
}

// =====================================================
// START
// =====================================================

startServer();

module.exports = app;
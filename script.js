require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
    cors({
        origin: "https://tap-n-found.netlify.app",
        credentials: true
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(__dirname));


// =====================================================
// OWNER SCHEMA
// =====================================================

const ownerSchema = new mongoose.Schema({
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
});

const Owner =
    mongoose.models.Owner ||
    mongoose.model("Owner", ownerSchema);


// =====================================================
// NFC SCHEMA
// =====================================================

const nfcSchema = new mongoose.Schema({
    nfcId: {
        type: String,
        required: true,
        unique: true,
        index: true
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

    // Internal compatibility token.
    // NOT stored inside NFC tag.
    ownerToken: {
        type: String,
        unique: true,
        sparse: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

const NFC =
    mongoose.models.NFC ||
    mongoose.model("NFC", nfcSchema);


// =====================================================
// CHAT SCHEMA
// =====================================================

const chatSchema = new mongoose.Schema({
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
        unique: true
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
});

const Chat =
    mongoose.models.Chat ||
    mongoose.model("Chat", chatSchema);


// =====================================================
// MESSAGE SCHEMA
// =====================================================

const messageSchema = new mongoose.Schema({
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
});

const Message =
    mongoose.models.Message ||
    mongoose.model("Message", messageSchema);


// =====================================================
// MONGODB CONNECTION
// =====================================================

async function connectMongoDB() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error(
                "MONGODB_URI is missing in .env file"
            );
        }

        await mongoose.connect(
            process.env.MONGODB_URI,
            {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 10000,
                maxIdleTimeMS: 60000
            }
        );

        console.log("=====================================");
        console.log("MongoDB connected successfully");
        console.log(
            "Database:",
            mongoose.connection.name
        );
        console.log("=====================================");

        // Remove old phone indexes if they still exist
        try {
            const indexes =
                await Owner.collection.indexes();

            for (const index of indexes) {
                if (
                    index.name !== "_id_" &&
                    index.key &&
                    Object.prototype.hasOwnProperty.call(
                        index.key,
                        "phone"
                    )
                ) {
                    await Owner.collection.dropIndex(
                        index.name
                    );

                    console.log(
                        "Removed old phone index:",
                        index.name
                    );
                }
            }
        } catch (indexError) {
            console.log(
                "Old phone index cleanup skipped:",
                indexError.message
            );
        }

    } catch (error) {
        console.error(
            "MongoDB connection failed:"
        );

        console.error(
            error.message
        );
    }
}


// =====================================================
// TOKEN HELPERS
// =====================================================

function generateToken(bytes = 32) {
    return crypto
        .randomBytes(bytes)
        .toString("hex");
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
// PASSWORD HASHING
// =====================================================

function hashPassword(password) {
    return new Promise(
        (resolve, reject) => {
            const salt =
                crypto
                    .randomBytes(16)
                    .toString("hex");

            crypto.scrypt(
                password,
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
                const parts =
                    storedHash.split(":");

                if (parts.length !== 2) {
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
                    password,
                    salt,
                    64,
                    (error, derivedKey) => {
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
// SECURE COMPARE
// =====================================================

function secureCompare(a, b) {
    if (!a || !b) {
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
        .forEach(cookie => {
            const parts =
                cookie.trim().split("=");

            const key =
                parts.shift();

            if (!key) {
                return;
            }

            cookies[key] =
                decodeURIComponent(
                    parts.join("=")
                );
        });

    return cookies;
}


// =====================================================
// OWNER SESSION
// =====================================================

const OWNER_COOKIE_NAME =
    "tnf_owner_session";


function createOwnerToken(ownerId) {
    const secret =
        process.env.OWNER_SECRET ||
        process.env.ADMIN_SECRET ||
        "tnf-development-secret";

    const expiresAt =
        Date.now() +
        7 * 24 * 60 * 60 * 1000;

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

        if (parts.length !== 3) {
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

    } catch (error) {
        return null;
    }
}


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

    } catch (error) {
        return null;
    }
}


// =====================================================
// HEALTH
// =====================================================

app.get(
    "/api/health",
    async (req, res) => {
        try {
            const mongoState =
                mongoose.connection.readyState;

            res.json({
                ok: true,
                message:
                    "TNF server is running",
                mongo:
                    mongoState === 1
                        ? "connected"
                        : "disconnected"
            });

        } catch (error) {
            res.status(500).json({
                ok: false,
                message:
                    error.message
            });
        }
    }
);


// =====================================================
// OWNER + NFC REGISTRATION
// =====================================================

app.post(
    "/api/nfc/register",
    async (req, res) => {
        try {

            const {
                name,
                email,
                password,
                course,
                item
            } = req.body;

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

            // Gmail validation
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

            if (
                String(password).length < 6
            ) {
                return res.status(400).json({
                    message:
                        "Password must be at least 6 characters long."
                });
            }

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

            const passwordHash =
                await hashPassword(
                    String(password)
                );

            const owner =
                new Owner({
                    name: cleanName,
                    email: cleanEmail,
                    passwordHash,
                    course: cleanCourse
                });

            await owner.save();

            // Generate NFC ID
            const nfcId =
                "TNF-" +
                Date.now()
                    .toString(36)
                    .toUpperCase();

            const ownerToken =
                generateToken(32);

            const nfc =
                new NFC({
                    nfcId,
                    ownerId: owner._id,
                    name: cleanName,
                    course: cleanCourse,
                    item: cleanItem,
                    status: "registered",
                    ownerToken
                });

            await nfc.save();

            // Automatically login owner
            const ownerSession =
                createOwnerToken(
                    owner._id.toString()
                );

            res.setHeader(
                "Set-Cookie",
                `${OWNER_COOKIE_NAME}=${encodeURIComponent(
                    ownerSession
                )}; HttpOnly; Path=/; Max-Age=${
                    7 * 24 * 60 * 60
                }; SameSite=Lax`
            );

            const baseUrl =
                `${req.protocol}://${req.get("host")}`;

            const nfcUrl =
                `${baseUrl}/nfc/${encodeURIComponent(
                    nfcId
                )}`;

            const ownerAccessUrl =
                `${baseUrl}/owner.html?nfcId=${encodeURIComponent(
                    nfcId
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
                "=====================================");

            return res.status(201).json({
                message:
                    "NFC registered successfully!",

                nfcId,

                nfcUrl,

                ownerAccessUrl,

                owner: {
                    name: owner.name,
                    email: owner.email,
                    course: owner.course
                }
            });

        } catch (error) {

            console.error(
                "NFC registration error:",
                error
            );

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

            const nfcList =
                await NFC.find()
                    .sort({
                        createdAt: -1
                    });

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

            // Owner
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

            // Finder
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
// ADMIN AUTHENTICATION
// =====================================================

const ADMIN_COOKIE_NAME =
    "tnf_admin_session";


function createAdminToken() {

    const secret =
        process.env.ADMIN_SECRET ||
        "tnf-admin-development-secret";

    const expiresAt =
        Date.now() +
        24 * 60 * 60 * 1000;

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

        if (parts.length !== 3) {
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

    } catch (error) {
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

            const validUsername =
                username ===
                process.env.ADMIN_USERNAME;

            const validPassword =
                password ===
                process.env.ADMIN_PASSWORD;

            if (
                !validUsername ||
                !validPassword
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
                `${ADMIN_COOKIE_NAME}=${encodeURIComponent(
                    token
                )}; HttpOnly; Path=/; Max-Age=${
                    24 * 60 * 60
                }; SameSite=Lax`
            );

            res.json({
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
                authenticated: false
            });
        }

        res.json({
            authenticated: true
        });
    }
);

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

        // Get all owners
        const owners = await Owner.find()
            .select("_id name email course createdAt")
            .sort({ createdAt: -1 });

        // Get all NFC registrations
        const nfcList = await NFC.find()
            .select(
                "nfcId ownerId name course item status createdAt"
            )
            .sort({ createdAt: -1 });

        // Statistics
        const total = nfcList.length;

        const registered = nfcList.filter(
            nfc =>
                String(nfc.status).toLowerCase() ===
                "registered"
        ).length;

        const available = nfcList.filter(
            nfc =>
                String(nfc.status).toLowerCase() ===
                "available"
        ).length;

        // Send everything to Admin dashboard
        res.json({
            stats: {
                total: total,
                registered: registered,
                available: available
            },

            users: nfcList,

            owners: owners
        });

    } catch (error) {

        console.error(
            "Admin users error:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch users.",
            error: error.message
        });

    }
});

// =====================================================
// OWNER LOGIN USING GMAIL
// =====================================================

app.post(
    "/api/owner/login",
    async (req, res) => {

        try {

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
                    email: cleanEmail
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
                `${OWNER_COOKIE_NAME}=${encodeURIComponent(
                    sessionToken
                )}; HttpOnly; Path=/; Max-Age=${
                    7 * 24 * 60 * 60
                }; SameSite=Lax`
            );

            console.log(
                "Owner logged in:",
                owner.email
            );

            res.json({
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

            const owner =
                await getLoggedInOwner(req);

            if (!owner) {
                return res.status(401).json({
                    authenticated: false
                });
            }

            res.json({
                authenticated: true,

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
            `${OWNER_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
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
// START FINDER CHAT
// =====================================================

app.post(
    "/api/chat/start",
    async (req, res) => {

        try {

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

            const nfc =
                await NFC.findOne({
                    nfcId:
                        String(nfcId)
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            // Check if logged-in person is owner
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

            // Create finder chat
            const chatId =
                "CHAT-" +
                generateToken(12)
                    .toUpperCase();

            const finderToken =
                generateToken(32);

            const expiresAt =
                new Date(
                    Date.now() +
                    60 * 60 * 1000
                );

            const chat =
                new Chat({
                    chatId,
                    nfcId:
                        String(nfcId),
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
                nfcId
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

            // VERY IMPORTANT:
            // Always return chatId and finderToken
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

    // FINDER
    if (role === "finder") {

        return secureCompare(
            token,
            chat.finderToken
        );
    }

    // OWNER
    if (role === "owner") {

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

        // Old owner-token compatibility
        if (token) {

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

            const {
                chatId
            } = req.params;

            const role =
                req.headers[
                    "x-chat-role"
                ];

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
                });

            res.json({
                messages,
                expiresAt:
                    chat.expiresAt
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

            const {
                chatId
            } = req.params;

            const {
                message
            } = req.body;

            const role =
                req.headers[
                    "x-chat-role"
                ];

            const token =
                req.headers[
                    "x-chat-token"
                ];

            if (!message ||
                !String(message).trim()
            ) {
                return res.status(400).json({
                    message:
                        "Message cannot be empty."
                });
            }

            if (
                !["finder", "owner"]
                    .includes(role)
            ) {
                return res.status(400).json({
                    message:
                        "Invalid chat role."
                });
            }

            if (!chatId ||
                chatId === "undefined"
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

            const newMessage =
                new Message({
                    chatId,
                    sender:
                        role,
                    message:
                        String(message)
                            .trim()
                            .substring(
                                0,
                                500
                            )
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
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            if (
                owner._id.toString() !==
                nfc.ownerId.toString()
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
                });

            res.json({

                nfc:
                    getPublicNFC(nfc),

                chats

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
                    nfcId:
                        req.params.nfcId
                });

            if (!nfc) {
                return res.status(404).json({
                    message:
                        "NFC not found."
                });
            }

            if (
                owner._id.toString() !==
                nfc.ownerId.toString()
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

                role:
                    "owner",

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
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );
    }
);


app.get(
    "/register.html",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "register.html"
            )
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
            )
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
            )
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
            )
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
            )
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
            )
        );
    }
);


// =====================================================
// 404 API HANDLER
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
                "API endpoint not found."
        });
    }
);


// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "Unhandled server error:",
            error
        );

        res.status(500).json({
            message:
                "Internal server error."
        });
    }
);


// =====================================================
// START SERVER
// =====================================================

const PORT =
    process.env.PORT || 5000;


async function startServer() {

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
                `http://localhost:${PORT}`
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



}


startServer();


module.exports = app;
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files when running locally
app.use(express.static(__dirname));


// =====================================================
// MONGODB CONNECTION
// =====================================================

let mongoConnectionPromise = null;

async function connectMongoDB() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error(
            "MONGODB_URI is not configured."
        );
    }

    // Already connected
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // Connection already in progress
    if (!mongoConnectionPromise) {

        mongoConnectionPromise = mongoose.connect(
            mongoUri,
            {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 10000,
                maxIdleTimeMS: 60000
            }
        )
        .then(() => {

            console.log(
                "MongoDB connected successfully!"
            );

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
    }

    return mongoConnectionPromise;
}


// =====================================================
// NFC SCHEMA
// =====================================================

const nfcSchema = new mongoose.Schema({

    nfcId: {
        type: String,
        required: true,
        unique: true
    },

    name: {
        type: String,
        required: true
    },

    course: {
        type: String,
        required: true
    },

    item: {
        type: String,
        required: true
    },

    status: {
        type: String,
        default: "registered"
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
// HEALTH CHECK
// =====================================================

app.get("/api/health", async (req, res) => {

    try {

        await connectMongoDB();

        return res.status(200).json({
            status: "OK",
            message:
                "Tap N Found API is running.",
            database:
                "MongoDB connected",
            mongoUriConfigured:
                !!process.env.MONGODB_URI
        });

    } catch (error) {

        console.error(
            "MongoDB health error:",
            error
        );

        return res.status(500).json({

            status: "ERROR",

            message:
                "MongoDB connection failed.",

            mongoUriConfigured:
                !!process.env.MONGODB_URI,

            error:
                error.message

        });

    }

});


// =====================================================
// REGISTER NFC
// =====================================================

app.post("/api/nfc/register", async (req, res) => {

    try {

        await connectMongoDB();

        const {
            name,
            course,
            item
        } = req.body;


        // Validate input
        if (!name || !course || !item) {

            return res.status(400).json({

                message:
                    "Please fill all fields."

            });

        }


        // Generate NFC ID
        const nfcId =
            "TNF-" +
            Date.now()
                .toString(36)
                .toUpperCase();


        // Create record
        const newNFC =
            new NFC({

                nfcId,
                name,
                course,
                item

            });


        // Save
        const savedNFC =
            await newNFC.save();


        console.log(
            "NFC registered:",
            savedNFC.nfcId
        );


        return res.status(201).json({

            message:
                "NFC registered successfully!",

            nfcId:
                savedNFC.nfcId

        });

    } catch (error) {

        console.error(
            "SAVE ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Registration failed.",

            error:
                error.message

        });

    }

});


// =====================================================
// GET ALL NFC RECORDS
// =====================================================

app.get("/api/nfc/all", async (req, res) => {

    try {

        await connectMongoDB();

        const records =
            await NFC
                .find()
                .sort({
                    createdAt: -1
                });


        return res.status(200).json(records);

    } catch (error) {

        console.error(
            "FETCH ALL ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Failed to retrieve records."

        });

    }

});


// =====================================================
// GET SINGLE NFC
// =====================================================

app.get("/api/nfc/:nfcId", async (req, res) => {

    try {

        await connectMongoDB();

        const record =
            await NFC.findOne({

                nfcId:
                    req.params.nfcId

            });


        if (!record) {

            return res.status(404).json({

                message:
                    "NFC not found."

            });

        }


        return res.status(200).json(record);

    } catch (error) {

        console.error(
            "FETCH NFC ERROR:",
            error
        );

        return res.status(500).json({

            message:
                "Failed to retrieve NFC."

        });

    }

});


// =====================================================
// ADMIN AUTHENTICATION
// =====================================================

const ADMIN_COOKIE_NAME =
    "tnf_admin_session";


// -----------------------------------------------------
// Secure comparison
// -----------------------------------------------------

function secureCompare(value1, value2) {

    if (
        typeof value1 !== "string" ||
        typeof value2 !== "string"
    ) {
        return false;
    }


    const hash1 =
        crypto
            .createHash("sha256")
            .update(value1)
            .digest();

    const hash2 =
        crypto
            .createHash("sha256")
            .update(value2)
            .digest();


    return crypto.timingSafeEqual(
        hash1,
        hash2
    );
}


// -----------------------------------------------------
// Create admin session token
// -----------------------------------------------------

function createAdminToken(username) {

    const secret =
        process.env.ADMIN_SECRET;


    if (!secret) {

        throw new Error(
            "ADMIN_SECRET is not configured."
        );

    }


    const expiresAt =
        Date.now() +
        (8 * 60 * 60 * 1000);


    const payload =
        Buffer
            .from(
                JSON.stringify({
                    username,
                    expiresAt
                })
            )
            .toString("base64url");


    const signature =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(payload)
            .digest("base64url");


    return `${payload}.${signature}`;
}


// -----------------------------------------------------
// Verify admin session token
// -----------------------------------------------------

function verifyAdminToken(token) {

    if (!token) {
        return false;
    }


    const parts =
        token.split(".");


    if (parts.length !== 2) {
        return false;
    }


    const payload =
        parts[0];

    const signature =
        parts[1];


    const secret =
        process.env.ADMIN_SECRET;


    if (!secret) {
        return false;
    }


    const expectedSignature =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(payload)
            .digest("base64url");


    if (
        signature.length !==
        expectedSignature.length
    ) {
        return false;
    }


    let signaturesMatch;

    try {

        signaturesMatch =
            crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(
                    expectedSignature
                )
            );

    } catch {

        return false;

    }


    if (!signaturesMatch) {
        return false;
    }


    try {

        const data =
            JSON.parse(
                Buffer
                    .from(
                        payload,
                        "base64url"
                    )
                    .toString("utf8")
            );


        if (
            !data.username ||
            !data.expiresAt
        ) {
            return false;
        }


        if (
            Date.now() >
            data.expiresAt
        ) {
            return false;
        }


        if (
            !secureCompare(
                data.username,
                process.env.ADMIN_USERNAME
            )
        ) {
            return false;
        }


        return true;

    } catch {

        return false;

    }

}


// -----------------------------------------------------
// Read cookie
// -----------------------------------------------------

function getCookie(req, cookieName) {

    const cookieHeader =
        req.headers.cookie;


    if (!cookieHeader) {
        return null;
    }


    const cookies =
        cookieHeader
            .split(";")
            .map(
                cookie =>
                    cookie.trim()
            );


    for (const cookie of cookies) {

        const separatorIndex =
            cookie.indexOf("=");


        if (separatorIndex === -1) {
            continue;
        }


        const name =
            cookie.substring(
                0,
                separatorIndex
            );


        const value =
            cookie.substring(
                separatorIndex + 1
            );


        if (
            name === cookieName
        ) {

            return decodeURIComponent(
                value
            );

        }

    }


    return null;

}


// -----------------------------------------------------
// Check admin authentication
// -----------------------------------------------------

function isAdmin(req) {

    const token =
        getCookie(
            req,
            ADMIN_COOKIE_NAME
        );


    return verifyAdminToken(
        token
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


            // Check required values
            if (
                !username ||
                !password
            ) {

                return res.status(400).json({

                    message:
                        "Username and password are required."

                });

            }


            // Check admin configuration
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


            // Compare username
            const usernameMatch =
                secureCompare(
                    username,
                    process.env.ADMIN_USERNAME
                );


            // Compare password
            const passwordMatch =
                secureCompare(
                    password,
                    process.env.ADMIN_PASSWORD
                );


            if (
                !usernameMatch ||
                !passwordMatch
            ) {

                return res.status(401).json({

                    message:
                        "Invalid admin credentials."

                });

            }


            // Create session
            const token =
                createAdminToken(
                    username
                );


            // Determine HTTPS
            const isHttps =
                req.secure ||
                req.headers[
                    "x-forwarded-proto"
                ] === "https";


            const cookieParts = [

                `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,

                "HttpOnly",

                "Path=/",

                "SameSite=Lax",

                "Max-Age=28800"

            ];


            if (isHttps) {
                cookieParts.push(
                    "Secure"
                );
            }


            res.setHeader(
                "Set-Cookie",
                cookieParts.join("; ")
            );


            return res.status(200).json({

                message:
                    "Admin login successful."

            });


        } catch (error) {

            console.error(
                "ADMIN LOGIN ERROR:",
                error
            );


            return res.status(500).json({

                message:
                    "Admin login failed."

            });

        }

    }
);


// =====================================================
// ADMIN SESSION CHECK
// =====================================================

app.get(
    "/api/admin/me",
    (req, res) => {

        if (!isAdmin(req)) {

            return res.status(401).json({

                message:
                    "Not authenticated."

            });

        }


        return res.status(200).json({

            authenticated:
                true

        });

    }
);


// =====================================================
// ADMIN GET ALL USERS
// =====================================================

app.get(
    "/api/admin/users",
    async (req, res) => {

        try {

            // Protect the endpoint
            if (!isAdmin(req)) {

                return res.status(401).json({

                    message:
                        "Admin authentication required."

                });

            }


            await connectMongoDB();


            const users =
                await NFC
                    .find(
                        {},
                        {
                            _id: 0
                        }
                    )
                    .sort({
                        createdAt: -1
                    })
                    .lean();


            const registered =
                users.filter(
                    user =>
                        user.status ===
                        "registered"
                ).length;


            const available =
                users.filter(
                    user =>
                        user.status ===
                        "available"
                ).length;


            // Only return required information
            const safeUsers =
                users.map(
                    user => ({

                        nfcId:
                            user.nfcId,

                        name:
                            user.name,

                        course:
                            user.course,

                        item:
                            user.item,

                        status:
                            user.status,

                        createdAt:
                            user.createdAt

                    })
                );


            return res.status(200).json({

                stats: {

                    total:
                        users.length,

                    registered,

                    available

                },

                users:
                    safeUsers

            });


        } catch (error) {

            console.error(
                "ADMIN USERS ERROR:",
                error
            );


            return res.status(500).json({

                message:
                    "Failed to load admin users."

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

        const isHttps =
            req.secure ||
            req.headers[
                "x-forwarded-proto"
            ] === "https";


        const cookieParts = [

            `${ADMIN_COOKIE_NAME}=`,

            "HttpOnly",

            "Path=/",

            "SameSite=Lax",

            "Max-Age=0"

        ];


        if (isHttps) {
            cookieParts.push(
                "Secure"
            );
        }


        res.setHeader(
            "Set-Cookie",
            cookieParts.join("; ")
        );


        return res.status(200).json({

            message:
                "Logged out successfully."

        });

    }
);


// =====================================================
// HTML ROUTES
// =====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );

});


app.get("/register.html", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "register.html"
        )
    );

});


app.get("/admin.html", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "admin.html"
        )
    );

});


// =====================================================
// EXPORT EXPRESS APP
// =====================================================

module.exports = app;


// =====================================================
// LOCAL DEVELOPMENT
// =====================================================

if (require.main === module) {

    const PORT =
        process.env.PORT || 5000;


    app.listen(
        PORT,
        () => {

            console.log(
                `Server running at http://localhost:${PORT}`
            );

        }
    );

}
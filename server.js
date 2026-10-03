require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve your HTML/CSS/JS files when running locally.
// Netlify serves the static files directly from the publish directory.
app.use(express.static(__dirname));


// =====================================================
// MONGODB CONNECTION
// =====================================================

let mongoConnectionPromise = null;

async function connectMongoDB() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        throw new Error("MONGODB_URI is not configured.");
    }

    // Reuse an already-established connection
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    // Reuse a connection attempt that is already in progress
    if (!mongoConnectionPromise) {
        mongoConnectionPromise = mongoose
            .connect(mongoUri)
            .then(() => {
                console.log("MongoDB connected successfully!");
                return mongoose.connection;
            })
            .catch((error) => {
                console.error(
                    "MongoDB connection failed:",
                    error.message
                );

                // Allow the next request to try again
                mongoConnectionPromise = null;

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

        res.status(200).json({
            status: "OK",
            message: "Tap N Found API is running.",
            database: "MongoDB connected",
            mongoUriConfigured: true
        });

    } catch (error) {
        console.error("MongoDB health error:", error);

        res.status(500).json({
            status: "ERROR",
            message: "MongoDB connection failed.",
            mongoUriConfigured: !!process.env.MONGODB_URI,
            error: error.message
        });
    }
});
// =====================================================
// REGISTER NFC
// =====================================================

app.post("/api/nfc/register", async (req, res) => {

    try {

        // Connect before doing database work
        await connectMongoDB();

        const {
            name,
            course,
            item
        } = req.body;


        // Validate fields
        if (!name || !course || !item) {

            return res.status(400).json({
                message: "Please fill all fields."
            });

        }


        // Create NFC ID
        const nfcId =
            "TNF-" +
            Date.now()
                .toString(36)
                .toUpperCase();


        // Create document
        const newNFC = new NFC({
            nfcId,
            name,
            course,
            item
        });


        // Save to MongoDB
        const savedNFC =
            await newNFC.save();


        console.log(
            "NFC registered:",
            savedNFC.nfcId
        );


        // Send response
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
// GET ONE NFC BY ID
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
// LOCAL HTML ROUTES
// =====================================================

// These are mainly useful when running:
// node server.js

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


// =====================================================
// EXPORT EXPRESS APP
// =====================================================

// Required by:
// netlify/functions/api.js

module.exports = app;


// =====================================================
// LOCAL SERVER ONLY
// =====================================================

// This runs only when you execute:
// node server.js
//
// Netlify imports the app instead, so it does not
// start a localhost server.

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
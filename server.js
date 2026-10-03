require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

console.log("Starting server...");
console.log("MongoDB URI loaded:", !!process.env.MONGODB_URI);

if (process.env.MONGODB_URI) {
    mongoose
        .connect(process.env.MONGODB_URI)
        .then(() => console.log("MongoDB connected!"))
        .catch((error) =>
            console.error(
                "MongoDB connection failed:",
                error.message
            )
        );
} else {
    console.error("MONGODB_URI is not defined!");
}


// ===============================
// NFC SCHEMA
// ===============================

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

const NFC = mongoose.model("NFC", nfcSchema);


// ===============================
// REGISTER NFC
// ===============================

app.post("/api/nfc/register", async (req, res) => {

    try {

        const { name, course, item } = req.body;

        if (!name || !course || !item) {

            return res.status(400).json({
                message: "Please fill all fields."
            });

        }

        const nfcId =
            "TNF-" +
            Date.now()
                .toString(36)
                .toUpperCase();

        const newNFC = new NFC({
            nfcId,
            name,
            course,
            item
        });

        const savedNFC =
            await newNFC.save();

        console.log(
            "NFC registered:",
            savedNFC.nfcId
        );

        res.status(201).json({

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

        res.status(500).json({

            message:
                "Registration failed.",

            error:
                error.message

        });

    }

});


// ===============================
// GET ALL NFC
// ===============================

app.get("/api/nfc/all", async (req, res) => {

    try {

        const records =
            await NFC
                .find()
                .sort({
                    createdAt: -1
                });

        res.json(records);

    } catch (error) {

        console.error(
            "FETCH ERROR:",
            error
        );

        res.status(500).json({

            message:
                "Failed to retrieve records."

        });

    }

});


// ===============================
// GET ONE NFC
// ===============================

app.get("/api/nfc/:nfcId", async (req, res) => {

    try {

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

        res.json(record);

    } catch (error) {

        console.error(
            "FETCH ERROR:",
            error
        );

        res.status(500).json({

            message:
                "Failed to retrieve NFC."

        });

    }

});


// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", async (req, res) => {

    try {

        await mongoose.connection
            .asPromise();

        res.json({

            status: "OK",

            message:
                "Tap N Found API is running.",

            database:
                "MongoDB connected"

        });

    } catch (error) {

        res.status(500).json({

            status: "ERROR",

            message:
                "MongoDB connection failed.",

            error:
                error.message

        });

    }

});


// ===============================
// HTML ROUTES
// ===============================

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


// ===============================
// EXPORT APP
// ===============================

module.exports = app;


// ===============================
// LOCAL SERVER ONLY
// ===============================

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
const express = require("express");
const router = express.Router();
const streakController = require("../controllers/Streakcontroller");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, streakController.getStreakStatus);
router.post("/claim", authMiddleware, streakController.claimStreak);

module.exports = router;
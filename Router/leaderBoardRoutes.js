const express = require("express");
const router = express.Router();
const leaderboardController = require("../controllers/leaderBoardController");
const authMiddleware = require("../middleware/authMiddleware");

// Public — anyone can see top 50
router.get("/", leaderboardController.getLeaderboard);

// Protected — user sees their own rank
router.get("/me", authMiddleware, leaderboardController.getMyRank);

module.exports = router;
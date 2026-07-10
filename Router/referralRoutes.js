const express = require("express");
const router = express.Router();
const referralController = require("../controllers/referralController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/link", authMiddleware, referralController.getReferralLink);
router.get("/history", authMiddleware, referralController.getReferralHistory);

module.exports = router;
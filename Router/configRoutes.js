const express = require("express");
const router = express.Router();
const configController = require("../controllers/appConfigController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/roleMiddleware");

// Public — frontend reads this for calculator + spin cost
router.get("/config", authMiddleware, configController.getPublicConfig);

// Admin
router.get("/admin/config", authMiddleware, adminMiddleware('admin'), configController.adminGetConfig);
router.patch("/admin/config", authMiddleware, adminMiddleware('admin'), configController.adminUpdateConfig);

module.exports = router;
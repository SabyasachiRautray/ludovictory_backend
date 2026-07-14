const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/tokenPurchaseController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/roleMiddleware");

// ── User ──────────────────────────────────────────────────────────────────────
router.get("/token-packages", authMiddleware, ctrl.getPackages);
router.post("/token-purchases", authMiddleware, ctrl.submitPurchase);
router.get("/token-purchases/my", authMiddleware, ctrl.myPurchases);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post("/admin/token-packages", authMiddleware, adminMiddleware('admin'), ctrl.createPackage);
router.get("/admin/token-packages", authMiddleware, adminMiddleware('admin'), ctrl.adminGetPackages);
router.patch("/admin/token-packages/:id", authMiddleware, adminMiddleware('admin'), ctrl.updatePackage);
router.delete("/admin/token-packages/:id", authMiddleware, adminMiddleware('admin'), ctrl.deletePackage);
router.get("/admin/token-purchases", authMiddleware, adminMiddleware('admin'), ctrl.adminGetPurchases);
router.patch("/admin/token-purchases/:id", authMiddleware, adminMiddleware('admin'), ctrl.reviewPurchase);

module.exports = router;
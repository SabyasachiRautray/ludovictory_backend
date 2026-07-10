const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload")

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/send-otp", authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/recent-users", authController.getRecentUsers);

// ─── Forgot password (public — 3 steps) ──────────────────────────────────────
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-forgot-otp", authController.verifyForgotOtp);
router.post("/reset-password", authController.resetPassword);

// ─── User (protected) ─────────────────────────────────────────────────────────
router.get("/user/me", authMiddleware, authController.getUserById);
router.patch("/user/me", authMiddleware,upload.single("profile_image"), authController.updateMe);
router.get("/users", authMiddleware, authController.getAllUsers);
// Protected — user's own transaction history
router.get("/user/transactions", authMiddleware, authController.getMyTransactions);

// ─── Admin (protected + admin role) ──────────────────────────────────────────
router.post("/admin/users", authMiddleware, adminMiddleware("admin"), authController.adminCreateUser);
router.get("/admin/users/:id", authMiddleware, adminMiddleware("admin"), authController.getUserById);
router.patch("/admin/users/:id", authMiddleware, adminMiddleware("admin"),upload.single("profile_image"), authController.adminUpdateUser);
router.delete("/admin/users/:id", authMiddleware, adminMiddleware("admin"), authController.adminDeleteUser);

module.exports = router;
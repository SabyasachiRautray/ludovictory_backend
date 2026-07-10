// order.routes.js
const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/roleMiddleware");

// User
router.post("/redeem", authMiddleware, orderController.redeemProduct);
router.get("/my", authMiddleware, orderController.myOrders);

// Admin
router.get("/admin/all", authMiddleware, adminMiddleware("admin"), orderController.adminGetOrders);
router.get("/admin/:id", authMiddleware, adminMiddleware("admin"), orderController.adminGetOrderById);
router.patch("/admin/:id", authMiddleware, adminMiddleware("admin"), orderController.adminUpdateOrderStatus);

module.exports = router;
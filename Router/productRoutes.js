// product.routes.js
const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/upload")

// User
router.get("/", productController.getProducts);
router.get("/:id", authMiddleware, productController.getProductById);

// Admin
router.post("/admin", authMiddleware, adminMiddleware("admin"),upload.single("image"), productController.createProduct);
router.get("/admin/all", authMiddleware, adminMiddleware("admin"), productController.adminGetProducts);
router.patch("/admin/:id", authMiddleware, adminMiddleware("admin"),upload.single("image"), productController.updateProduct);
router.delete("/admin/:id", authMiddleware, adminMiddleware("admin"), productController.deleteProduct);

module.exports = router;
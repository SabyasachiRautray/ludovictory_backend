const express = require("express")
const router = express.Router();
const spinnerController = require("../controllers/spinnerController")
const authMiddleware  = require("../middleware/authMiddleware")
const adminMiddleware = require("../middleware/roleMiddleware")

// Public — frontend needs this to render the wheel
router.get("/segments", spinnerController.getSegments);

// Admin
router.post("/segments/bulk", authMiddleware, adminMiddleware("admin"), spinnerController.bulkUpsertSegments);
router.patch("/segments/:id", authMiddleware, adminMiddleware("admin"), spinnerController.updateSegment);
router.delete("/segments/bulk-delete", authMiddleware, adminMiddleware("admin"), spinnerController.bulkDeleteSegments);

// User
router.post("/spin", authMiddleware, spinnerController.spin);
router.get("/history", authMiddleware, spinnerController.getHistory);

module.exports = router;
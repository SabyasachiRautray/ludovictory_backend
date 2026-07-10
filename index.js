require("dotenv").config()
const express = require("express")
const cors = require("cors")
const db = require("./db/db-connection")
const authRoutes = require("./Router/authRoutes")
const spinnerRoutes = require("./Router/spinnerRoutes");
const productRoutes = require("./router/productRoutes");
const orderRoutes = require("./router/orderRoutes");
const leaderboardRoutes = require("./Router/leaderBoardRoutes");
const referralRoutes = require("./Router/referralRoutes")


const app = express();


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/spinner", spinnerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/referral", referralRoutes);

//start the server

const PORT = process.env.APP_PORT || 5000;
app.listen(PORT, async () => {
  try {
    await db.sequelize.authenticate();
    console.log(`✅ Database connected`);
    console.log(`Server is running on port ${PORT}`);
  } catch (error) {
    console.error("❌ Unable to connect to DB:", error);
  }
});
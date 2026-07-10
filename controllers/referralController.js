const db = require("../db/db-connection");
const { referral: Referral, user: User } = db;
const { Op } = require("sequelize");

// ─── GET /api/referral/link ───────────────────────────────────────────────────
// Protected — returns user's shareable referral link + stats
exports.getReferralLink = async (req, res) => {
  try {
    const user_id = req.user.id;

    const user = await User.findByPk(user_id, {
      attributes: ["referral_code"],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const base_url = process.env.APP_URL || "https://yourapp.com";
    const referral_link = `${base_url}/register?ref=${user.referral_code}`;

    // Count completed referrals made by this user
    const total_referrals = await Referral.count({
      where: {
        referrer_id: user_id,
        status: "completed",
      },
    });

    // Pending referrals (signed up but bonus not yet credited)
    const pending_referrals = await Referral.count({
      where: {
        referrer_id: user_id,
        status: "pending",
      },
    });

    return res.status(200).json({
      data: {
        referral_code: user.referral_code,
        referral_link,
        total_referrals,
        pending_referrals,
        tokens_per_referral: 200, // referrer bonus — for display on frontend
      },
    });
  } catch (err) {
    console.error("[getReferralLink]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET /api/referral/history ────────────────────────────────────────────────
// Protected — list of people this user has referred
exports.getReferralHistory = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Referral.findAndCountAll({
      where: { referrer_id: user_id },
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
      attributes: [
        "id",
        "referral_code_used",
        "referrer_bonus",
        "referrer_bonus_credited",
        "status",
        "created_at",
      ],
      include: [
        {
          model: User,
          as: "referredUser",
          attributes: ["id", "full_name", "username", "created_at"],
        },
      ],
    });

    return res.status(200).json({
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("[getReferralHistory]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
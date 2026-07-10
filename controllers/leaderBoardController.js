const db = require("../db/db-connection");
const { leaderboard: Leaderboard, user: User } = db;
const { Op } = require("sequelize");

// ─── GET /api/leaderboard ─────────────────────────────────────────────────────
// Public — Top 50 ranked users
exports.getLeaderboard = async (req, res) => {
  try {
    const entries = await Leaderboard.findAll({
      where: {
        rank: { [Op.not]: null, [Op.lte]: 50 },
      },
      order: [["rank", "ASC"]],
      limit: 50,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "username", "profile_image"],
        },
      ],
      attributes: [
        "rank",
        "total_shopping_tokens_earned",
        "total_spins",
        "total_referrals",
      ],
    });

    return res.status(200).json({ data: entries });
  } catch (err) {
    console.error("[getLeaderboard]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET /api/leaderboard/me ──────────────────────────────────────────────────
// Protected — logged-in user's own rank + score
exports.getMyRank = async (req, res) => {
  try {
    const user_id = req.user.id;

    const entry = await Leaderboard.findOne({
      where: { user_id },
      attributes: [
        "rank",
        "total_shopping_tokens_earned",
        "total_spins",
        "total_referrals",
      ],
    });

    if (!entry) {
      return res.status(200).json({
        data: {
          rank: null,
          total_shopping_tokens_earned: 0,
          total_spins: 0,
          total_referrals: 0,
          message: "Spin the wheel to appear on the leaderboard",
        },
      });
    }

    return res.status(200).json({ data: entry });
  } catch (err) {
    console.error("[getMyRank]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const db = require("../db/db-connection");
const { invalidateCache, getConfig } = require("../services/configService");

// ─── GET /api/config ──────────────────────────────────────────────────────────
// Public — frontend needs token_rate and spin_cost at minimum
exports.getPublicConfig = async (req, res) => {
  try {
    const cfg = await getConfig();

    // Only expose what the frontend needs — don't expose everything
    return res.status(200).json({
      data: {
        token_rate:     parseInt(cfg.token_rate     ?? 1000),
        spin_cost:      parseInt(cfg.spin_cost      ?? 1),
        signup_bonus:   parseInt(cfg.signup_bonus   ?? 100),
        referrer_bonus: parseInt(cfg.referrer_bonus ?? 200),
        referred_bonus: parseInt(cfg.referred_bonus ?? 100),
      },
    });
  } catch (err) {
    console.error("[getPublicConfig]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET /api/admin/config ────────────────────────────────────────────────────
// Admin — full config with descriptions
exports.adminGetConfig = async (req, res) => {
  try {
    const rows = await db.app_config.findAll({ order: [["key", "ASC"]] });
    return res.status(200).json({ data: rows });
  } catch (err) {
    console.error("[adminGetConfig]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── PATCH /api/admin/config ──────────────────────────────────────────────────
// Admin — update one or more config values
// Body: { token_rate: "2000", spin_cost: "2" } — any subset of keys
exports.adminUpdateConfig = async (req, res) => {
  try {
    const allowed = [
      "token_rate",
      "referrer_bonus",
      "referred_bonus",
      "signup_bonus",
      "spin_cost",
    ];

    const updates = Object.entries(req.body).filter(([key]) => allowed.includes(key));

    if (!updates.length) {
      return res.status(400).json({ message: "No valid config keys provided" });
    }

    // Validate all values are positive integers
    for (const [key, val] of updates) {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 0) {
        return res.status(400).json({ message: `${key} must be a non-negative integer` });
      }
    }

    // Upsert each key
    for (const [key, val] of updates) {
      await db.app_config.update(
        { value: String(parseInt(val, 10)) },
        { where: { key } }
      );
    }

    // Bust the cache so next request picks up new values
    invalidateCache();

    const updated = await db.app_config.findAll({ order: [["key", "ASC"]] });
    return res.status(200).json({
      message: "Config updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("[adminUpdateConfig]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
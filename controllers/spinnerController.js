const db = require("../db/db-connection");
const { transferTokens } = require("../services/tokenServices");
const { updateLeaderboardScore } = require("../services/leaderBoardService")
const { Op } = require("sequelize");
const { getInt } = require("../services/configService")
const {
  spinner_segment: SpinnerSegment,
  spinner_result: SpinnerResult,
  sequelize,
} = db;


// this will be used to reduce the probability of getting a higher value item in the spinner
function pickWeightedSegment(segments) {
  const weights = segments.map((s) => parseFloat(s.weight));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let r = Math.random() * totalWeight;

  for (let i = 0; i < segments.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return segments[i];
  }

  // Fallback: pick the last segment with weight > 0, never a 0-weight one
  const fallbackPool = segments.filter((_, i) => weights[i] > 0);
  return fallbackPool[fallbackPool.length - 1] ?? segments[segments.length - 1];
}

// ─── GET /api/spinner/segments ───────────────────────────────────────────────
// Public | Query: ?page=1&limit=10&is_active=true&search=token&sort=display_order&order=ASC
exports.getSegments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      is_active,
      search,
      sort = "display_order",
      order = "ASC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    // Filter by active status if provided
    if (is_active !== undefined) {
      where.is_active = is_active === "true";
    }

    // Search by label
    if (search) {
      where.label = { [Op.like]: `%${search}%` };
    }

    // Whitelist sortable columns to prevent SQL injection
    const allowedSortColumns = ["display_order", "tokens_won", "label", "created_at"];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : "display_order";
    const sortOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";

    const { count, rows } = await SpinnerSegment.findAndCountAll({
      where,
      order: [[sortColumn, sortOrder]],
      limit: parseInt(limit),
      offset,
      attributes: ["id", "label", "tokens_won", "is_active", "display_order", "created_at"],
    });

    if (!rows.length) {
      return res.status(404).json({ message: "No segments found" });
    }

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
    console.error("[getSegments]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── POST /api/spinner/segments/bulk ─────────────────────────────────────────
// Admin | Bulk upsert segments — insert new, update existing (matched by id)
// Body: { segments: [{ id?, label, tokens_won, is_active, display_order }] }
exports.bulkUpsertSegments = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { segments } = req.body;

    if (!Array.isArray(segments) || !segments.length) {
      await t.rollback();
      return res.status(400).json({ message: "segments must be a non-empty array" });
    }

    // Validate each segment
    for (const [i, seg] of segments.entries()) {
      if (!seg.label || typeof seg.label !== "string") {
        await t.rollback();
        return res.status(400).json({ message: `segments[${i}]: label is required` });
      }
      if (seg.tokens_won === undefined || seg.tokens_won < 0) {
        await t.rollback();
        return res.status(400).json({ message: `segments[${i}]: tokens_won must be >= 0` });
      }
      if (seg.display_order === undefined) {
        await t.rollback();
        return res.status(400).json({ message: `segments[${i}]: display_order is required` });
      }
    }

    // Sequelize bulkCreate with updateOnDuplicate handles both insert and update
    const result = await SpinnerSegment.bulkCreate(segments, {
      updateOnDuplicate: ["label", "tokens_won", "is_active", "display_order", "updated_at"],
      transaction: t,
    });

    await t.commit();

    return res.status(200).json({
      message: `${result.length} segment(s) upserted successfully`,
      data: result,
    });
  } catch (err) {
    await t.rollback();
    console.error("[bulkUpsertSegments]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── PATCH /api/spinner/segments/:id ─────────────────────────────────────────
// Admin | Update a single segment by id
// Body: { label?, tokens_won?, is_active?, display_order? }
exports.updateSegment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { label, tokens_won, is_active, display_order } = req.body;

    const segment = await SpinnerSegment.findByPk(id, { transaction: t });

    if (!segment) {
      await t.rollback();
      return res.status(404).json({ message: "Segment not found" });
    }

    // Only update fields that were actually sent
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (tokens_won !== undefined) {
      if (tokens_won < 0) {
        await t.rollback();
        return res.status(400).json({ message: "tokens_won must be >= 0" });
      }
      updates.tokens_won = tokens_won;
    }
    if (is_active !== undefined) updates.is_active = is_active;
    if (display_order !== undefined) updates.display_order = display_order;

    if (!Object.keys(updates).length) {
      await t.rollback();
      return res.status(400).json({ message: "No valid fields provided to update" });
    }

    await segment.update(updates, { transaction: t });
    await t.commit();

    return res.status(200).json({
      message: "Segment updated successfully",
      data: segment,
    });
  } catch (err) {
    await t.rollback();
    console.error("[updateSegment]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── DELETE /api/spinner/segments/bulk-delete ────────────────────────────────
// Admin | Bulk delete segments by ids
// Body: { ids: [1, 2, 3] }
exports.bulkDeleteSegments = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      await t.rollback();
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }

    // Safety check — make sure all ids actually exist before deleting
    const found = await SpinnerSegment.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["id"],
      transaction: t,
    });

    if (found.length !== ids.length) {
      const foundIds = found.map((s) => s.id);
      const missing = ids.filter((id) => !foundIds.includes(id));
      await t.rollback();
      return res.status(404).json({
        message: `Segment(s) not found: ${missing.join(", ")}`,
      });
    }

    const deleted = await SpinnerSegment.destroy({
      where: { id: { [Op.in]: ids } },
      transaction: t,
    });

    await t.commit();

    return res.status(200).json({
      message: `${deleted} segment(s) deleted successfully`,
    });
  } catch (err) {
    await t.rollback();
    console.error("[bulkDeleteSegments]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── POST /api/spinner/spin ───────────────────────────────────────────────────
// Protected — unchanged
exports.spin = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user_id = req.user.id;

    const SPIN_COST = await getInt("spin_cost", 1);

    const segments = await SpinnerSegment.findAll({
      where: { is_active: true },
      transaction: t,
    });

    if (!segments.length) {
      await t.rollback();
      return res.status(400).json({ message: "Spinner is not configured" });
    }

    // ── Debit from REFERRAL wallet ────────────────────────────────────────────
    const { wallet } = await transferTokens({
      user_id,
      wallet_type: "referral",          // ← costs referral tokens
      type: "debit",
      source: "spinner_spin",
      tokens: SPIN_COST,
      remarks: "Spin cost",
      transaction: t,
    });

    const winner = pickWeightedSegment(segments);

    const spinResult = await SpinnerResult.create(
      {
        user_id,
        segment_id: winner.id,
        tokens_spent: SPIN_COST,
        tokens_won: winner.tokens_won,
        result_label: winner.label,
      },
      { transaction: t }
    );

    // ── Credit to SHOPPING wallet ─────────────────────────────────────────────
    let referral_balance_after = wallet.referral_token_balance;
    let shopping_balance_after = wallet.shopping_token_balance;

    if (winner.tokens_won > 0) {
      const { wallet: rewardedWallet } = await transferTokens({
        user_id,
        wallet_type: "shopping",          // ← rewards go to shopping tokens
        type: "credit",
        source: "spinner_reward",
        tokens: winner.tokens_won,
        reference_id: spinResult.id,
        remarks: `Spinner reward: ${winner.label}`,
        transaction: t,
      });
      shopping_balance_after = rewardedWallet.shopping_token_balance;

      // update leaderboard score
      await updateLeaderboardScore(user_id, winner.tokens_won, t);
    }

    await t.commit();

    return res.status(200).json({
      message: "Spin successful",
      data: {
        result_label: winner.label,
        tokens_won: winner.tokens_won,
        tokens_spent: SPIN_COST,
        referral_token_balance: referral_balance_after,
        shopping_token_balance: shopping_balance_after,
      },
    });
  } catch (err) {
    await t.rollback();
    if (err.message.startsWith("Insufficient referral tokens")) {
      return res.status(400).json({ message: "Not enough referral tokens to spin" });
    }
    console.error("[spin]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── GET /api/spinner/history ─────────────────────────────────────────────────
// Protected | Query: ?page=1&limit=20
exports.getHistory = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await SpinnerResult.findAndCountAll({
      where: { user_id },
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
      attributes: ["id", "result_label", "tokens_spent", "tokens_won", "created_at"],
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
    console.error("[getHistory]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
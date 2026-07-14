const db = require("../db/db-connection");
const { transferTokens } = require("../services/tokenServices");
const { Op } = require("sequelize");
const { getInt } = require("../services/configService")
const {
  token_package: TokenPackage,
  token_purchase: TokenPurchase,
  user: User,
  sequelize,
} = db;

// ─── ADMIN: Create package ────────────────────────────────────────────────────
// POST /api/admin/token-packages
// Body: { label, tokens, price, display_order? }
exports.createPackage = async (req, res) => {
  try {
    const { label, tokens, price, display_order = 0 } = req.body;

    if (!label || !tokens || !price) {
      return res.status(400).json({ message: "label, tokens and price are required" });
    }

    if (tokens < 1 || price < 1) {
      return res.status(400).json({ message: "tokens and price must be at least 1" });
    }

    const pkg = await TokenPackage.create({ label, tokens, price, display_order, is_active: true });

    return res.status(201).json({ message: "Package created", data: pkg });
  } catch (err) {
    console.error("[createPackage]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Update package ────────────────────────────────────────────────────
// PATCH /api/admin/token-packages/:id
exports.updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, tokens, price, is_active, display_order } = req.body;

    const pkg = await TokenPackage.findByPk(id);
    if (!pkg) return res.status(404).json({ message: "Package not found" });

    const updates = {};
    if (label !== undefined) updates.label = label;
    if (tokens !== undefined) updates.tokens = tokens;
    if (price !== undefined) updates.price = price;
    if (is_active !== undefined) updates.is_active = is_active;
    if (display_order !== undefined) updates.display_order = display_order;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No valid fields provided" });
    }

    await pkg.update(updates);
    return res.status(200).json({ message: "Package updated", data: pkg });
  } catch (err) {
    console.error("[updatePackage]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Delete package ────────────────────────────────────────────────────
// DELETE /api/admin/token-packages/:id
exports.deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await TokenPackage.findByPk(id);
    if (!pkg) return res.status(404).json({ message: "Package not found" });

    // Block if pending purchases exist
    const pending = await TokenPurchase.count({
      where: { package_id: id, status: "pending" },
    });
    if (pending > 0) {
      return res.status(409).json({
        message: `Cannot delete — ${pending} pending purchase(s) reference this package`,
      });
    }

    await pkg.destroy();
    return res.status(200).json({ message: "Package deleted" });
  } catch (err) {
    console.error("[deletePackage]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Get all packages ──────────────────────────────────────────────────
// GET /api/admin/token-packages
exports.adminGetPackages = async (req, res) => {
  try {
    const packages = await TokenPackage.findAll({
      order: [["display_order", "ASC"], ["created_at", "ASC"]],
    });
    return res.status(200).json({ data: packages });
  } catch (err) {
    console.error("[adminGetPackages]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER: Get active packages ────────────────────────────────────────────────
// GET /api/token-packages
exports.getPackages = async (req, res) => {
  try {
    const packages = await TokenPackage.findAll({
      where: { is_active: true },
      order: [["display_order", "ASC"], ["price", "ASC"]],
      attributes: ["id", "label", "tokens", "price", "display_order"],
    });
    return res.status(200).json({ data: packages });
  } catch (err) {
    console.error("[getPackages]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER: Submit purchase request ───────────────────────────────────────────
// POST /api/token-purchases
// Body: { package_id, utr_number }
exports.submitPurchase = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user_id = req.user.id;
    const { package_id, utr_number, tokens, amount } = req.body;

    // ── Validate UTR ───────────────────────────────────────────────
    if (!utr_number) {
      await t.rollback();
      return res.status(400).json({ message: "utr_number is required" });
    }

    const utr = utr_number.trim();
    if (utr.length < 6 || utr.length > 50) {
      await t.rollback();
      return res.status(400).json({ message: "UTR number must be 6–50 characters" });
    }

    // ── Duplicate UTR check ────────────────────────────────────────
    const duplicate = await TokenPurchase.findOne({
      where: { utr_number: utr },
      transaction: t,
    });
    if (duplicate) {
      await t.rollback();
      return res.status(409).json({ message: "This UTR number has already been submitted" });
    }

    let tokens_purchased, amount_paid, pkg_id;

    if (package_id) {
      // ── Package-based purchase ─────────────────────────────────
      const pkg = await TokenPackage.findOne({
        where: { id: package_id, is_active: true },
        transaction: t,
      });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ message: "Package not found or inactive" });
      }
      tokens_purchased = pkg.tokens;
      amount_paid      = pkg.price;
      pkg_id           = pkg.id;

    } else if (tokens && amount) {
      // ── Calculator-based custom purchase ───────────────────────
      const parsedTokens = parseInt(tokens, 10);
      const parsedAmount = parseFloat(amount);

      if (parsedTokens < 1 || parsedAmount < 1) {
        await t.rollback();
        return res.status(400).json({ message: "tokens and amount must be at least 1" });
      }

      // Verify token count matches amount at current rate
      const rateConfig = await db.app_config.findOne({ where: { key: "token_rate" } });
      const TOKEN_RATE = rateConfig ? parseInt(rateConfig.value, 10) : 1000;
      const expectedTokens = Math.floor(parsedAmount * TOKEN_RATE);

      // Allow ±1 rounding tolerance
      if (Math.abs(parsedTokens - expectedTokens) > 1) {
        await t.rollback();
        return res.status(400).json({
          message: `Token count doesn't match the current rate. Expected ~${expectedTokens} tokens for ₹${parsedAmount}`,
        });
      }

      tokens_purchased = parsedTokens;
      amount_paid      = parsedAmount;
      pkg_id           = null; // no package for custom

    } else {
      await t.rollback();
      return res.status(400).json({
        message: "Provide either package_id OR tokens + amount",
      });
    }

    // ── Create purchase record ─────────────────────────────────────
    const purchase = await TokenPurchase.create(
      {
        user_id,
        package_id: pkg_id,
        tokens_purchased,
        amount_paid,
        utr_number: utr,
        status: "pending",
      },
      { transaction: t }
    );

    await t.commit();

    return res.status(201).json({
      message: "Purchase request submitted. Admin will verify and credit tokens shortly.",
      data: {
        id:               purchase.id,
        tokens_purchased: purchase.tokens_purchased,
        amount_paid:      purchase.amount_paid,
        utr_number:       purchase.utr_number,
        status:           purchase.status,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[submitPurchase]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER: My purchase history ────────────────────────────────────────────────
// GET /api/token-purchases/my?page=1&limit=10
exports.myPurchases = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await TokenPurchase.findAndCountAll({
      where: { user_id },
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
      attributes: [
        "id", "tokens_purchased", "amount_paid",
        "utr_number", "status", "rejection_reason",
        "reviewed_at", "created_at",
      ],
      include: [
        {
          model: TokenPackage,
          as: "package",
          attributes: ["id", "label", "tokens", "price"],
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
    console.error("[myPurchases]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Get all purchases ─────────────────────────────────────────────────
// GET /api/admin/token-purchases?page=1&limit=10&status=pending&search=
exports.adminGetPurchases = async (req, res) => {
  try {
    const {
      page = 1, limit = 10,
      status, search,
      sort = "created_at", order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status) where.status = status;

    const userWhere = {};
    if (search) {
      userWhere[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { mobile: { [Op.like]: `%${search}%` } },
      ];
    }

    const allowedSort = ["created_at", "amount_paid", "tokens_purchased", "status"];
    const sortColumn = allowedSort.includes(sort) ? sort : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await TokenPurchase.findAndCountAll({
      where,
      order: [[sortColumn, sortOrder]],
      limit: parseInt(limit),
      offset,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "email", "mobile", "username"],
          where: Object.keys(userWhere).length ? userWhere : undefined,
        },
        {
          model: TokenPackage,
          as: "package",
          attributes: ["id", "label", "tokens", "price"],
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
    console.error("[adminGetPurchases]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Review purchase (approve / reject) ────────────────────────────────
// PATCH /api/admin/token-purchases/:id
// Body: { action: "approve" | "reject", rejection_reason? }
exports.reviewPurchase = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body;
    const admin_id = req.user.id;

    if (!["approve", "reject"].includes(action)) {
      await t.rollback();
      return res.status(400).json({ message: "action must be approve or reject" });
    }

    const purchase = await TokenPurchase.findByPk(id, {
      include: [
        { model: User, as: "user", attributes: ["id", "full_name", "email"] },
        { model: TokenPackage, as: "package", attributes: ["label"] },
      ],
      transaction: t,
    });

    if (!purchase) {
      await t.rollback();
      return res.status(404).json({ message: "Purchase not found" });
    }

    if (purchase.status !== "pending") {
      await t.rollback();
      return res.status(400).json({
        message: `Purchase is already ${purchase.status} and cannot be reviewed again`,
      });
    }

    if (action === "approve") {
      // Credit shopping tokens to user's wallet
      await transferTokens({
        user_id: purchase.user_id,
        wallet_type: "shopping",
        type: "credit",
        source: "token_purchase",
        tokens: purchase.tokens_purchased,
        reference_id: purchase.id,
        remarks: `Purchased ${purchase.tokens_purchased} shopping tokens — UTR: ${purchase.utr_number}`,
        transaction: t,
      });

      await purchase.update(
        {
          status: "approved",
          reviewed_by: admin_id,
          reviewed_at: new Date(),
        },
        { transaction: t }
      );

      await t.commit();

      return res.status(200).json({
        message: `Approved — ${purchase.tokens_purchased} shopping tokens credited to ${purchase.user?.full_name}`,
        data: { id: purchase.id, status: "approved" },
      });
    } else {
      // Reject — no token movement
      if (!rejection_reason || !rejection_reason.trim()) {
        await t.rollback();
        return res.status(400).json({ message: "rejection_reason is required when rejecting" });
      }

      await purchase.update(
        {
          status: "rejected",
          rejection_reason: rejection_reason.trim(),
          reviewed_by: admin_id,
          reviewed_at: new Date(),
        },
        { transaction: t }
      );

      await t.commit();

      return res.status(200).json({
        message: "Purchase rejected",
        data: { id: purchase.id, status: "rejected" },
      });
    }
  } catch (err) {
    await t.rollback();
    console.error("[reviewPurchase]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const db = require("../db/db-connection");
const { transferTokens } = require("../services/tokenServices");
const { Op } = require("sequelize");

const {
  product: Product,
  order: Order,
  user: User,
  wallet: Wallet,
  sequelize,
} = db;

// ─── USER: Redeem product ─────────────────────────────────────────────────────

// POST /api/orders/redeem
// Body: { product_id }
exports.redeemProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user_id = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      await t.rollback();
      return res.status(400).json({ message: "product_id is required" });
    }

    // Lock product row to prevent overselling
    const product = await Product.findOne({
      where: { id: product_id, is_active: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Product not found or inactive" });
    }

    if (product.stock < 1) {
      await t.rollback();
      return res.status(400).json({ message: "Product is out of stock" });
    }

    // Deduct tokens — throws if insufficient balance
    await transferTokens({
      user_id,
      wallet_type: "shopping",
      type: "debit",
      source: "product_redemption",
      tokens: product.token_cost,
      remarks: `Redeemed: ${product.name}`,
      transaction: t,
    });

    // Decrement stock
    await product.decrement("stock", { by: 1, transaction: t });

    // Create order
    const order = await Order.create(
      {
        user_id,
        product_id,
        tokens_spent: product.token_cost,
        product_name_snapshot: product.name,
        status: "pending",
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(201).json({
      message: "Product redeemed successfully",
      data: {
        order_id: order.id,
        product: product.name,
        tokens_spent: product.token_cost,
        status: order.status,
      },
    });
  } catch (err) {
    await t.rollback();

    if (err.message.startsWith("Insufficient balance")) {
      return res
        .status(400)
        .json({ message: "Not enough tokens to redeem this product" });
    }

    console.error("[redeemProduct]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER: My orders ──────────────────────────────────────────────────────────

// GET /api/orders/my
// Query: ?page=1&limit=10&status=pending
exports.myOrders = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { user_id };
    if (status) where.status = status;

    const { count, rows } = await Order.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: parseInt(limit),
      offset,
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "image_url", "token_cost"],
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
    console.error("[myOrders]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Get all orders ────────────────────────────────────────────────────

// GET /api/admin/orders
// Query: ?page=1&limit=10&status=pending&search=john
exports.adminGetOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sort = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (status) where.status = status;

    // Search by user name/email/mobile via association
    const userWhere = {};
    if (search) {
      userWhere[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { mobile: { [Op.like]: `%${search}%` } },
      ];
    }

    const allowedSort = ["created_at", "tokens_spent", "status"];
    const sortColumn = allowedSort.includes(sort) ? sort : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await Order.findAndCountAll({
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
          model: Product,
          as: "product",
          attributes: ["id", "name", "image_url"],
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
    console.error("[adminGetOrders]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Update order status ───────────────────────────────────────────────

// PATCH /api/admin/orders/:id
// Body: { status, admin_note? }
// pending → processing → delivered
// any status → cancelled (triggers token refund)
exports.adminUpdateOrderStatus = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, admin_note } = req.body;

    const validStatuses = ["pending", "processing", "delivered", "cancelled"];
    if (!status || !validStatuses.includes(status)) {
      await t.rollback();
      return res
        .status(400)
        .json({
          message: `status must be one of: ${validStatuses.join(", ")}`,
        });
    }

    const order = await Order.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "email", "mobile"],
        },
        { model: Product, as: "product", attributes: ["id", "name"] },
      ],
      transaction: t,
    });

    if (!order) {
      await t.rollback();
      return res.status(404).json({ message: "Order not found" });
    }

    // Prevent nonsensical status transitions
    if (order.status === "delivered" || order.status === "cancelled") {
      await t.rollback();
      return res.status(400).json({
        message: `Order is already ${order.status} and cannot be updated`,
      });
    }

    // If cancelling — refund tokens and restore stock
    if (status === "cancelled") {
      await transferTokens({
        user_id: order.user_id,
        wallet_type: "shopping", // refund goes back to shopping tokens
        type: "credit",
        source: "product_refund",
        tokens: order.tokens_spent,
        reference_id: order.id,
        remarks: `Refund for cancelled order #${order.id}: ${order.product_name_snapshot}`,
        transaction: t,
      });

      // Restore stock
      await Product.increment("stock", {
        by: 1,
        where: { id: order.product_id },
        transaction: t,
      });
    }

    await order.update(
      {
        status,
        admin_note: admin_note || order.admin_note,
      },
      { transaction: t },
    );

    await t.commit();

    return res.status(200).json({
      message: `Order marked as ${status}`,
      data: {
        order_id: order.id,
        status: order.status,
        user: order.user,
        product: order.product,
        tokens_spent: order.tokens_spent,
        admin_note: order.admin_note,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error("[adminUpdateOrderStatus]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Get single order ──────────────────────────────────────────────────

// GET /api/admin/orders/:id
exports.adminGetOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "full_name", "email", "mobile", "username"],
        },
        {
          model: Product,
          as: "product",
          attributes: ["id", "name", "image_url", "token_cost"],
        },
      ],
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.status(200).json({ data: order });
  } catch (err) {
    console.error("[adminGetOrderById]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

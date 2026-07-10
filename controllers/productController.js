const db = require("../db/db-connection");
const { Op } = require("sequelize");
const {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");

const { product: Product, order: Order, sequelize } = db;

// ─── ADMIN: Create product ────────────────────────────────────────────────────

// POST /api/admin/products
// Body: { name, description?, image_url?, token_cost, stock? }
exports.createProduct = async (req, res) => {
  try {
    const { name, description, token_cost, stock = 0 } = req.body;

    if (!name || !token_cost) {
      return res.status(400).json({
        message: "name and token_cost are required",
      });
    }

    if (token_cost < 1) {
      return res.status(400).json({
        message: "token_cost must be at least 1",
      });
    }

    let image_url = null;
    let image_public_id = null;

    if (req.file) {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        "products",
      );

      image_url = result.secure_url;
      image_public_id = result.public_id;
    }

    const product = await Product.create({
      name,
      description,
      token_cost,
      stock,
      image_url,
      image_public_id,
      is_active: true,
    });
    return res.status(201).json({
      message: "Created",
      data: product,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// ─── ADMIN: Update product ────────────────────────────────────────────────────

// PATCH /api/admin/products/:id
// Body: { name?, description?, image_url?, token_cost?, stock?, is_active? }
exports.updateProduct = async (req, res) => {
  const t = await sequelize.transaction();
   let uploadedImage = null;
  try {
    const { id } = req.params;
    const { name, description,  token_cost, stock, is_active } =
      req.body;

    const product = await Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    if (token_cost !== undefined && token_cost < 1) {
      await t.rollback();
      return res.status(400).json({ message: "token_cost must be at least 1" });
    }

    if (stock !== undefined && stock < 0) {
      await t.rollback();
      return res.status(400).json({ message: "stock cannot be negative" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (req.file) {
      uploadedImage = await uploadBufferToCloudinary(
        req.file.buffer,
        "products",
      );

      updates.image_url = uploadedImage.secure_url;
      updates.image_public_id = uploadedImage.public_id;
    }
    if (token_cost !== undefined) updates.token_cost = token_cost;
    if (stock !== undefined) updates.stock = stock;
    if (is_active !== undefined) updates.is_active = is_active;

    if (!Object.keys(updates).length) {
      await t.rollback();
      return res.status(400).json({ message: "No valid fields provided" });
    }

    await product.update(updates, { transaction: t });
    await t.commit();
    if (uploadedImage && product.image_public_id) {
      await deleteFromCloudinary(product.image_public_id);
    }

    return res.status(200).json({
      message: "Product updated successfully",
      data: product,
    });
  } catch (err) {
    await t.rollback();

    if (uploadedImage) {
      await deleteFromCloudinary(uploadedImage.public_id);
    }

    console.error("[updateProduct]", err);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// ─── ADMIN: Delete product ────────────────────────────────────────────────────

// DELETE /api/admin/products/:id
// Blocked if product has any pending or processing orders
exports.deleteProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ message: "Product not found" });
    }

    // Block deletion if active orders exist
    const activeOrders = await Order.count({
      where: {
        product_id: id,
        status: { [Op.in]: ["pending", "processing"] },
      },
      transaction: t,
    });

    if (activeOrders > 0) {
      await t.rollback();
      return res.status(409).json({
        message: `Cannot delete — ${activeOrders} active order(s) exist for this product`,
      });
    }
    if (product.image_public_id) {
      await deleteFromCloudinary(product.image_public_id);
    }
    await product.destroy({ transaction: t });
    await t.commit();

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (err) {
    await t.rollback();
    console.error("[deleteProduct]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── ADMIN: Get all products ──────────────────────────────────────────────────

// GET /api/admin/products
// Query: ?page=1&limit=10&search=&is_active=true&sort=created_at&order=DESC
exports.adminGetProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      is_active,
      sort = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (search) where.name = { [Op.like]: `%${search}%` };
    if (is_active !== undefined) where.is_active = is_active === "true";

    const allowedSort = ["created_at", "name", "token_cost", "stock"];
    const sortColumn = allowedSort.includes(sort) ? sort : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await Product.findAndCountAll({
      where,
      order: [[sortColumn, sortOrder]],
      limit: parseInt(limit),
      offset,
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
    console.error("[adminGetProducts]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER: Get active products ────────────────────────────────────────────────

// GET /api/products
// Query: ?page=1&limit=10&search=&sort=token_cost&order=ASC
exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sort = "created_at",
      order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { is_active: true, stock: { [Op.gt]: 0 } };
    if (search) where.name = { [Op.like]: `%${search}%` };

    const allowedSort = ["created_at", "name", "token_cost"];
    const sortColumn = allowedSort.includes(sort) ? sort : "created_at";
    const sortOrder = order.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { count, rows } = await Product.findAndCountAll({
      where,
      order: [[sortColumn, sortOrder]],
      limit: parseInt(limit),
      offset,
      attributes: [
        "id",
        "name",
        "description",
        "image_url",
        "token_cost",
        "stock",
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
    console.error("[getProducts]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ─── USER/ADMIN: Get single product ──────────────────────────────────────────

// GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product || (!product.is_active && req.user?.role !== "admin")) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json({ data: product });
  } catch (err) {
    console.error("[getProductById]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

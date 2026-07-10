module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    "order",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT", // Don't delete product if orders exist
      },

      // Snapshot at time of order — product price may change later
      tokens_spent: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // Snapshot of product name at time of order
      product_name_snapshot: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      status: {
        // pending   → order placed, tokens deducted
        // processing → admin acknowledged, being prepared
        // delivered  → admin marked as delivered
        // cancelled  → admin cancelled, tokens refunded
        type: DataTypes.ENUM("pending", "processing", "delivered", "cancelled"),
        defaultValue: "pending",
      },

      // Admin can add a note e.g. tracking info or cancellation reason
      admin_note: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  Order.associate = function (models) {
    Order.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });

    Order.belongsTo(models.product, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return Order;
};
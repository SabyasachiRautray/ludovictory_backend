module.exports = (sequelize, DataTypes) => {
  const TokenPurchase = sequelize.define(
    "token_purchase",
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

      package_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "token_packages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // Snapshot at time of purchase — package price may change later
      tokens_purchased: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      amount_paid: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },

      // UTR / transaction reference number entered by user
      utr_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },

      status: {
        // pending  → submitted by user, waiting for admin
        // approved → admin verified, tokens credited
        // rejected → admin rejected, tokens NOT credited
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        defaultValue: "pending",
      },

      // Admin fills this on rejection
      rejection_reason: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // Admin who approved/rejected
      reviewed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      underscored: true,
    },
  );

  TokenPurchase.associate = function (models) {
    TokenPurchase.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });

    TokenPurchase.belongsTo(models.token_package, {
      foreignKey: "package_id",
      as: "package",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    TokenPurchase.belongsTo(models.user, {
      foreignKey: "reviewed_by",
      as: "reviewer",
    });
  };

  return TokenPurchase;
};

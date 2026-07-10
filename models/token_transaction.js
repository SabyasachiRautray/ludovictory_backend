module.exports = (sequelize, DataTypes) => {
  const TokenTransaction = sequelize.define(
    "token_transaction",
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

      // Which balance this transaction touched
      wallet_type: {
        type: DataTypes.ENUM("referral", "shopping"),
        allowNull: false,
      },

      type: {
        type: DataTypes.ENUM("credit", "debit"),
        allowNull: false,
      },

      source: {
        type: DataTypes.ENUM(
          // referral wallet sources
          "signup_bonus",
          "referral_bonus_referrer",
          "referral_bonus_referred",
          "spinner_spin",           // debit from referral wallet
          // shopping wallet sources
          "spinner_reward",         // credit to shopping wallet
          "product_redemption",     // debit from shopping wallet
          "product_refund"          // credit to shopping wallet on cancel
          // Future: "prize_redemption", "game_win", "game_loss"
        ),
        allowNull: false,
      },

      tokens: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1 },
      },

      // Snapshot of the affected wallet balance after this transaction
      balance_after: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 0 },
      },

      reference_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      remarks: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  TokenTransaction.associate = function (models) {
    TokenTransaction.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return TokenTransaction;
};
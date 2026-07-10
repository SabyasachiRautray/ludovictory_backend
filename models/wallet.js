module.exports = (sequelize, DataTypes) => {
  const Wallet = sequelize.define(
    "wallet",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // Earned via signup + referrals — spent on spinner
      referral_token_balance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },

      // Earned via spinner rewards — spent on shopping bazaar
      shopping_token_balance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  Wallet.associate = function (models) {
    Wallet.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return Wallet;
};
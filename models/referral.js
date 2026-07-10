module.exports = (sequelize, DataTypes) => {
  const Referral = sequelize.define(
    "referral",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      referrer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      referred_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true, // A user can only ever be referred once
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // Snapshot of the code used — audit trail
      referral_code_used: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },

      // Per spec: referrer gets 200, new user gets 100
      referrer_bonus: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 200,
      },

      referred_bonus: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
      },

      // Track each side independently so a partial failure is retryable
      referrer_bonus_credited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      referred_bonus_credited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      // pending   → record created, bonuses not yet credited
      // completed → both bonuses credited
      // failed    → something went wrong, check the boolean flags above
      status: {
        type: DataTypes.ENUM("pending", "completed", "failed"),
        defaultValue: "pending",
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  Referral.associate = function (models) {
    Referral.belongsTo(models.user, {
      foreignKey: "referrer_id",
      as: "referrer",
    });

    Referral.belongsTo(models.user, {
      foreignKey: "referred_user_id",
      as: "referredUser",
    });
  };

  return Referral;
};
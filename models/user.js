module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "user",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      full_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },

      mobile: {
        type: DataTypes.STRING(15),
        allowNull: false,
        unique: true,
      },

      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      profile_image: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      profile_public_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      referral_code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },

      // Raw code entered at signup — kept for audit trail
      referred_by_code: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },

      // FK resolved after referral code is validated
      referred_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      is_mobile_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      // Prevents double-crediting signup bonus on retry
      signup_bonus_credited: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      role: {
        type: DataTypes.ENUM("user", "admin"),
        defaultValue: "user",
      },

      status: {
        type: DataTypes.ENUM("active", "blocked"),
        defaultValue: "active",
      },
    },
    {
      timestamps: true,
      underscored: true,
    },
  );

  User.associate = function (models) {
    // Self-referential: who referred this user
    User.belongsTo(models.user, {
      foreignKey: "referred_by",
      as: "referrer",
    });

    // Self-referential: everyone this user referred
    User.hasMany(models.user, {
      foreignKey: "referred_by",
      as: "referrals",
    });

    User.hasOne(models.wallet, {
      foreignKey: "user_id",
      as: "wallet",
    });

    User.hasMany(models.token_transaction, {
      foreignKey: "user_id",
      as: "tokenTransactions",
    });

    User.hasMany(models.referral, {
      foreignKey: "referrer_id",
      as: "givenReferrals",
    });

    User.hasMany(models.referral, {
      foreignKey: "referred_user_id",
      as: "receivedReferral",
    });
    User.hasMany(models.order, { foreignKey: "user_id", as: "user" });
    User.hasOne(models.leaderboard, {
      foreignKey: "user_id",
      as: "leaderboard",
    });
  };

  return User;
};

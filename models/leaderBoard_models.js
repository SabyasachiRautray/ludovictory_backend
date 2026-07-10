module.exports = (sequelize, DataTypes) => {
  const Leaderboard = sequelize.define(
    "leaderboard",
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

      total_shopping_tokens_earned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      rank: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

      total_spins: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      total_referrals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      timestamps: true,
      underscored: true,

      indexes: [
        {
          // Fast rank lookups — getLeaderboard queries ORDER BY rank ASC WHERE rank <= 50
          name: "idx_leaderboard_rank",
          fields: ["rank"],
        },
        {
          // Fast score comparisons — updateLeaderboardScore counts users WHERE score > new_score
          name: "idx_leaderboard_score",
          fields: ["total_shopping_tokens_earned"],
        },
        {
          // Fast user lookup — getMyRank queries WHERE user_id = ?
          // Already covered by unique: true above but explicit index name helps with query plans
          name: "idx_leaderboard_user_id",
          unique: true,
          fields: ["user_id"],
        },
        {
          // Composite — covers the rank shift query:
          // WHERE rank >= new_rank AND rank <= old_rank AND user_id != user_id
          // Sequelize/MySQL can use this for the range scan in updateLeaderboardScore
          name: "idx_leaderboard_rank_user",
          fields: ["rank", "user_id"],
        },
      ],
    }
  );

  Leaderboard.associate = function (models) {
    Leaderboard.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return Leaderboard;
};
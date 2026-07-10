module.exports = (sequelize, DataTypes) => {
  const SpinnerResult = sequelize.define(
    "spinner_result",
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

      segment_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "spinner_segments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },

      tokens_spent: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      tokens_won: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      result_label: {
        // Snapshot of label at time of spin — segment label may change later
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  SpinnerResult.associate = function (models) {
    SpinnerResult.belongsTo(models.user, {
      foreignKey: "user_id",
      as: "user",
    });

    SpinnerResult.belongsTo(models.spinner_segment, {
      foreignKey: "segment_id",
      as: "segment",
    });
  };

  return SpinnerResult;
};
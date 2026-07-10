module.exports = (sequelize, DataTypes) => {
  const SpinnerSegment = sequelize.define(
    "spinner_segment",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      label: {
        // What shows on the wheel e.g. "5 Tokens", "Better Luck Next Time"
        type: DataTypes.STRING,
        allowNull: false,
      },

      tokens_won: {
        // 0 means no reward for this segment
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      is_active: {
        // Inactive segments are excluded from the wheel entirely
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      display_order: {
        // Controls segment order on the wheel visually
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  SpinnerSegment.associate = function (models) {
    SpinnerSegment.hasMany(models.spinner_result, {
      foreignKey: "segment_id",
      as: "results",
    });
  };

  return SpinnerSegment;
};
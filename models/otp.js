module.exports = (sequelize, DataTypes) => {
  const Otp = sequelize.define(
    "otp",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      mobile: {
        type: DataTypes.STRING(15),
        allowNull: false,
      },

      otp_code: {
        type: DataTypes.STRING(6),
        allowNull: false,
      },

      is_used: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  return Otp;
};
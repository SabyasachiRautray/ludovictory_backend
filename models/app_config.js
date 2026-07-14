module.exports = (sequelize, DataTypes) => {
  const AppConfig = sequelize.define(
    "app_config",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      key: {
        // Unique config key — e.g. "token_rate", "spin_cost"
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },

      value: {
        // Always stored as string, parsed by consumer
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        // explanation for admin dashboard
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      timestamps: true,
      underscored: true,
    }
  );

  return AppConfig;
};  
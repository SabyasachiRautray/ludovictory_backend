module.exports = (sequelize, DataTypes) => {
  const TokenPackage = sequelize.define(
    "token_package",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      label: {
        // e.g. "Starter Pack", "Value Pack"
        type: DataTypes.STRING,
        allowNull: false,
      },

      tokens: {
        // Shopping tokens the user receives
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1 },
      },

      price: {
        // Price in INR (rupees)
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: 1 },
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      display_order: {
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

  TokenPackage.associate = function (models) {
    TokenPackage.hasMany(models.token_purchase, {
      foreignKey: "package_id",
      as: "purchases",
    });
  };

  return TokenPackage;
};
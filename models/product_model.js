module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define(
    "product",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      image_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      
      image_public_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      token_cost: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1 },
      },

      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      timestamps: true,
      underscored: true,
    },
  );

  Product.associate = function (models) {
    Product.hasMany(models.order, {
      foreignKey: "product_id",
      as: "orders",
    });
  };

  return Product;
};

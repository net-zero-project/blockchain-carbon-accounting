const dbConfig = require("../config/db.config.js");

const Sequelize = require("sequelize");
const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  port: dbConfig.PORT,
  dialect: dbConfig.dialect,

  pool: {
    max: dbConfig.pool.max,
    min: dbConfig.pool.min,
    acquire: dbConfig.pool.acquire,
    idle: dbConfig.pool.idle,
  },
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.projects = require("./project.model.js")(sequelize, Sequelize);
db.project_registries = require("./project_registry.model.js")(sequelize, Sequelize);
db.project_ratings = require("./project_rating.model.js")(sequelize, Sequelize);
db.issuances = require("./issuance.model.js")(sequelize, Sequelize);
db.retirements = require("./retirement.model.js")(sequelize, Sequelize);

module.exports = db;

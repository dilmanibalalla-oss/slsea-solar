const config = require("./config");
const app = require("./app");
const { connectDatabase } = require("./database");

async function start() {
  await connectDatabase();
  app.listen(config.port, () => {
    console.log(`API listening on ${config.localOrigin}${config.base}`);
    console.log(`Swagger UI: ${config.localOrigin}${config.base}/docs`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

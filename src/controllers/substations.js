const { handlers, listNested } = require("./metadata");
module.exports = {
  ...handlers("substations"),
  listInstallations: listNested("substations", "installations", "substation")
};

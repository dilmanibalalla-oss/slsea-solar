const { handlers, listNested } = require("./metadata");
module.exports = {
  ...handlers("provinces"),
  listDistricts: listNested("provinces", "districts", "province")
};

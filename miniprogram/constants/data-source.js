const DATA_SOURCE_TYPES = {
  MOCK: "mock",
  CLOUD: "cloud"
};

const CONTENT_DATA_SOURCE = DATA_SOURCE_TYPES.MOCK;

function getContentDataSource() {
  return CONTENT_DATA_SOURCE;
}

module.exports = {
  DATA_SOURCE_TYPES,
  getContentDataSource
};

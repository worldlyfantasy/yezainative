const DATA_SOURCE_TYPES = {
  MOCK: "mock",
  CLOUD: "cloud"
};

const CONTENT_DATA_SOURCE = DATA_SOURCE_TYPES.CLOUD;
const CONFIG_DATA_SOURCE = DATA_SOURCE_TYPES.CLOUD;
const TRANSACTION_DATA_SOURCE = DATA_SOURCE_TYPES.CLOUD;
const USER_DATA_SOURCE = DATA_SOURCE_TYPES.CLOUD;

function getContentDataSource() {
  return CONTENT_DATA_SOURCE;
}

function getConfigDataSource() {
  return CONFIG_DATA_SOURCE;
}

function getTransactionDataSource() {
  return TRANSACTION_DATA_SOURCE;
}

function getUserDataSource() {
  return USER_DATA_SOURCE;
}

module.exports = {
  DATA_SOURCE_TYPES,
  getContentDataSource,
  getConfigDataSource,
  getTransactionDataSource,
  getUserDataSource
};

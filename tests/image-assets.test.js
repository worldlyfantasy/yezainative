const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const imageAssetsModulePath = path.resolve(
  __dirname,
  "../cloudfunctions/adminGateway/image-assets.js"
);

function loadImageAssetsModule(options = {}) {
  const originalLoad = Module._load;

  Module._load = function mockLoader(request, parent, isMain) {
    if (request === "sharp" && options.forceSharpUnavailable) {
      throw new Error("sharp unavailable in test");
    }

    return originalLoad(request, parent, isMain);
  };

  delete require.cache[imageAssetsModulePath];

  try {
    return require(imageAssetsModulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test("ensureImageAssetValue skips processing when sharp is unavailable", async () => {
  const imageAssets = loadImageAssetsModule({ forceSharpUnavailable: true });
  let downloadCalled = false;
  let uploadCalled = false;
  const sourceRef = "cloud://test-bucket/service-route/draft/cover/test.jpg";

  const result = await imageAssets.ensureImageAssetValue(sourceRef, {
    downloadSource: async () => {
      downloadCalled = true;
      return {
        buffer: Buffer.from("test")
      };
    },
    uploadBuffer: async () => {
      uploadCalled = true;
      return "cloud://test-bucket/service-route/final/test.jpg";
    },
    fallbackFolder: "service-route/demo/cover"
  });

  assert.deepEqual(result, {
    original: sourceRef,
    card: sourceRef,
    detail: sourceRef
  });
  assert.equal(downloadCalled, false);
  assert.equal(uploadCalled, false);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const repositoryPath = require.resolve("../miniprogram/repositories/content-repository");
const apiPath = require.resolve("../miniprogram/api/cloud/content");
const mapperPath = require.resolve("../miniprogram/mappers/content");

const originalApiModule = require.cache[apiPath];
const originalMapperModule = require.cache[mapperPath];
const originalRepositoryModule = require.cache[repositoryPath];

function resetModules() {
  delete require.cache[repositoryPath];
  delete require.cache[apiPath];
  delete require.cache[mapperPath];
}

function restoreModules() {
  resetModules();

  if (originalApiModule) {
    require.cache[apiPath] = originalApiModule;
  }

  if (originalMapperModule) {
    require.cache[mapperPath] = originalMapperModule;
  }

  if (originalRepositoryModule) {
    require.cache[repositoryPath] = originalRepositoryModule;
  }
}

test("service detail data bypasses repository cache so admin updates show immediately", async () => {
  let serviceDetailCalls = 0;
  let homeCalls = 0;

  resetModules();
  require.cache[apiPath] = {
    exports: {
      getHomePageData: async () => {
        homeCalls += 1;
        return { page: "home" };
      },
      getCreatorsPageData: async () => null,
      getCreatorDetailData: async () => null,
      getDestinationsPageData: async () => null,
      getDestinationDetailData: async () => null,
      getIdeasPageData: async () => null,
      getIdeaDetailData: async () => null,
      getServiceDetailData: async () => {
        serviceDetailCalls += 1;
        return { service: { slug: "siem-reap" }, groupPeriods: [{ id: serviceDetailCalls }] };
      }
    }
  };
  require.cache[mapperPath] = {
    exports: {
      mapHomePageData: (payload) => payload,
      mapCreatorsPageData: (payload) => payload,
      mapCreatorDetailData: (payload) => payload,
      mapDestinationsPageData: (payload) => payload,
      mapDestinationDetailData: (payload) => payload,
      mapIdeasPageData: (payload) => payload,
      mapIdeaDetailData: (payload) => payload,
      mapServiceDetailData: (payload) => payload
    }
  };

  const repository = require("../miniprogram/repositories/content-repository");

  const firstDetail = await repository.getServiceDetailData("siem-reap");
  const secondDetail = await repository.getServiceDetailData("siem-reap");
  const firstHome = await repository.getHomePageData();
  const secondHome = await repository.getHomePageData();

  assert.equal(serviceDetailCalls, 2);
  assert.equal(firstDetail.groupPeriods[0].id, 1);
  assert.equal(secondDetail.groupPeriods[0].id, 2);
  assert.equal(homeCalls, 1);
  assert.deepEqual(firstHome, secondHome);

  restoreModules();
});

test("service detail summary bypasses repository cache so creatorMessage updates show immediately", async () => {
  let serviceDetailSummaryCalls = 0;

  resetModules();
  require.cache[apiPath] = {
    exports: {
      getHomePageData: async () => null,
      getCreatorsPageData: async () => null,
      getCreatorDetailData: async () => null,
      getDestinationsPageData: async () => null,
      getDestinationDetailData: async () => null,
      getIdeasPageData: async () => null,
      getIdeaDetailData: async () => null,
      getServiceDetailData: async () => null,
      getServiceBookingData: async () => null,
      getServiceConsultData: async () => null,
      getServiceDetailContentData: async () => null,
      getServiceGalleryData: async () => null,
      getServiceGalleryOriginalData: async () => null,
      getServiceDetailSummaryData: async () => {
        serviceDetailSummaryCalls += 1;
        return {
          service: {
            slug: "dian-yue-xun-ji",
            creatorMessage: `creator-message-${serviceDetailSummaryCalls}`
          }
        };
      }
    }
  };
  require.cache[mapperPath] = {
    exports: {
      mapHomePageData: (payload) => payload,
      mapCreatorsPageData: (payload) => payload,
      mapCreatorDetailData: (payload) => payload,
      mapDestinationsPageData: (payload) => payload,
      mapDestinationDetailData: (payload) => payload,
      mapIdeasPageData: (payload) => payload,
      mapIdeaDetailData: (payload) => payload,
      mapServiceBookingData: (payload) => payload,
      mapServiceConsultData: (payload) => payload,
      mapServiceDetailSummaryData: (payload) => payload,
      mapServiceDetailContentData: (payload) => payload,
      mapServiceGalleryData: (payload) => payload,
      mapServiceGalleryOriginalData: (payload) => payload,
      mapServiceDetailData: (payload) => payload
    }
  };

  const repository = require("../miniprogram/repositories/content-repository");

  const firstSummary = await repository.getServiceDetailSummaryData("dian-yue-xun-ji");
  const secondSummary = await repository.getServiceDetailSummaryData("dian-yue-xun-ji");

  assert.equal(serviceDetailSummaryCalls, 2);
  assert.equal(firstSummary.service.creatorMessage, "creator-message-1");
  assert.equal(secondSummary.service.creatorMessage, "creator-message-2");

  restoreModules();
});

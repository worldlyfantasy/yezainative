const test = require("node:test");
const assert = require("node:assert/strict");

const { bindSavedTravelerToTravelPersons } = require("../miniprogram/pkg/explore/checkout/linkage");

function buildManualTraveler(overrides = {}) {
  return {
    index: 1,
    profileId: "",
    travelerRecordId: "",
    source: "manual",
    name: "登顶云",
    documents: [
      {
        documentType: "passport",
        documentNumber: "E12312312"
      }
    ],
    documentType: "passport",
    documentTypeIndex: 3,
    documentNumber: "E12312312",
    idCard: "E12312312",
    phone: "13122276786",
    wechat: "worldlyfantasy",
    email: "",
    gender: "male",
    genderIndex: 1,
    birthday: "2018-04-11",
    note: "",
    ...overrides
  };
}

test("bindSavedTravelerToTravelPersons links a newly created profile back to the active slot", () => {
  const travelPersons = [buildManualTraveler()];
  const bound = bindSavedTravelerToTravelPersons(travelPersons, 0, {
    profileId: "p_1775867890883_demo",
    travelerRecordId: "traveler_doc_demo",
    source: "traveler_profile",
    name: "登顶云",
    documents: [
      {
        documentType: "passport",
        documentNumber: "E12312312"
      }
    ],
    phone: "13122276786",
    gender: "male",
    birthday: "2018-04-11"
  });

  assert.equal(bound[0].profileId, "p_1775867890883_demo");
  assert.equal(bound[0].travelerRecordId, "traveler_doc_demo");
  assert.equal(bound[0].source, "traveler_profile");
  assert.equal(bound[0].name, "登顶云");
  assert.equal(bound[0].documentNumber, "E12312312");
});

test("bindSavedTravelerToTravelPersons keeps the original list when target slot is invalid", () => {
  const travelPersons = [buildManualTraveler()];
  const bound = bindSavedTravelerToTravelPersons(travelPersons, -1, {
    profileId: "p_ignore"
  });

  assert.deepEqual(bound, travelPersons);
});

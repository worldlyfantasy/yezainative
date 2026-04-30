const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  ROOMING_MODE_OPTIONS,
  buildNormalizedTravelerRecord,
  getDocumentTypeIndex,
  inferDocumentTypeFromNumber,
  isValidChineseIdCard,
  isValidContactPhone,
  isValidHkmtResidencePermit,
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContactFieldValue,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateDocumentNumber,
  validateRoomingFields
} = require("../miniprogram/pkg/explore/checkout/form-validation");

function sampleTraveler(overrides = {}) {
  return {
    index: 1,
    name: "阿野",
    documents: [
      {
        documentType: "passport",
        documentNumber: "E12345678"
      }
    ],
    phone: "13800000000",
    gender: "male",
    birthday: "1990-01-01",
    wechat: "wild_yezai",
    ...overrides
  };
}

test("checkout form validation accepts normalized document and phone formats", () => {
  assert.deepEqual(
    DOCUMENT_TYPE_PICKER_OPTIONS.map((item) => item.label),
    ["请选择证件类型", "中国居民身份证", "港澳台居民居住证", "护照"]
  );
  assert.deepEqual(
    ROOMING_MODE_OPTIONS.map((item) => item.value),
    ["random", "withRoommate", "singleRoomRequest"]
  );
  assert.deepEqual(
    ROOMING_MODE_OPTIONS.map((item) => item.label),
    ["随机同性拼房", "我有睡友", "申请单房"]
  );

  assert.equal(isValidChineseIdCard("11010519491231002X"), true);
  assert.equal(isValidChineseIdCard("110105194912310021"), false);

  assert.equal(isValidPassportNumber("E12345678"), true);
  assert.equal(isValidPassportNumber("12345678"), false);

  assert.equal(isValidHkmtResidencePermit("11010519491231002X"), false);

  assert.equal(inferDocumentTypeFromNumber("11010519491231002X"), "idCard");
  assert.equal(inferDocumentTypeFromNumber("e12345678"), "passport");

  assert.equal(isValidMainlandMobile("+86 13800000000"), true);
  assert.equal(isValidMainlandMobile("1380000000"), false);

  assert.equal(isValidContactPhone("13800000000"), true);
  assert.equal(isValidContactPhone("+86 138-0000-0000"), true);
  assert.equal(isValidContactPhone("010-12345678"), false);
  assert.equal(isValidContactPhone("12345"), false);
});

test("checkout form validation normalizes traveler fields into document type and number", () => {
  const traveler = buildNormalizedTravelerRecord({
    index: 1,
    name: " 阿野 ",
    documents: [{ documentType: "passport", documentNumber: " e12345678 " }],
    phone: "+86 138-0000-0000",
    gender: "male",
    birthday: "1990-01-15",
    wechat: " wx_test "
  });

  assert.equal(normalizeTravelPersonFieldValue("documentNumber", " 11010519491231002x "), "11010519491231002X");
  assert.equal(normalizeTravelPersonFieldValue("phone", "+86 138-0000-0000"), "13800000000");
  assert.equal(normalizeContactFieldValue("contactPhone", " +86 138-0000-0000 "), "13800000000");

  assert.equal(traveler.name, "阿野");
  assert.equal(traveler.documentType, "passport");
  assert.equal(traveler.documentTypeIndex, getDocumentTypeIndex("passport"));
  assert.equal(traveler.documentNumber, "E12345678");
  assert.equal(traveler.idCard, "E12345678");
  assert.equal(traveler.gender, "male");
  assert.equal(traveler.birthday, "1990-01-15");
  assert.equal(traveler.wechat, "wx_test");
  assert.equal(traveler.documents.length, 1);
});

test("buildNormalizedTravelerRecord keeps traveler linkage fields for checkout selection", () => {
  const traveler = buildNormalizedTravelerRecord({
    profileId: "cloud_prof_1",
    travelerRecordId: "traveler_doc_1",
    source: "traveler_profile",
    index: 1,
    name: "阿野",
    documents: [{ documentType: "passport", documentNumber: "E12345678" }],
    phone: "13800000000",
    gender: "male",
    birthday: "1990-01-01"
  });
  assert.equal(traveler.profileId, "cloud_prof_1");
  assert.equal(traveler.travelerRecordId, "traveler_doc_1");
  assert.equal(traveler.source, "traveler_profile");
});

test("checkout form validation enforces selected document type rules", () => {
  assert.equal(validateDocumentNumber("", ""), "请先选择证件类型");
  assert.equal(validateDocumentNumber("idCard", ""), "请填写中国居民身份证号码");
  assert.equal(validateDocumentNumber("passport", ""), "请填写护照号码");
  assert.equal(validateDocumentNumber("idCard", "E12345678"), "请输入正确的身份证号");
  assert.equal(validateDocumentNumber("passport", "11010519491231002X"), "请输入正确的护照号");
  assert.equal(validateRoomingFields("withRoommate", "", 1), "选择「我有睡友」时请填写睡友姓名");
  assert.equal(validateRoomingFields("withRoommate", "阿林", 1), "");
  assert.equal(validateRoomingFields("withRoommate", "", 2), "");
  assert.equal(validateRoomingFields("withRoommate", "", 3), "");
  assert.equal(validateRoomingFields("singleRoomRequest", "", 1), "");
});

test("checkout form validation returns field errors and first toast message", () => {
  const result = validateCheckoutForm({
    peopleCount: 2,
    travelPersons: [
      {
        index: 1,
        name: "  ",
        documents: [{ documentType: "", documentNumber: "" }],
        phone: "1381234",
        gender: "",
        birthday: "",
        wechat: ""
      },
      sampleTraveler({ index: 2 })
    ],
    emergencyContactName: "",
    emergencyContactPhone: ""
  });

  assert.equal(result.travelPersons[1].documentNumber, "E12345678");
  assert.equal(result.travelPersonErrors[0].name, "请填写姓名");
  assert.equal(result.travelPersonErrors[0].gender, "请选择性别");
  assert.equal(result.travelPersonErrors[0].birthday, "请选择生日");
  assert.equal(result.travelPersonErrors[0].phone, "请输入正确的手机号");
  assert.equal(result.travelPersonErrors[0].documentBlock, "请至少填写一组完整有效的证件信息");
  assert.deepEqual(result.contactErrors, {
    emergencyContactName: "请填写紧急联系人姓名",
    emergencyContactPhone: "请填写紧急联系人手机号"
  });
  assert.equal(result.firstErrorMessage, "请完善出行人1的姓名");
});

test("checkout form requires only emergency contact fields", () => {
  const result = validateCheckoutForm({
    peopleCount: 1,
    travelPersons: [sampleTraveler()],
    emergencyContactName: "  海森 ",
    emergencyContactPhone: "13122276786"
  });
  assert.equal(result.emergencyContactName, "海森");
  assert.equal("contactName" in result, false);
  assert.equal("contactPhone" in result, false);
  assert.deepEqual(result.contactErrors, {
    emergencyContactName: "",
    emergencyContactPhone: ""
  });
  assert.equal(result.firstErrorMessage, "");
});

test("checkout form falls back to random rooming when single-room request is unavailable", () => {
  const result = validateCheckoutForm({
    peopleCount: 1,
    travelPersons: [sampleTraveler()],
    emergencyContactName: "海森",
    emergencyContactPhone: "13122276786",
    roomingMode: "singleRoomRequest",
    singleRoomEnabled: false
  });

  assert.equal(result.roomingMode, "random");
  assert.equal(result.firstErrorMessage, "");
});

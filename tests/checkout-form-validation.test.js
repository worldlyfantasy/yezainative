const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  buildNormalizedTravelerRecord,
  getDocumentTypeIndex,
  inferDocumentTypeFromNumber,
  isValidChineseIdCard,
  isValidContactPhone,
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContactFieldValue,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateDocumentNumber
} = require("../miniprogram/pkg/explore/checkout/form-validation");

test("checkout form validation accepts normalized document and phone formats", () => {
  assert.deepEqual(
    DOCUMENT_TYPE_PICKER_OPTIONS.map((item) => item.label),
    ["请选择证件类型", "身份证", "护照"]
  );

  assert.equal(isValidChineseIdCard("11010519491231002X"), true);
  assert.equal(isValidChineseIdCard("110105194912310021"), false);

  assert.equal(isValidPassportNumber("E12345678"), true);
  assert.equal(isValidPassportNumber("12345678"), false);

  assert.equal(inferDocumentTypeFromNumber("11010519491231002X"), "idCard");
  assert.equal(inferDocumentTypeFromNumber("e12345678"), "passport");

  assert.equal(isValidMainlandMobile("+86 13800000000"), true);
  assert.equal(isValidMainlandMobile("1380000000"), false);

  assert.equal(isValidContactPhone("13800000000"), true);
  assert.equal(isValidContactPhone("010-12345678"), true);
  assert.equal(isValidContactPhone("0755-1234567-88"), true);
  assert.equal(isValidContactPhone("12345"), false);
});

test("checkout form validation normalizes traveler fields into document type and number", () => {
  const traveler = buildNormalizedTravelerRecord({
    index: 1,
    name: " 阿野 ",
    documentType: "passport",
    documentNumber: " e12345678 ",
    phone: "+86 138-0000-0000"
  });

  assert.equal(normalizeTravelPersonFieldValue("documentNumber", " 11010519491231002x "), "11010519491231002X");
  assert.equal(normalizeTravelPersonFieldValue("phone", "+86 138-0000-0000"), "13800000000");
  assert.equal(normalizeContactFieldValue("contactPhone", " 010 12345678 "), "01012345678");

  assert.equal(traveler.name, "阿野");
  assert.equal(traveler.documentType, "passport");
  assert.equal(traveler.documentTypeIndex, getDocumentTypeIndex("passport"));
  assert.equal(traveler.documentNumber, "E12345678");
  assert.equal(traveler.idCard, "E12345678");
});

test("checkout form validation enforces selected document type rules", () => {
  assert.equal(validateDocumentNumber("", ""), "请先选择证件类型");
  assert.equal(validateDocumentNumber("idCard", ""), "请填写身份证号");
  assert.equal(validateDocumentNumber("passport", ""), "请填写护照号");
  assert.equal(validateDocumentNumber("idCard", "E12345678"), "请输入正确的身份证号");
  assert.equal(validateDocumentNumber("passport", "11010519491231002X"), "请输入正确的护照号");
});

test("checkout form validation returns field errors and first toast message", () => {
  const result = validateCheckoutForm({
    travelPersons: [
      {
        index: 1,
        name: "  ",
        documentType: "",
        documentNumber: "123456789012345678",
        phone: "1381234"
      },
      {
        index: 2,
        name: "阿野",
        documentType: "passport",
        documentNumber: "E12345678",
        phone: "13800000000"
      }
    ],
    contactName: "  海森 ",
    contactPhone: "12345"
  });

  assert.equal(result.travelPersons[1].documentNumber, "E12345678");
  assert.equal(result.contactName, "海森");
  assert.equal(result.travelPersonErrors[0].name, "请填写姓名");
  assert.equal(result.travelPersonErrors[0].documentType, "请选择证件类型");
  assert.equal(result.travelPersonErrors[0].documentNumber, "请先选择证件类型");
  assert.equal(result.travelPersonErrors[0].phone, "请输入正确的手机号");
  assert.equal(result.contactErrors.contactPhone, "请输入正确的联系电话");
  assert.equal(result.firstErrorMessage, "请完善出行人1的姓名");
});

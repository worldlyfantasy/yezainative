const DOCUMENT_TYPE_PICKER_OPTIONS = [
  { value: "", label: "请选择证件类型" },
  { value: "idCard", label: "身份证" },
  { value: "passport", label: "护照" }
];

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeDocumentType(value) {
  const normalized = normalizeText(value);
  if (normalized === "idCard" || normalized === "passport") {
    return normalized;
  }
  return "";
}

function getDocumentTypeLabel(value) {
  const normalized = normalizeDocumentType(value);
  const match = DOCUMENT_TYPE_PICKER_OPTIONS.find((item) => item.value === normalized);
  return match ? match.label : "";
}

function getDocumentTypeIndex(value) {
  const normalized = normalizeDocumentType(value);
  const matchIndex = DOCUMENT_TYPE_PICKER_OPTIONS.findIndex((item) => item.value === normalized);
  return matchIndex >= 0 ? matchIndex : 0;
}

function normalizeDocumentNumber(value) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeMobileNumber(value) {
  return normalizeText(value)
    .replace(/[\s-]/g, "")
    .replace(/^\+?86(?=1[3-9]\d{9}$)/, "");
}

function normalizeContactPhone(value) {
  return normalizeMobileNumber(value);
}

function inferDocumentTypeFromNumber(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!normalized) {
    return "";
  }

  if (/^\d{15}$/.test(normalized) || /^\d{17}[\dX]$/.test(normalized)) {
    return "idCard";
  }

  if (/[A-Z]/.test(normalized) && /^[A-Z0-9]{5,17}$/.test(normalized)) {
    return "passport";
  }

  return "";
}

function normalizeTravelPersonFieldValue(field, value) {
  if (field === "documentType") {
    return normalizeDocumentType(value);
  }

  if (field === "documentNumber" || field === "idCard") {
    return normalizeDocumentNumber(value);
  }

  if (field === "phone") {
    return normalizeMobileNumber(value);
  }

  if (field === "wechat") {
    return normalizeText(value).replace(/\s+/g, "");
  }

  if (field === "name" || field === "note") {
    return normalizeText(value);
  }

  return String(value == null ? "" : value);
}

function normalizeContactFieldValue(field, value) {
  if (field === "contactPhone") {
    return normalizeContactPhone(value);
  }

  if (field === "contactName") {
    return normalizeText(value);
  }

  return String(value == null ? "" : value);
}

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidChineseIdCard(value) {
  const normalized = normalizeDocumentNumber(value);

  if (/^\d{15}$/.test(normalized)) {
    const year = Number(`19${normalized.slice(6, 8)}`);
    const month = Number(normalized.slice(8, 10));
    const day = Number(normalized.slice(10, 12));
    return isValidDateParts(year, month, day);
  }

  if (!/^\d{17}[\dX]$/.test(normalized)) {
    return false;
  }

  const year = Number(normalized.slice(6, 10));
  const month = Number(normalized.slice(10, 12));
  const day = Number(normalized.slice(12, 14));
  if (!isValidDateParts(year, month, day)) {
    return false;
  }

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkDigits = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const checksum = normalized
    .slice(0, 17)
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);

  return checkDigits[checksum % 11] === normalized.slice(17);
}

function isValidPassportNumber(value) {
  const normalized = normalizeDocumentNumber(value);
  return /[A-Z]/.test(normalized) && /^[A-Z0-9]{5,17}$/.test(normalized);
}

function isValidMainlandMobile(value) {
  return /^1[3-9]\d{9}$/.test(normalizeMobileNumber(value));
}

function isValidContactPhone(value) {
  return isValidMainlandMobile(normalizeContactPhone(value));
}

function validateDocumentNumber(documentType, documentNumber) {
  const normalizedType = normalizeDocumentType(documentType);
  const normalizedNumber = normalizeDocumentNumber(documentNumber);

  if (!normalizedType) {
    return "请先选择证件类型";
  }

  if (!normalizedNumber) {
    return `请填写${getDocumentTypeLabel(normalizedType)}号`;
  }

  if (normalizedType === "idCard") {
    return isValidChineseIdCard(normalizedNumber) ? "" : "请输入正确的身份证号";
  }

  if (normalizedType === "passport") {
    return isValidPassportNumber(normalizedNumber) ? "" : "请输入正确的护照号";
  }

  return "请输入正确的证件号";
}

function buildNormalizedTravelerRecord(traveler, options) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const shouldInferDocumentType = Boolean(options && options.inferDocumentType);
  const documentNumber = normalizeTravelPersonFieldValue(
    "documentNumber",
    source.documentNumber || source.idCard
  );
  const documentType = normalizeTravelPersonFieldValue(
    "documentType",
    source.documentType || (shouldInferDocumentType ? inferDocumentTypeFromNumber(documentNumber) : "")
  );

  return {
    index: source.index,
    name: normalizeTravelPersonFieldValue("name", source.name),
    documentType,
    documentTypeIndex: getDocumentTypeIndex(documentType),
    documentNumber,
    idCard: documentNumber,
    phone: normalizeTravelPersonFieldValue("phone", source.phone),
    wechat: normalizeTravelPersonFieldValue("wechat", source.wechat),
    note: normalizeTravelPersonFieldValue("note", source.note)
  };
}

function validateTravelerField(field, value, traveler) {
  if (field === "name") {
    return normalizeText(value) ? "" : "请填写姓名";
  }

  if (field === "documentType") {
    return normalizeDocumentType(value) ? "" : "请选择证件类型";
  }

  if (field === "documentNumber" || field === "idCard") {
    const source = traveler && typeof traveler === "object" ? traveler : {};
    return validateDocumentNumber(source.documentType, value);
  }

  if (field === "phone") {
    const normalized = normalizeMobileNumber(value);
    if (!normalized) {
      return "请填写手机号";
    }
    return isValidMainlandMobile(normalized) ? "" : "请输入正确的手机号";
  }

  return "";
}

function validateContactField(field, value) {
  if (field === "contactName") {
    return normalizeText(value) ? "" : "请填写联系人姓名";
  }

  if (field === "contactPhone") {
    const normalized = normalizeContactPhone(value);
    if (!normalized) {
      return "请填写联系人手机号";
    }
    return isValidContactPhone(normalized) ? "" : "请输入正确的联系人手机号";
  }

  return "";
}

function buildEmptyTravelerErrors() {
  return {
    name: "",
    documentType: "",
    documentNumber: "",
    phone: ""
  };
}

function buildEmptyContactErrors() {
  return {
    contactName: "",
    contactPhone: ""
  };
}

function buildTravelerErrorToast(index, errors) {
  if (errors.name) {
    return `请完善出行人${index}的姓名`;
  }

  if (errors.documentType) {
    return `请为出行人${index}选择证件类型`;
  }

  if (errors.documentNumber) {
    return `出行人${index}${errors.documentNumber}`;
  }

  if (errors.phone) {
    return `出行人${index}${errors.phone}`;
  }

  return "";
}

function validateCheckoutForm(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawTravelPersons = Array.isArray(source.travelPersons) ? source.travelPersons : [];
  const normalizedTravelPersons = rawTravelPersons.map(buildNormalizedTravelerRecord);

  let firstErrorMessage = "";
  const travelPersonErrors = normalizedTravelPersons.map((person, idx) => {
    const errors = buildEmptyTravelerErrors();
    errors.name = validateTravelerField("name", person.name, person);
    errors.documentType = validateTravelerField("documentType", person.documentType, person);
    errors.documentNumber = validateTravelerField("documentNumber", person.documentNumber, person);
    errors.phone = validateTravelerField("phone", person.phone, person);

    if (!firstErrorMessage) {
      firstErrorMessage = buildTravelerErrorToast(idx + 1, errors);
    }

    return errors;
  });

  const normalizedContactName = normalizeContactFieldValue("contactName", source.contactName);
  const normalizedContactPhone = normalizeContactFieldValue("contactPhone", source.contactPhone);
  const contactErrors = buildEmptyContactErrors();
  contactErrors.contactName = validateContactField("contactName", normalizedContactName);
  contactErrors.contactPhone = validateContactField("contactPhone", normalizedContactPhone);

  if (!firstErrorMessage && contactErrors.contactName) {
    firstErrorMessage = contactErrors.contactName;
  }

  if (!firstErrorMessage && contactErrors.contactPhone) {
    firstErrorMessage = contactErrors.contactPhone;
  }

  return {
    travelPersons: normalizedTravelPersons,
    travelPersonErrors,
    contactName: normalizedContactName,
    contactPhone: normalizedContactPhone,
    contactErrors,
    firstErrorMessage
  };
}

module.exports = {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  buildEmptyContactErrors,
  buildEmptyTravelerErrors,
  buildNormalizedTravelerRecord,
  getDocumentTypeIndex,
  getDocumentTypeLabel,
  inferDocumentTypeFromNumber,
  isValidChineseIdCard,
  isValidContactPhone,
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContactFieldValue,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateContactField,
  validateDocumentNumber,
  validateTravelerField
};

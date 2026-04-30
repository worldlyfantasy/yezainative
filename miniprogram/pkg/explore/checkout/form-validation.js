const DOCUMENT_TYPE_PICKER_OPTIONS = [
  { value: "", label: "请选择证件类型" },
  { value: "idCard", label: "中国居民身份证" },
  { value: "hkmtResidencePermit", label: "港澳台居民居住证" },
  { value: "passport", label: "护照" }
];

const GENDER_PICKER_OPTIONS = [
  { value: "", label: "请选择性别" },
  { value: "male", label: "男" },
  { value: "female", label: "女" }
];

const ROOM_TYPE_PICKER_OPTIONS = [
  { value: "king", label: "大床房" },
  { value: "twin", label: "双床房" }
];

const ROOMING_MODE_OPTIONS = [
  { value: "random", label: "随机同性拼房" },
  { value: "withRoommate", label: "我有睡友" },
  { value: "singleRoomRequest", label: "申请单房" }
];

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeDocumentType(value) {
  const normalized = normalizeText(value);
  if (
    normalized === "idCard" ||
    normalized === "passport" ||
    normalized === "hkmtResidencePermit"
  ) {
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

function normalizeGender(value) {
  const normalized = normalizeText(value);
  if (normalized === "male" || normalized === "female") {
    return normalized;
  }
  if (normalized === "男") {
    return "male";
  }
  if (normalized === "女") {
    return "female";
  }
  return "";
}

function getGenderIndex(value) {
  const normalized = normalizeGender(value);
  const matchIndex = GENDER_PICKER_OPTIONS.findIndex((item) => item.value === normalized);
  return matchIndex >= 0 ? matchIndex : 0;
}

function normalizeBirthday(value) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeRoomType(value) {
  const normalized = normalizeText(value);
  return normalized === "king" ? "king" : "twin";
}

function getRoomTypeLabel(value) {
  const normalized = normalizeRoomType(value);
  const match = ROOM_TYPE_PICKER_OPTIONS.find((item) => item.value === normalized);
  return match ? match.label : "双床房";
}

function inferDocumentTypeFromNumber(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!normalized) {
    return "";
  }

  if (
    /^(810000|820000|830000)\d{12}[\dX]$/.test(normalized) &&
    isValidChineseIdCard(normalized)
  ) {
    return "hkmtResidencePermit";
  }

  if (/^\d{15}$/.test(normalized) || /^\d{17}[\dX]$/.test(normalized)) {
    if (isValidChineseIdCard(normalized)) {
      return "idCard";
    }
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

  if (field === "gender") {
    return normalizeGender(value);
  }

  if (field === "birthday") {
    return normalizeBirthday(value);
  }

  if (field === "wechat") {
    return normalizeText(value).replace(/\s+/g, "");
  }

  if (field === "email") {
    return normalizeText(value).toLowerCase();
  }

  if (field === "name") {
    return normalizeText(value);
  }

  return String(value == null ? "" : value);
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isValidOptionalEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeContactFieldValue(field, value) {
  if (field === "contactPhone" || field === "emergencyContactPhone") {
    return normalizeContactPhone(value);
  }

  if (field === "contactName" || field === "emergencyContactName") {
    return normalizeText(value);
  }

  return String(value == null ? "" : value);
}

function normalizeTravelerSource(value) {
  const normalized = normalizeText(value);
  if (normalized === "traveler_profile" || normalized === "manual") {
    return normalized;
  }
  return "";
}

function normalizeRoomingMode(value) {
  const normalized = normalizeText(value);
  if (normalized === "withRoommate" || normalized === "singleRoomRequest") {
    return normalized;
  }
  return "random";
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

function isValidHkmtResidencePermit(value) {
  const normalized = normalizeDocumentNumber(value);
  if (!/^(810000|820000|830000)\d{12}[\dX]$/.test(normalized)) {
    return false;
  }
  return isValidChineseIdCard(normalized);
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

function isValidWeChatId(value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > 64) {
    return false;
  }
  return !/\s/.test(normalized);
}

function isValidBirthday(value) {
  const normalized = normalizeBirthday(value);
  if (!normalized) {
    return false;
  }
  const parts = normalized.split("-").map((item) => Number(item));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return false;
  }
  const [y, m, d] = parts;
  if (!isValidDateParts(y, m, d)) {
    return false;
  }
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const birth = Date.UTC(y, m - 1, d);
  if (birth > utcToday) {
    return false;
  }
  if (y < 1900) {
    return false;
  }
  return true;
}

function validateDocumentNumber(documentType, documentNumber) {
  const normalizedType = normalizeDocumentType(documentType);
  const normalizedNumber = normalizeDocumentNumber(documentNumber);

  if (!normalizedType) {
    return "请先选择证件类型";
  }

  if (!normalizedNumber) {
    const label = getDocumentTypeLabel(normalizedType);
    return `请填写${label}号码`;
  }

  if (normalizedType === "idCard") {
    return isValidChineseIdCard(normalizedNumber) ? "" : "请输入正确的身份证号";
  }

  if (normalizedType === "hkmtResidencePermit") {
    return isValidHkmtResidencePermit(normalizedNumber) ? "" : "请输入正确的港澳台居民居住证号码";
  }

  if (normalizedType === "passport") {
    return isValidPassportNumber(normalizedNumber) ? "" : "请输入正确的护照号";
  }

  return "请输入正确的证件号";
}

function normalizeSingleDocumentEntry(entry, inferDocumentType) {
  const src = entry && typeof entry === "object" ? entry : {};
  const documentNumber = normalizeDocumentNumber(
    src.documentNumber || src.idCard || src.i || ""
  );
  let documentType = normalizeDocumentType(src.documentType || src.t || "");
  if (!documentType && inferDocumentType && documentNumber) {
    documentType = inferDocumentTypeFromNumber(documentNumber);
  }
  return {
    rowId: normalizeText(src.rowId),
    documentType,
    documentTypeIndex: getDocumentTypeIndex(documentType),
    documentNumber
  };
}

function buildDocumentsFromSource(source, inferDocumentType) {
  if (Array.isArray(source.documents) && source.documents.length) {
    return source.documents.map((item) => normalizeSingleDocumentEntry(item, inferDocumentType));
  }
  if (Array.isArray(source.ds) && source.ds.length) {
    return source.ds.map((item) =>
      normalizeSingleDocumentEntry(
        {
          documentType: item && item.t,
          documentNumber: item && item.i
        },
        false
      )
    );
  }
  if (
    source.documentNumber ||
    source.idCard ||
    source.i ||
    source.documentType ||
    source.t
  ) {
    return [
      normalizeSingleDocumentEntry(
        {
          documentType: source.documentType || source.t,
          documentNumber: source.documentNumber || source.idCard || source.i
        },
        inferDocumentType
      )
    ];
  }
  return [normalizeSingleDocumentEntry({}, false)];
}

function pickPrimaryDocument(documents) {
  const list = Array.isArray(documents) ? documents : [];
  const withBoth = list.find((d) => normalizeDocumentType(d.documentType) && normalizeDocumentNumber(d.documentNumber));
  return withBoth || list[0] || normalizeSingleDocumentEntry({}, false);
}

function buildNormalizedTravelerRecord(traveler, options) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const inferDocumentType = Boolean(options && options.inferDocumentType);
  const documents = buildDocumentsFromSource(source, inferDocumentType);
  const primary = pickPrimaryDocument(documents);
  const gender = normalizeTravelPersonFieldValue("gender", source.gender);

  return {
    profileId: normalizeText(source.profileId),
    travelerRecordId: normalizeText(
      source.travelerRecordId || source.recordId || source.rid || source._id || source.id
    ),
    source: normalizeTravelerSource(source.source || source.src),
    index: source.index,
    name: normalizeTravelPersonFieldValue("name", source.name),
    documents,
    documentType: primary.documentType,
    documentTypeIndex: primary.documentTypeIndex,
    documentNumber: primary.documentNumber,
    idCard: primary.documentNumber,
    phone: normalizeTravelPersonFieldValue("phone", source.phone),
    wechat: normalizeTravelPersonFieldValue("wechat", source.wechat),
    email: normalizeEmail(source.email),
    gender,
    genderIndex: getGenderIndex(gender),
    birthday: normalizeTravelPersonFieldValue("birthday", source.birthday),
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

  if (field === "gender") {
    return normalizeGender(value) ? "" : "请选择性别";
  }

  if (field === "birthday") {
    if (!normalizeBirthday(value)) {
      return "请选择生日";
    }
    return isValidBirthday(value) ? "" : "请输入正确的生日";
  }

  if (field === "wechat") {
    if (!normalizeText(value)) {
      return "";
    }
    return isValidWeChatId(value) ? "" : "请输入正确的微信号";
  }

  if (field === "email") {
    if (!normalizeEmail(value)) {
      return "";
    }
    return isValidOptionalEmail(value) ? "" : "请输入正确的邮箱";
  }

  return "";
}

function validateContactField(field, value) {
  if (field === "emergencyContactName") {
    return normalizeText(value) ? "" : "请填写紧急联系人姓名";
  }

  if (field === "emergencyContactPhone") {
    const normalized = normalizeContactPhone(value);
    if (!normalized) {
      return "请填写紧急联系人手机号";
    }
    return isValidContactPhone(normalized) ? "" : "请输入正确的紧急联系人手机号";
  }

  return "";
}

function buildEmptyDocumentRowErrors() {
  return {
    documentType: "",
    documentNumber: ""
  };
}

function buildEmptyTravelerErrors(documentRowCount) {
  const raw = Number(documentRowCount);
  const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  return {
    name: "",
    gender: "",
    birthday: "",
    phone: "",
    email: "",
    wechat: "",
    documents: Array.from({ length: n }, () => buildEmptyDocumentRowErrors()),
    documentBlock: "",
    hasValidationIssue: false
  };
}

function validateTravelerDocumentRows(documents) {
  const list = Array.isArray(documents) && documents.length ? documents : [normalizeSingleDocumentEntry({}, false)];
  const rowErrors = [];
  let validPairs = 0;

  for (let i = 0; i < list.length; i += 1) {
    const doc = list[i];
    const t = normalizeDocumentType(doc.documentType);
    const n = normalizeDocumentNumber(doc.documentNumber);
    const row = buildEmptyDocumentRowErrors();

    if (!t && !n) {
      rowErrors.push(row);
      continue;
    }

    if (!t && n) {
      row.documentType = "请选择证件类型";
    } else if (t && !n) {
      row.documentNumber = validateDocumentNumber(t, "");
    } else {
      const numErr = validateDocumentNumber(t, n);
      if (!numErr) {
        validPairs += 1;
      } else {
        row.documentNumber = numErr;
      }
    }

    rowErrors.push(row);
  }

  const documentBlock = validPairs < 1 ? "请至少填写一组完整有效的证件信息" : "";

  return {
    rowErrors,
    documentBlock,
    validPairs
  };
}

function buildEmptyContactErrors() {
  return {
    emergencyContactName: "",
    emergencyContactPhone: ""
  };
}

function buildEmptyRoomingErrors() {
  return {
    roommateName: ""
  };
}

function validateRoomingFields(roomingMode, roommateName, peopleCount) {
  const normalizedMode = normalizeRoomingMode(roomingMode);
  if (normalizedMode !== "withRoommate") {
    return "";
  }

  const count = Number(peopleCount) > 0 ? Number(peopleCount) : 1;
  if (count >= 2) {
    return "";
  }

  return normalizeText(roommateName) ? "" : "选择「我有睡友」时请填写睡友姓名";
}

function buildTravelerErrorToast(index, errors) {
  if (errors.name) {
    return `请完善出行人${index}的姓名`;
  }

  if (errors.gender) {
    return `出行人${index}请选择性别`;
  }

  if (errors.birthday) {
    return `出行人${index}${errors.birthday}`;
  }

  if (Array.isArray(errors.documents)) {
    for (let i = 0; i < errors.documents.length; i += 1) {
      const row = errors.documents[i];
      if (row.documentType) {
        return `出行人${index}：${row.documentType}`;
      }
      if (row.documentNumber) {
        return `出行人${index}：${row.documentNumber}`;
      }
    }
  }

  if (errors.documentBlock) {
    return `出行人${index}：${errors.documentBlock}`;
  }

  if (errors.phone) {
    return `出行人${index}${errors.phone}`;
  }

  if (errors.email) {
    return `出行人${index}${errors.email}`;
  }

  if (errors.wechat) {
    return `出行人${index}${errors.wechat}`;
  }

  return "";
}

function validateCheckoutForm(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const rawTravelPersons = Array.isArray(source.travelPersons) ? source.travelPersons : [];
  const normalizedTravelPersons = rawTravelPersons.map((item) => buildNormalizedTravelerRecord(item));

  const peopleCount =
    Number(source.peopleCount) > 0
      ? Number(source.peopleCount)
      : normalizedTravelPersons.length || 1;

  let firstErrorMessage = "";
  const travelPersonErrors = normalizedTravelPersons.map((person, idx) => {
    const errors = buildEmptyTravelerErrors(Math.max(1, (person.documents || []).length));
    errors.name = validateTravelerField("name", person.name, person);
    errors.gender = validateTravelerField("gender", person.gender, person);
    errors.birthday = validateTravelerField("birthday", person.birthday, person);
    errors.phone = validateTravelerField("phone", person.phone, person);
    errors.email = validateTravelerField("email", person.email, person);
    errors.wechat = validateTravelerField("wechat", person.wechat, person);

    const docResult = validateTravelerDocumentRows(person.documents);
    errors.documents = docResult.rowErrors;
    const hasRowIssue = docResult.rowErrors.some(
      (row) => Boolean(row.documentType) || Boolean(row.documentNumber)
    );
    errors.documentBlock = !hasRowIssue && docResult.validPairs < 1 ? docResult.documentBlock : "";

    const travelerToast = buildTravelerErrorToast(idx + 1, errors);
    errors.hasValidationIssue = Boolean(travelerToast);
    if (!firstErrorMessage && travelerToast) {
      firstErrorMessage = travelerToast;
    }

    return errors;
  });

  const normalizedEmergencyContactName = normalizeContactFieldValue(
    "emergencyContactName",
    source.emergencyContactName
  );
  const normalizedEmergencyContactPhone = normalizeContactFieldValue(
    "emergencyContactPhone",
    source.emergencyContactPhone
  );
  const singleRoomEnabled = Boolean(source.singleRoomEnabled);
  let normalizedRoomingMode = normalizeRoomingMode(source.roomingMode);
  if (!singleRoomEnabled && normalizedRoomingMode === "singleRoomRequest") {
    normalizedRoomingMode = "random";
  }
  const normalizedRoommateName = normalizeText(source.roommateName);
  const normalizedAllergyNotes = normalizeText(source.allergyNotes);
  const normalizedCouponId = normalizeText(source.couponId);
  let normalizedRoomType = normalizeRoomType(source.roomType);
  if (normalizedRoomingMode === "random") {
    normalizedRoomType = "twin";
  }
  const contactErrors = buildEmptyContactErrors();
  contactErrors.emergencyContactName = validateContactField(
    "emergencyContactName",
    normalizedEmergencyContactName
  );
  contactErrors.emergencyContactPhone = validateContactField(
    "emergencyContactPhone",
    normalizedEmergencyContactPhone
  );
  const roomingErrors = buildEmptyRoomingErrors();
  roomingErrors.roommateName = validateRoomingFields(
    normalizedRoomingMode,
    normalizedRoommateName,
    peopleCount
  );

  if (!firstErrorMessage && contactErrors.emergencyContactName) {
    firstErrorMessage = contactErrors.emergencyContactName;
  }
  if (!firstErrorMessage && contactErrors.emergencyContactPhone) {
    firstErrorMessage = contactErrors.emergencyContactPhone;
  }
  if (!firstErrorMessage && roomingErrors.roommateName) {
    firstErrorMessage = roomingErrors.roommateName;
  }

  return {
    travelPersons: normalizedTravelPersons,
    travelPersonErrors,
    emergencyContactName: normalizedEmergencyContactName,
    emergencyContactPhone: normalizedEmergencyContactPhone,
    contactErrors,
    roomingMode: normalizedRoomingMode,
    roommateName: normalizedRoommateName,
    roomingErrors,
    roomType: normalizedRoomType,
    allergyNotes: normalizedAllergyNotes,
    couponId: normalizedCouponId,
    firstErrorMessage
  };
}

function pickFirstProfileFormError(errors) {
  if (!errors || typeof errors !== "object") {
    return "";
  }
  if (errors.name) {
    return errors.name;
  }
  if (errors.gender) {
    return errors.gender;
  }
  if (errors.birthday) {
    return errors.birthday;
  }
  if (Array.isArray(errors.documents)) {
    for (let i = 0; i < errors.documents.length; i += 1) {
      const row = errors.documents[i];
      if (row.documentType) {
        return row.documentType;
      }
      if (row.documentNumber) {
        return row.documentNumber;
      }
    }
  }
  if (errors.documentBlock) {
    return errors.documentBlock;
  }
  if (errors.phone) {
    return errors.phone;
  }
  if (errors.email) {
    return errors.email;
  }
  if (errors.wechat) {
    return errors.wechat;
  }
  return "";
}

function validateTravelerProfileForm(draft) {
  const normalized = buildNormalizedTravelerRecord(draft, { inferDocumentType: false });
  const errors = buildEmptyTravelerErrors(Math.max(1, (normalized.documents || []).length));
  errors.name = validateTravelerField("name", normalized.name, normalized);
  errors.gender = validateTravelerField("gender", normalized.gender, normalized);
  errors.birthday = validateTravelerField("birthday", normalized.birthday, normalized);
  errors.phone = validateTravelerField("phone", normalized.phone, normalized);
  errors.email = validateTravelerField("email", normalized.email, normalized);
  errors.wechat = validateTravelerField("wechat", normalized.wechat, normalized);

  const docResult = validateTravelerDocumentRows(normalized.documents);
  errors.documents = docResult.rowErrors;
  const hasRowIssue = docResult.rowErrors.some(
    (row) => Boolean(row.documentType) || Boolean(row.documentNumber)
  );
  errors.documentBlock = !hasRowIssue && docResult.validPairs < 1 ? docResult.documentBlock : "";

  return {
    normalized,
    errors,
    firstErrorMessage: pickFirstProfileFormError(errors)
  };
}

module.exports = {
  DOCUMENT_TYPE_PICKER_OPTIONS,
  GENDER_PICKER_OPTIONS,
  ROOM_TYPE_PICKER_OPTIONS,
  ROOMING_MODE_OPTIONS,
  buildEmptyContactErrors,
  buildEmptyRoomingErrors,
  buildEmptyDocumentRowErrors,
  buildEmptyTravelerErrors,
  buildNormalizedTravelerRecord,
  getDocumentTypeIndex,
  getDocumentTypeLabel,
  getGenderIndex,
  getRoomTypeLabel,
  inferDocumentTypeFromNumber,
  isValidChineseIdCard,
  isValidContactPhone,
  isValidHkmtResidencePermit,
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContactFieldValue,
  normalizeGender,
  normalizeRoomingMode,
  normalizeRoomType,
  normalizeTravelPersonFieldValue,
  validateCheckoutForm,
  validateContactField,
  validateDocumentNumber,
  validateRoomingFields,
  validateTravelerField,
  validateTravelerProfileForm,
  validateTravelerDocumentRows
};

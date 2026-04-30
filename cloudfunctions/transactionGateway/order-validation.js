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
  if (normalized === "idCard") {
    return "身份证";
  }
  if (normalized === "hkmtResidencePermit") {
    return "港澳台居民居住证";
  }
  if (normalized === "passport") {
    return "护照";
  }
  return "";
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

function normalizeBirthday(value) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
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

function isValidBirthdayValue(value) {
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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeTravelerProfileId(value) {
  return normalizeText(value);
}

function normalizeTravelerRecordId(value) {
  return normalizeText(value);
}

function normalizeTravelerSource(value) {
  const normalized = normalizeText(value);
  if (normalized === "traveler_profile" || normalized === "manual") {
    return normalized;
  }
  return "";
}

function isValidOptionalEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeDocumentEntryFromSource(entry, shouldInferDocumentType) {
  const src = entry && typeof entry === "object" ? entry : {};
  const documentNumber = normalizeDocumentNumber(
    src.documentNumber || src.idCard || src.i || ""
  );
  let documentType = normalizeDocumentType(src.documentType || src.t || "");
  if (!documentType && shouldInferDocumentType && documentNumber) {
    documentType = inferDocumentTypeFromNumber(documentNumber);
  }
  return {
    documentType,
    documentNumber
  };
}

function buildDocumentsListFromSource(source, shouldInferDocumentType) {
  if (Array.isArray(source.documents) && source.documents.length) {
    return source.documents.map((item) =>
      normalizeDocumentEntryFromSource(item, shouldInferDocumentType)
    );
  }
  if (Array.isArray(source.ds) && source.ds.length) {
    return source.ds.map((item) =>
      normalizeDocumentEntryFromSource(
        {
          documentType: item && item.t,
          documentNumber: item && item.i
        },
        false
      )
    );
  }
  const legacyNumber = normalizeDocumentNumber(
    source.documentNumber || source.idCard || source.idNo || source.i
  );
  const legacyType =
    normalizeDocumentType(source.documentType || source.t) ||
    (shouldInferDocumentType ? inferDocumentTypeFromNumber(legacyNumber) : "");
  if (legacyNumber || legacyType) {
    return [
      {
        documentType: legacyType,
        documentNumber: legacyNumber
      }
    ];
  }
  return [];
}

function pickPrimaryDocumentFromList(documents) {
  const list = Array.isArray(documents) ? documents : [];
  const hit = list.find((d) => normalizeDocumentType(d.documentType) && normalizeDocumentNumber(d.documentNumber));
  return hit || list[0] || { documentType: "", documentNumber: "" };
}

function isValidDocumentPair(documentType, documentNumber) {
  const t = normalizeDocumentType(documentType);
  const n = normalizeDocumentNumber(documentNumber);
  if (!t || !n) {
    return false;
  }
  if (t === "idCard" && !isValidChineseIdCard(n)) {
    return false;
  }
  if (t === "hkmtResidencePermit" && !isValidHkmtResidencePermit(n)) {
    return false;
  }
  if (t === "passport" && !isValidPassportNumber(n)) {
    return false;
  }
  return true;
}

function buildTravelerDocumentDisplayText(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const docs = Array.isArray(source.documents) ? source.documents : [];
  if (docs.length) {
    const parts = docs
      .map((d) => {
        const n = normalizeDocumentNumber(d.documentNumber);
        if (!n) {
          return "";
        }
        const t =
          normalizeDocumentType(d.documentType) || inferDocumentTypeFromNumber(n);
        const label = getDocumentTypeLabel(t);
        return label ? `${label} ${n}` : n;
      })
      .filter(Boolean);
    if (parts.length) {
      return parts.join("；");
    }
  }

  const documentNumber = normalizeDocumentNumber(
    source.documentNumber || source.idCard || source.idNo || source.i
  );
  if (!documentNumber) {
    return "";
  }

  const documentType =
    normalizeDocumentType(source.documentType || source.t) ||
    inferDocumentTypeFromNumber(documentNumber);
  const label = getDocumentTypeLabel(documentType);
  return label ? `${label} ${documentNumber}` : documentNumber;
}

function normalizeTravelerRecord(traveler, options) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const shouldInferDocumentType = !options || options.inferDocumentType !== false;
  const documents = buildDocumentsListFromSource(source, shouldInferDocumentType);
  const primary = pickPrimaryDocumentFromList(documents);
  const documentType = normalizeDocumentType(primary.documentType);
  const documentNumber = normalizeDocumentNumber(primary.documentNumber);
  const gender = normalizeGender(source.gender || source.g);
  const profileId = normalizeTravelerProfileId(source.profileId || source.pid || source.travelerId);
  const travelerRecordId = normalizeTravelerRecordId(
    source.travelerRecordId || source.recordId || source.rid || source._id || source.id
  );

  return {
    profileId,
    travelerRecordId,
    source: normalizeTravelerSource(source.source || source.src),
    name: normalizeText(source.name || source.n),
    documents,
    documentType,
    documentTypeLabel: getDocumentTypeLabel(documentType),
    documentNumber,
    documentDisplayText: buildTravelerDocumentDisplayText({
      documents,
      documentType,
      documentNumber
    }),
    idCard: documentNumber,
    phone: normalizeMobileNumber(source.phone || source.p),
    wechat: normalizeText(source.wechat || source.w),
    email: normalizeEmail(source.email),
    gender,
    birthday: normalizeBirthday(source.birthday || source.b),
    note: normalizeText(source.note || source.o)
  };
}

function hasTravelerContent(traveler) {
  const docs = traveler && Array.isArray(traveler.documents) ? traveler.documents : [];
  const hasDoc = docs.some((d) => normalizeDocumentNumber(d.documentNumber) || normalizeDocumentType(d.documentType));
  return Boolean(
    traveler &&
      (traveler.name ||
        traveler.documentNumber ||
        traveler.idCard ||
        hasDoc ||
        traveler.phone ||
        traveler.wechat ||
        traveler.email ||
        traveler.note ||
        traveler.gender ||
        traveler.birthday)
  );
}

function normalizeTravelers(travelers, fallbackTraveler, options) {
  const normalized = (Array.isArray(travelers) ? travelers : [])
    .map((traveler) => normalizeTravelerRecord(traveler, options))
    .filter(hasTravelerContent);

  if (normalized.length) {
    return normalized;
  }

  const fallback = normalizeTravelerRecord(fallbackTraveler, options);
  return hasTravelerContent(fallback) ? [fallback] : [];
}

function normalizeOrderContact(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const orderContact = source.orderContact && typeof source.orderContact === "object"
    ? source.orderContact
    : (source.contact && typeof source.contact === "object" ? source.contact : {});
  const emergencyContact = source.emergencyContact && typeof source.emergencyContact === "object"
    ? source.emergencyContact
    : {};
  const legacyTraveler = source.traveler && typeof source.traveler === "object" ? source.traveler : {};

  return {
    name: normalizeText(
      source.orderContactName
        || source.contactName
        || orderContact.name
        || legacyTraveler.name
        || source.emergencyContactName
        || emergencyContact.name
        || source.emergencyName
        || orderContact.emergencyName
    ),
    phone: normalizeContactPhone(
      source.orderContactPhone
        || source.contactPhone
        || orderContact.phone
        || legacyTraveler.phone
        || source.emergencyContactPhone
        || emergencyContact.phone
        || source.emergencyPhone
        || orderContact.emergencyPhone
    )
  };
}

function normalizeEmergencyContact(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const emergencyContact = source.emergencyContact && typeof source.emergencyContact === "object"
    ? source.emergencyContact
    : {};
  const orderContact = source.orderContact && typeof source.orderContact === "object"
    ? source.orderContact
    : {};
  const legacyContact = source.contact && typeof source.contact === "object" ? source.contact : {};

  return {
    name: normalizeText(
      source.emergencyContactName
        || emergencyContact.name
        || source.emergencyName
        || legacyContact.emergencyName
        || source.orderContactName
        || source.contactName
        || orderContact.name
        || legacyContact.name
    ),
    phone: normalizeContactPhone(
      source.emergencyContactPhone
        || emergencyContact.phone
        || source.emergencyPhone
        || legacyContact.emergencyPhone
        || source.orderContactPhone
        || source.contactPhone
        || orderContact.phone
        || legacyContact.phone
    )
  };
}

function normalizeContact(payload) {
  const orderContact = normalizeOrderContact(payload);
  const emergencyContact = normalizeEmergencyContact(payload);
  return {
    ...orderContact,
    emergencyName: emergencyContact.name,
    emergencyPhone: emergencyContact.phone
  };
}

function validateTravelerRecord(traveler, index) {
  const normalizedTraveler = normalizeTravelerRecord(traveler, {
    inferDocumentType: false
  });
  const travelerIndex = Number(index) > 0 ? Number(index) : 1;

  if (!normalizedTraveler.name) {
    return `请完善出行人${travelerIndex}的姓名`;
  }

  const docList = Array.isArray(normalizedTraveler.documents) ? normalizedTraveler.documents : [];
  for (let docIndex = 0; docIndex < docList.length; docIndex += 1) {
    const d = docList[docIndex];
    const t = normalizeDocumentType(d.documentType);
    const n = normalizeDocumentNumber(d.documentNumber);
    if (!t || !n) {
      continue;
    }
    if (t === "idCard" && !isValidChineseIdCard(n)) {
      return `出行人${travelerIndex}请输入正确的身份证号`;
    }
    if (t === "hkmtResidencePermit" && !isValidHkmtResidencePermit(n)) {
      return `出行人${travelerIndex}请输入正确的港澳台居民居住证号码`;
    }
    if (t === "passport" && !isValidPassportNumber(n)) {
      return `出行人${travelerIndex}请输入正确的护照号`;
    }
  }

  const validDocCount = docList.filter((d) =>
    isValidDocumentPair(d.documentType, d.documentNumber)
  ).length;
  if (validDocCount < 1) {
    return `请为出行人${travelerIndex}填写至少一组完整有效的证件信息`;
  }

  if (!normalizeGender(normalizedTraveler.gender)) {
    return `请为出行人${travelerIndex}选择性别`;
  }

  if (!isValidBirthdayValue(normalizedTraveler.birthday)) {
    return `请填写出行人${travelerIndex}的有效生日`;
  }

  if (!normalizedTraveler.phone) {
    return `请填写出行人${travelerIndex}的手机号`;
  }

  if (!isValidMainlandMobile(normalizedTraveler.phone)) {
    return `出行人${travelerIndex}请输入正确的手机号`;
  }

  if (normalizeText(normalizedTraveler.wechat) && !isValidWeChatId(normalizedTraveler.wechat)) {
    return `出行人${travelerIndex}请输入正确的微信号`;
  }

  if (normalizeEmail(normalizedTraveler.email) && !isValidOptionalEmail(normalizedTraveler.email)) {
    return `出行人${travelerIndex}请输入正确的邮箱`;
  }

  return "";
}

function validateOrderParticipants({ travelers, orderContact, emergencyContact, contact, peopleCount }) {
  const normalizedEmergencyContact = normalizeEmergencyContact({
    orderContact,
    emergencyContact,
    contact
  });
  const normalizedTravelers = Array.isArray(travelers) ? travelers : [];

  if (!normalizeText(normalizedEmergencyContact.name)) {
    return "请填写紧急联系人姓名";
  }

  if (!normalizeText(normalizedEmergencyContact.phone)) {
    return "请填写紧急联系人手机号";
  }

  if (!isValidContactPhone(normalizedEmergencyContact.phone)) {
    return "请输入正确的紧急联系人手机号";
  }

  if (!normalizedTravelers.length || normalizedTravelers.length !== Number(peopleCount)) {
    return "请完善全部出行人信息";
  }

  for (let index = 0; index < normalizedTravelers.length; index += 1) {
    const travelerError = validateTravelerRecord(normalizedTravelers[index], index + 1);
    if (travelerError) {
      return travelerError;
    }
  }

  return "";
}

module.exports = {
  buildTravelerDocumentDisplayText,
  getDocumentTypeLabel,
  inferDocumentTypeFromNumber,
  isValidChineseIdCard,
  isValidContactPhone,
  isValidHkmtResidencePermit,
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContact,
  normalizeEmergencyContact,
  normalizeOrderContact,
  normalizeTravelerRecord,
  normalizeTravelerSource,
  normalizeTravelers,
  validateOrderParticipants,
  validateTravelerRecord
};

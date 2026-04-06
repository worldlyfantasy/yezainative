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
  if (normalized === "idCard") {
    return "身份证";
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

function buildTravelerDocumentDisplayText(traveler) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const documentNumber = normalizeDocumentNumber(
    source.documentNumber || source.idCard || source.idNo || source.i
  );
  if (!documentNumber) {
    return "";
  }

  const documentType = normalizeDocumentType(source.documentType || source.t) || inferDocumentTypeFromNumber(documentNumber);
  const label = getDocumentTypeLabel(documentType);
  return label ? `${label} ${documentNumber}` : documentNumber;
}

function normalizeTravelerRecord(traveler, options) {
  const source = traveler && typeof traveler === "object" ? traveler : {};
  const shouldInferDocumentType = !options || options.inferDocumentType !== false;
  const documentNumber = normalizeDocumentNumber(
    source.documentNumber || source.idCard || source.idNo || source.i
  );
  const documentType =
    normalizeDocumentType(source.documentType || source.t) ||
    (shouldInferDocumentType ? inferDocumentTypeFromNumber(documentNumber) : "");

  return {
    name: normalizeText(source.name || source.n),
    documentType,
    documentTypeLabel: getDocumentTypeLabel(documentType),
    documentNumber,
    documentDisplayText: buildTravelerDocumentDisplayText({
      documentType,
      documentNumber
    }),
    idCard: documentNumber,
    phone: normalizeMobileNumber(source.phone || source.p),
    wechat: normalizeText(source.wechat || source.w),
    note: normalizeText(source.note || source.o)
  };
}

function hasTravelerContent(traveler) {
  return Boolean(
    traveler &&
      (traveler.name ||
        traveler.documentNumber ||
        traveler.idCard ||
        traveler.phone ||
        traveler.wechat ||
        traveler.note)
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

function normalizeContact(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const contact = source.contact && typeof source.contact === "object" ? source.contact : {};
  const legacyTraveler = source.traveler && typeof source.traveler === "object" ? source.traveler : {};

  return {
    name: normalizeText(source.contactName || contact.name || legacyTraveler.name),
    phone: normalizeContactPhone(source.contactPhone || contact.phone || legacyTraveler.phone)
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

  if (!normalizedTraveler.documentType) {
    return `请为出行人${travelerIndex}选择证件类型`;
  }

  if (!normalizedTraveler.documentNumber) {
    return `请填写出行人${travelerIndex}的${normalizedTraveler.documentTypeLabel}号`;
  }

  if (
    normalizedTraveler.documentType === "idCard" &&
    !isValidChineseIdCard(normalizedTraveler.documentNumber)
  ) {
    return `出行人${travelerIndex}请输入正确的身份证号`;
  }

  if (
    normalizedTraveler.documentType === "passport" &&
    !isValidPassportNumber(normalizedTraveler.documentNumber)
  ) {
    return `出行人${travelerIndex}请输入正确的护照号`;
  }

  if (!normalizedTraveler.phone) {
    return `请填写出行人${travelerIndex}的手机号`;
  }

  if (!isValidMainlandMobile(normalizedTraveler.phone)) {
    return `出行人${travelerIndex}请输入正确的手机号`;
  }

  return "";
}

function validateOrderParticipants({ travelers, contact, peopleCount }) {
  const normalizedContact = contact && typeof contact === "object" ? contact : {};
  const normalizedTravelers = Array.isArray(travelers) ? travelers : [];

  if (!normalizeText(normalizedContact.name)) {
    return "请填写联系人姓名";
  }

  if (!normalizeText(normalizedContact.phone)) {
    return "请填写联系人手机号";
  }

  if (!isValidContactPhone(normalizedContact.phone)) {
    return "请输入正确的联系人手机号";
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
  isValidMainlandMobile,
  isValidPassportNumber,
  normalizeContact,
  normalizeTravelerRecord,
  normalizeTravelers,
  validateOrderParticipants,
  validateTravelerRecord
};

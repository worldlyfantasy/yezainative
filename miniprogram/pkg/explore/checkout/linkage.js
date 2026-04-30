const { buildNormalizedTravelerRecord } = require("./form-validation");

function buildEmptyTravelPerson(index) {
  return {
    index,
    profileId: "",
    travelerRecordId: "",
    source: "manual",
    name: "",
    documentType: "",
    documentTypeIndex: 0,
    documentNumber: "",
    idCard: "",
    phone: "",
    wechat: "",
    email: "",
    gender: "",
    genderIndex: 0,
    birthday: "",
    note: "",
    documents: []
  };
}

function bindSavedTravelerToTravelPersons(travelPersons, targetIndex, savedTraveler) {
  const list = Array.isArray(travelPersons) ? travelPersons : [];
  const index = Number(targetIndex);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return list.slice();
  }

  const normalized = buildNormalizedTravelerRecord(savedTraveler || {}, { inferDocumentType: false });
  const current = buildNormalizedTravelerRecord(list[index] || {}, { inferDocumentType: false });
  const nextTraveler = {
    ...buildEmptyTravelPerson(current.index || index + 1),
    ...current,
    ...normalized,
    profileId: normalized.profileId || current.profileId,
    travelerRecordId: normalized.travelerRecordId || current.travelerRecordId,
    source: normalized.source || current.source || "manual"
  };

  return list.map((item, itemIndex) => (itemIndex === index ? nextTraveler : item));
}

module.exports = {
  bindSavedTravelerToTravelPersons
};

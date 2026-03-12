const AUDIT_MODE = true;

function isAuditMode() {
  return AUDIT_MODE;
}

function pickAuditText(defaultText, auditText) {
  return AUDIT_MODE ? auditText : defaultText;
}

module.exports = {
  AUDIT_MODE,
  isAuditMode,
  pickAuditText
};

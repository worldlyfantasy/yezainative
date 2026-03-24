const cloud = require("wx-server-sdk");
const cloudbase = require("@cloudbase/node-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const sqlApp = cloudbase.init({
  env: process.env.TCB_ENV || "yezai-3gr73wd48057512e"
});
const models = sqlApp.models;
const runSQL = models.$runSQL || models.runSQL;
const rdb = sqlApp.rdb();
const QUERY_BATCH_SIZE = 100;
const SERVICES_COLLECTION = "services";

function getSQLRows(result) {
  const data = result && result.data ? result.data : {};
  return Array.isArray(data.executeResultList) ? data.executeResultList : [];
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePositiveInteger(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function listCollection(name) {
  const rows = [];
  let offset = 0;

  while (true) {
    const result = await db.collection(name).skip(offset).limit(QUERY_BATCH_SIZE).get();
    const batch = result.data || [];
    rows.push(...batch);

    if (batch.length < QUERY_BATCH_SIZE) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

async function findServicePeriodByCode(periodCode) {
  if (typeof runSQL !== "function") {
    throw new Error("models.$runSQL unavailable");
  }

  const result = await runSQL(
    "SELECT `periodCode` FROM `ServicePeriod` WHERE `periodCode` = {{periodCode}} LIMIT 1",
    {
      periodCode
    }
  );
  const data = getSQLRows(result);

  return Array.isArray(data) && data.length ? data[0] : null;
}

function buildServicePeriodRecord(service, period) {
  return {
    periodCode: String(period.id || "").trim(),
    serviceSlug: String(service.slug || "").trim(),
    serviceName: String(service.name || "").trim(),
    creatorId: String(service.creatorId || "").trim(),
    versionName: String(period.versionName || "").trim(),
    dateStart: String(period.dateStart || "").trim(),
    dateEnd: String(period.dateEnd || period.dateStart || "").trim(),
    price: normalizeNumber(period.price, 0),
    minGroup: normalizePositiveInteger(period.minGroup) || 1,
    remainingSeats: Math.max(0, normalizeNumber(period.remainingSeats, 0)),
    status: String(period.status || "available").trim() || "available"
  };
}

function assertLegacyGroupPeriodsEnabled(payload) {
  if (payload && payload.useLegacyGroupPeriods === true) {
    return;
  }

  throw new Error("Legacy services.groupPeriods sync is disabled. Write ServicePeriod directly, or invoke sqlSync with payload.useLegacyGroupPeriods=true for one-off backfill.");
}

async function syncServicePeriods(services) {
  const sourceServices = Array.isArray(services) ? services : await listCollection(SERVICES_COLLECTION);
  let created = 0;
  let updated = 0;

  for (const service of sourceServices) {
    const periods = Array.isArray(service.groupPeriods) ? service.groupPeriods : [];

    for (const period of periods) {
      const record = buildServicePeriodRecord(service, period);
      if (!record.periodCode || !record.serviceSlug || !record.dateStart || !record.dateEnd || record.price <= 0) {
        continue;
      }

      const existing = await findServicePeriodByCode(record.periodCode);

      if (existing) {
        const { error } = await rdb
          .from("ServicePeriod")
          .update(record)
          .eq("periodCode", record.periodCode);

        if (error) {
          throw new Error(error.message || `Failed to update ServicePeriod ${record.periodCode}`);
        }

        updated += 1;
        continue;
      }

      const { error } = await rdb
        .from("ServicePeriod")
        .insert(record);

      if (error) {
        throw new Error(error.message || `Failed to insert ServicePeriod ${record.periodCode}`);
      }

      created += 1;
    }
  }

  return {
    created,
    updated
  };
}

const handlers = {
  syncAll: async (payload) => {
    assertLegacyGroupPeriodsEnabled(payload);
    const services = await listCollection(SERVICES_COLLECTION);
    return {
      servicePeriods: await syncServicePeriods(services)
    };
  },
  syncServicePeriods: async (payload) => {
    assertLegacyGroupPeriodsEnabled(payload);
    const services = await listCollection(SERVICES_COLLECTION);
    return syncServicePeriods(services);
  }
};

exports.main = async (event) => {
  const action = event && event.action ? event.action : "syncAll";
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action}`
    };
  }

  try {
    const data = await handler(event && event.payload ? event.payload : {});
    return {
      ok: true,
      data
    };
  } catch (error) {
    console.error("SQL sync failed", {
      action,
      error
    });
    return {
      ok: false,
      error: error && error.message ? error.message : "SQL sync failed"
    };
  }
};

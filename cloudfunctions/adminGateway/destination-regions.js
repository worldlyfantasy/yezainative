const DESTINATION_REGION_OPTIONS = [
  { label: "华北", value: "cn_north" },
  { label: "东北", value: "cn_northeast" },
  { label: "华东", value: "cn_east" },
  { label: "华中", value: "cn_central" },
  { label: "华南", value: "cn_south" },
  { label: "西南", value: "cn_southwest" },
  { label: "西北", value: "cn_northwest" },
  { label: "港澳台", value: "greater_china_hmt" },
  { label: "东亚", value: "asia_east" },
  { label: "东南亚", value: "asia_southeast" },
  { label: "南亚", value: "asia_south" },
  { label: "中亚", value: "asia_central" },
  { label: "西亚/中东", value: "asia_west_middle_east" },
  { label: "欧洲", value: "europe" },
  { label: "非洲", value: "africa" },
  { label: "北美", value: "north_america" },
  { label: "拉丁美洲", value: "latin_america" },
  { label: "大洋洲", value: "oceania" }
];

const LEGACY_DESTINATION_REGION_BY_SLUG = {
  "aba-highlands": "cn_southwest",
  "qiandong-valley": "cn_southwest",
  "minbei-creek": "cn_east",
  "hexicorridor": "cn_northwest",
  "enxi-gorge": "cn_central",
  "nanjiang-dune": "cn_northwest",
  "songhua-river": "cn_northeast",
  "lancang-source": "cn_southwest",
  "qiongbay-salt": "cn_south",
  "yunnan-rainforest": "cn_southwest",
  "wuyi-ancient": "cn_east",
  "qinghai-lake": "cn_northwest"
};

const DESTINATION_REGION_LABEL_MAP = DESTINATION_REGION_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

function normalizeDestinationRegionCode(value, fallbackValue = "") {
  const code = String(value || fallbackValue || "").trim();
  return Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, code) ? code : "";
}

function inferDestinationRegionCodeBySlug(slug) {
  return normalizeDestinationRegionCode(LEGACY_DESTINATION_REGION_BY_SLUG[String(slug || "").trim()] || "");
}

function resolveDestinationRegionCode(value, slug, fallbackValue = "") {
  return (
    normalizeDestinationRegionCode(value)
    || normalizeDestinationRegionCode(fallbackValue)
    || inferDestinationRegionCodeBySlug(slug)
  );
}

function getDestinationRegionLabel(code) {
  const normalizedCode = normalizeDestinationRegionCode(code);
  return normalizedCode ? DESTINATION_REGION_LABEL_MAP[normalizedCode] : "";
}

module.exports = {
  DESTINATION_REGION_OPTIONS,
  normalizeDestinationRegionCode,
  resolveDestinationRegionCode,
  getDestinationRegionLabel
};

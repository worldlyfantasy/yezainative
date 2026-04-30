const DESTINATION_REGION_OPTIONS = [
  { label: "藏区", value: "cn_tibetan" },
  { label: "新疆", value: "cn_xinjiang" },
  { label: "西北", value: "cn_great_northwest" },
  { label: "江浙沪", value: "cn_jiang_zhe_hu" },
  { label: "华中山水", value: "cn_central_landscape" },
  { label: "云贵川", value: "cn_yun_gui_chuan" },
  { label: "华南海岛", value: "cn_south_islands" },
  { label: "京津冀", value: "cn_jing_jin_ji" },
  { label: "中原", value: "cn_central_plain" },
  { label: "东北", value: "cn_northeast_region" },
  { label: "内蒙古", value: "cn_inner_mongolia" },
  { label: "日韩", value: "intl_japan_korea" },
  { label: "东南亚", value: "intl_southeast_asia" },
  { label: "南亚", value: "intl_south_asia" },
  { label: "中东", value: "intl_middle_east" },
  { label: "欧洲", value: "intl_europe" },
  { label: "美洲", value: "intl_americas" },
  { label: "非洲", value: "intl_africa" },
  { label: "大洋洲", value: "intl_oceania" }
];

const LEGACY_DESTINATION_REGION_CODE_ALIASES = {
  "cn_north": "cn_jing_jin_ji",
  "cn_northeast": "cn_northeast_region",
  "cn_east": "cn_jiang_zhe_hu",
  "cn_central": "cn_central_landscape",
  "cn_south": "cn_south_islands",
  "cn_southwest": "cn_yun_gui_chuan",
  "cn_northwest": "cn_great_northwest",
  "greater_china_hmt": "",
  "asia_east": "intl_japan_korea",
  "asia_southeast": "intl_southeast_asia",
  "asia_south": "intl_south_asia",
  "asia_central": "",
  "asia_west_middle_east": "intl_middle_east",
  "europe": "intl_europe",
  "africa": "intl_africa",
  "north_america": "intl_americas",
  "latin_america": "intl_americas",
  "oceania": "intl_oceania"
};

const DESTINATION_REGION_LABEL_MAP = DESTINATION_REGION_OPTIONS.reduce((map, item) => {
  map[item.value] = item.label;
  return map;
}, {});

function normalizeDestinationRegionCode(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, normalized)) {
    return normalized;
  }

  const aliased = LEGACY_DESTINATION_REGION_CODE_ALIASES[normalized] || "";
  return Object.prototype.hasOwnProperty.call(DESTINATION_REGION_LABEL_MAP, aliased) ? aliased : "";
}

function getDestinationRegionLabel(code) {
  const normalizedCode = normalizeDestinationRegionCode(code);
  return normalizedCode ? DESTINATION_REGION_LABEL_MAP[normalizedCode] : "";
}

module.exports = {
  DESTINATION_REGION_OPTIONS,
  DESTINATION_REGION_LABEL_MAP,
  normalizeDestinationRegionCode,
  getDestinationRegionLabel
};

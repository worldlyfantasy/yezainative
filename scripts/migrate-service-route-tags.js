#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROUTE_TAGS = [
  "城市漫游",
  "慢旅行",
  "徒步与自然",
  "度假放松",
  "亲子&逆向亲子",
  "人宠",
  "摄影创作",
  "瑜伽疗愈",
  "特殊节庆"
];

const DEFAULT_SOURCE = path.join(__dirname, "..", "docs", "cloud-seed", "services.json");

const TAG_RULES = [
  {
    tag: "城市漫游",
    patterns: ["城市", "码头", "厂区", "街区", "渔市", "盐田", "漫步", "漫游", "步行", "旧城", "市集"]
  },
  {
    tag: "慢旅行",
    patterns: ["慢旅行", "慢走", "驻留", "驻足", "共居", "对话", "观察", "体感", "古道", "茶农", "在地", "静心", "节奏"]
  },
  {
    tag: "徒步与自然",
    patterns: ["徒步", "自然", "峡谷", "溪谷", "雨林", "湖岸", "高原", "谷地", "山谷", "沙丘", "水系", "牧场", "露营", "观星", "古道", "河谷"]
  },
  {
    tag: "度假放松",
    patterns: ["度假", "放松", "休整", "黄昏", "聆听", "观星", "客栈", "轻住", "休息", "停驻", "慢居"]
  },
  {
    tag: "亲子&逆向亲子",
    patterns: ["亲子", "孩子", "儿童", "家庭", "爸妈", "父母", "逆向亲子"]
  },
  {
    tag: "人宠",
    patterns: ["宠物", "狗", "犬", "猫", "人宠"]
  },
  {
    tag: "摄影创作",
    patterns: ["摄影", "影像", "相机", "创作", "手帐", "线稿", "记录", "日志", "录音", "采集", "纪实"]
  },
  {
    tag: "瑜伽疗愈",
    patterns: ["瑜伽", "疗愈", "冥想", "呼吸", "身心", "静心", "修复"]
  },
  {
    tag: "特殊节庆",
    patterns: ["节庆", "节日", "庆典", "祭典", "庙会", "节气"]
  }
];

const STYLE_FALLBACKS = {
  城市漫游: ["城市漫游"],
  慢旅行: ["慢旅行"],
  徒步自然: ["徒步与自然"],
  山地穿行: ["徒步与自然"],
  田野考察: ["徒步与自然"],
  公路旅行: ["度假放松"],
  人文在地: ["慢旅行"]
};

const SLUG_OVERRIDES = {
  "ridge-journal": ["徒步与自然", "慢旅行", "摄影创作"],
  "hexi-tracing": ["徒步与自然", "摄影创作", "慢旅行"],
  "lancang-source-lab": ["徒步与自然", "慢旅行"],
  "miao-night-walk": ["慢旅行", "徒步与自然"],
  "salt-pan-diary": ["城市漫游", "慢旅行", "摄影创作"],
  "songhua-dock": ["城市漫游", "慢旅行", "摄影创作"],
  "enxi-residency": ["慢旅行", "摄影创作", "度假放松"],
  "dune-sunset": ["徒步与自然", "度假放松", "摄影创作"],
  "qinghai-loop": ["徒步与自然", "度假放松", "慢旅行"],
  "rainforest-dawn": ["徒步与自然", "慢旅行", "度假放松"],
  "wuyi-ink-trail": ["慢旅行", "徒步与自然", "瑜伽疗愈"],
  "minbei-creek-study": ["徒步与自然", "慢旅行", "摄影创作"]
};

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    write: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
      continue;
    }

    if (arg === "--source") {
      options.source = path.resolve(argv[index + 1] || DEFAULT_SOURCE);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  node scripts/migrate-service-route-tags.js [--write] [--source /path/to/services.json]",
          "",
          "Options:",
          "  --write   Persist inferred tags back to the source JSON file.",
          "  --source  Override the services JSON file path."
        ].join("\n")
      );
      process.exit(0);
    }

    throw new Error(`Unsupported argument: ${arg}`);
  }

  return options;
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function collectServiceText(service) {
  const parts = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  };

  push(service.name);
  push(service.summary);
  uniqueStrings(service.styles).forEach(push);
  uniqueStrings(service.tags).forEach(push);

  const travelDetail = service.travelDetail && typeof service.travelDetail === "object" ? service.travelDetail : {};
  const overview = travelDetail.overview && typeof travelDetail.overview === "object" ? travelDetail.overview : {};
  push(overview.whyJoinText);
  push(overview.suitableText);

  (Array.isArray(travelDetail.highlights) ? travelDetail.highlights : []).forEach((item) => {
    if (item && typeof item === "object") {
      push(item.title);
      push(item.description);
    }
  });

  const itineraryDays = travelDetail.itinerary && Array.isArray(travelDetail.itinerary.days)
    ? travelDetail.itinerary.days
    : [];
  itineraryDays.forEach((day) => {
    if (!day || typeof day !== "object") {
      return;
    }

    push(day.title);
    (Array.isArray(day.modules) ? day.modules : []).forEach((module) => {
      if (module && typeof module === "object") {
        push(module.title);
        push(module.content);
      }
    });
  });

  return parts.join("\n");
}

function scoreTag(text, patterns) {
  return patterns.reduce((score, pattern) => {
    if (!pattern) {
      return score;
    }

    return text.includes(pattern) ? score + 1 : score;
  }, 0);
}

function inferTags(service) {
  const slug = String(service && service.slug ? service.slug : "").trim();
  if (SLUG_OVERRIDES[slug]) {
    return SLUG_OVERRIDES[slug];
  }

  const text = collectServiceText(service);
  const scoredTags = TAG_RULES.map((rule) => ({
    tag: rule.tag,
    score: scoreTag(text, rule.patterns)
  }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || ROUTE_TAGS.indexOf(left.tag) - ROUTE_TAGS.indexOf(right.tag))
    .map((item) => item.tag);

  const fallbackTags = uniqueStrings(
    uniqueStrings(service.styles).flatMap((style) => STYLE_FALLBACKS[style] || [])
  );
  const result = uniqueStrings(scoredTags.concat(fallbackTags)).filter((tag) => ROUTE_TAGS.includes(tag));

  if (!result.length) {
    if (text.includes("城市")) {
      return ["城市漫游"];
    }
    return ["慢旅行"];
  }

  return result.slice(0, 3);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(options.source, "utf8");
  const services = JSON.parse(raw);

  if (!Array.isArray(services)) {
    throw new Error("services seed must be a JSON array");
  }

  const nextServices = services.map((service) => {
    const tags = inferTags(service);
    return Object.assign({}, service, {
      tags,
      styles: tags
    });
  });

  if (options.write) {
    fs.writeFileSync(options.source, `${JSON.stringify(nextServices, null, 2)}\n`, "utf8");
  }

  process.stdout.write(
    `${JSON.stringify(nextServices.map((service) => ({
      slug: service.slug,
      name: service.name,
      tags: service.tags
    })), null, 2)}\n`
  );
}

main();

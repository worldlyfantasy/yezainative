#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROUTE_TAGS = [
  "山野",
  "城市",
  "乡土",
  "户外",
  "研学",
  "文化",
  "内在成长",
  "家庭",
  "特殊节庆"
];

const DEFAULT_SOURCE = path.join(__dirname, "..", "docs", "cloud-seed", "services.json");

const TAG_RULES = [
  {
    tag: "城市",
    patterns: ["城市", "码头", "厂区", "街区", "渔市", "盐田", "漫步", "漫游", "步行", "旧城", "市集"]
  },
  {
    tag: "乡土",
    patterns: ["村落", "寨子", "寨", "乡土", "风土", "人情", "牧场", "茶农", "在地家庭", "共居", "共餐", "村民"]
  },
  {
    tag: "户外",
    patterns: ["徒步", "自然", "峡谷", "溪谷", "雨林", "湖岸", "高原", "谷地", "山谷", "沙丘", "水系", "牧场", "露营", "观星", "古道", "河谷"]
  },
  {
    tag: "山野",
    patterns: ["山野", "山", "谷地", "山谷", "峡谷", "雨林", "湖岸", "高原", "沙丘", "溪谷", "晨雾", "源区", "牧场"]
  },
  {
    tag: "家庭",
    patterns: ["亲子", "孩子", "儿童", "家庭", "爸妈", "父母", "逆向亲子", "银发", "宠物", "狗", "犬", "猫"]
  },
  {
    tag: "研学",
    patterns: ["研学", "看展", "石窟", "学习", "研究", "观察", "实验", "采样", "讲义", "练习", "记录", "水文", "观测"]
  },
  {
    tag: "文化",
    patterns: ["人文", "历史", "故事", "歌师", "织娘", "寺院", "茶文化", "工业遗产", "工人", "对话", "访谈", "礼仪", "在地"]
  },
  {
    tag: "内在成长",
    patterns: ["瑜伽", "疗愈", "冥想", "呼吸", "身心", "静心", "修复"]
  },
  {
    tag: "特殊节庆",
    patterns: ["节庆", "节日", "庆典", "祭典", "庙会", "节气"]
  }
];

const STYLE_FALLBACKS = {
  城市漫游: ["城市"],
  慢旅行: ["文化"],
  徒步与自然: ["户外"],
  徒步自然: ["户外"],
  山地穿行: ["户外"],
  田野考察: ["研学"],
  公路旅行: ["山野"],
  人文在地: ["文化"],
  摄影创作: ["研学"],
  瑜伽疗愈: ["内在成长"],
  人宠: ["家庭"],
  "亲子&逆向亲子": ["家庭"]
};

const SLUG_OVERRIDES = {
  "ridge-journal": ["户外", "山野", "研学"],
  "hexi-tracing": ["山野", "文化", "研学"],
  "lancang-source-lab": ["研学", "山野", "户外"],
  "miao-night-walk": ["乡土", "文化", "户外"],
  "salt-pan-diary": ["乡土", "城市", "研学"],
  "songhua-dock": ["城市", "文化", "研学"],
  "enxi-residency": ["乡土", "文化", "山野"],
  "dune-sunset": ["山野", "户外", "内在成长"],
  "qinghai-loop": ["山野", "户外", "乡土"],
  "rainforest-dawn": ["山野", "研学", "乡土"],
  "wuyi-ink-trail": ["内在成长", "文化", "户外"],
  "minbei-creek-study": ["山野", "研学", "户外"]
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
      return ["城市"];
    }
    return ["文化"];
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

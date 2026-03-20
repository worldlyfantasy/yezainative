const fs = require("fs");
const path = require("path");

const { creators } = require("../miniprogram/mock/creators");
const { destinations } = require("../miniprogram/mock/destinations");
const { services } = require("../miniprogram/mock/services");
const { ideas } = require("../miniprogram/mock/ideas");
const { normalizeHeroSlides } = require("../miniprogram/services/image-ref");
const { defaultConfigs } = require("../cloudfunctions/configGateway/config-definitions");

const outputDir = path.join(__dirname, "..", "docs", "cloud-seed");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(filename, data) {
  const targetPath = path.join(outputDir, filename);
  fs.writeFileSync(targetPath, JSON.stringify(cloneJson(data), null, 2) + "\n", "utf8");
}

function buildHomePageConfig() {
  return {
    heroSlides: normalizeHeroSlides([
      {
        id: "hero-aba-presence",
        variant: "photo",
        image: "https://7965-yezai-3gr73wd48057512e-1407224025.tcb.qcloud.la/content/home/hero/hero-aba-presence.jpg",
        mark: "野哉",
        title: "山风缓下来，人才听见远处的路。",
        desc: "先靠近一片土地，再靠近在那里生活的人。",
        targetIdeaSlug: "aba-presence"
      },
      {
        id: "hero-brand",
        variant: "photo",
        tone: "muted",
        cloudFileID:
          "cloud://yezai-3gr73wd48057512e.7965-yezai-3gr73wd48057512e-1407224025/brandasset/hero2.png",
        showMask: true,
        mark: "",
        title: "",
        desc: "",
        subDesc: ""
      }
    ]),
    featuredCreatorSlugs: creators.slice(0, 3).map((item) => item.slug),
    featuredDestinationSlugs: destinations.slice(0, 4).map((item) => item.slug),
    featuredIdeaSlugs: ideas.slice(0, 3).map((item) => item.slug)
  };
}

function buildAppConfigs() {
  const pageConfigKeys = Object.keys(defaultConfigs).filter((key) => key !== "homePage");
  return [
    {
      key: "homePage",
      value: buildHomePageConfig()
    },
    ...pageConfigKeys.map((key) => ({
      key,
      value: defaultConfigs[key]
    }))
  ];
}

function main() {
  ensureDir(outputDir);

  writeJson("creators.json", creators);
  writeJson("destinations.json", destinations);
  writeJson("services.json", services);
  writeJson("ideas.json", ideas);
  writeJson("app_configs.json", buildAppConfigs());
  writeJson("users.json", []);
  writeJson("orders.json", []);
  writeJson("favorites.json", []);

  process.stdout.write(`Cloud seed exported to ${outputDir}\n`);
}

main();

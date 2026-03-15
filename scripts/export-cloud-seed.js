const fs = require("fs");
const path = require("path");

const { creators } = require("../miniprogram/mock/creators");
const { destinations } = require("../miniprogram/mock/destinations");
const { services } = require("../miniprogram/mock/services");
const { ideas } = require("../miniprogram/mock/ideas");
const staticConfig = require("../miniprogram/config/static-config");
const { getHomePageData } = require("../miniprogram/services/content");

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

function buildAppConfigs() {
  const homePageData = getHomePageData();
  return [
    {
      key: "homePage",
      value: {
        heroSlides: homePageData.heroSlides || [],
        featuredCreatorSlugs: (homePageData.featuredCreators || []).map((item) => item.slug),
        featuredDestinationSlugs: (homePageData.featuredDestinations || []).map((item) => item.slug),
        featuredIdeaSlugs: (homePageData.featuredIdeas || []).map((item) => item.slug)
      }
    },
    {
      key: "howItWorksPage",
      value: staticConfig.getHowItWorksPageConfig()
    },
    {
      key: "checkoutPage",
      value: staticConfig.getCheckoutPageConfig()
    },
    {
      key: "serviceDetailPage",
      value: staticConfig.getServiceDetailPageConfig()
    },
    {
      key: "paymentResultPage",
      value: staticConfig.getPaymentResultPageConfig()
    },
    {
      key: "orderDetailPage",
      value: staticConfig.getOrderDetailPageConfig()
    },
    {
      key: "favoritesPage",
      value: staticConfig.getFavoritesPageConfig()
    }
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

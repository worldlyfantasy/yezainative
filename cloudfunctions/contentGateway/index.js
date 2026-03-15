const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const CONFIG_COLLECTION = "app_configs";
const COLLECTIONS = {
  creators: "creators",
  destinations: "destinations",
  services: "services",
  ideas: "ideas"
};
const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseIdeaBody(body) {
  if (!body) {
    return [];
  }

  return String(body)
    .split("\n\n")
    .map((block, index) => {
      if (block.indexOf("###") === 0) {
        return {
          id: `block-${index}`,
          type: "heading",
          content: block.replace("###", "").trim()
        };
      }

      if (block.indexOf(">") === 0) {
        return {
          id: `block-${index}`,
          type: "quote",
          content: block.replace(">", "").trim()
        };
      }

      return {
        id: `block-${index}`,
        type: "paragraph",
        content: block.trim()
      };
    });
}

function formatPeriodDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = WEEKDAY_NAMES[date.getDay()];
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} ${week}`;
}

function buildGroupPeriodDisplay(period) {
  const startDateLabel = formatPeriodDate(period.dateStart);
  const endDateLabel = formatPeriodDate(period.dateEnd);
  const dateLabel = period.dateStart === period.dateEnd ? startDateLabel : `${startDateLabel} - ${endDateLabel}`;
  const statusText = period.status === "confirmed" ? "确定成行" : "可报名";

  return Object.assign({}, period, {
    dateLabel,
    startDateLabel,
    endDateLabel,
    statusText
  });
}

function getServiceCreatorRoles(service) {
  const customRoles = Array.isArray(service.creatorRoles)
    ? service.creatorRoles.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (customRoles.length) {
    return customRoles;
  }

  if (service.type === "带团旅行") {
    return ["创作者", "带领者"];
  }

  if (service.type === "定制规划") {
    return ["创作者", "策划者"];
  }

  return ["创作者"];
}

async function listCollection(name) {
  try {
    const result = await db.collection(name).limit(100).get();
    return (result.data || []).filter((item) => item.status !== "inactive");
  } catch (error) {
    return [];
  }
}

async function getConfigValue(key) {
  try {
    const result = await db.collection(CONFIG_COLLECTION).where({ key }).limit(1).get();
    if (!result.data || !result.data.length) {
      return null;
    }

    const doc = result.data[0];
    return doc.value && typeof doc.value === "object" ? doc.value : doc;
  } catch (error) {
    return null;
  }
}

function buildOptionList(items, mode) {
  return [{ label: "全部", value: "" }].concat(
    (items || []).map((item) => {
      if (mode === "destination") {
        return {
          label: item.name,
          value: item.slug
        };
      }

      return {
        label: item,
        value: item
      };
    })
  );
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function filterCreators(creators, options) {
  const filters = options || {};
  return (creators || []).filter((creator) => {
    const matchDestination = filters.destination ? (creator.destinationSlugs || []).includes(filters.destination) : true;
    const matchStyle = filters.style ? (creator.tags || []).includes(filters.style) : true;
    return matchDestination && matchStyle;
  });
}

function filterDestinations(destinations, search) {
  const keyword = String(search || "").trim();
  if (!keyword) {
    return destinations || [];
  }

  return (destinations || []).filter((destination) => {
    return String(destination.name || "").includes(keyword) || String(destination.description || "").includes(keyword);
  });
}

function filterServices(services, options) {
  const filters = options || {};
  return (services || []).filter((service) => {
    const matchDestination = filters.destinationSlug ? (service.destinationSlugs || []).includes(filters.destinationSlug) : true;
    const matchType = filters.type ? service.type === filters.type : true;
    const matchStyle = filters.style ? (service.styles || []).includes(filters.style) : true;
    return matchDestination && matchType && matchStyle;
  });
}

function ensureContentCollections(payload) {
  if (!payload.creators.length || !payload.destinations.length || !payload.services.length || !payload.ideas.length) {
    throw new Error("Cloud content collections are empty");
  }
}

async function loadContentData() {
  const [creators, destinations, services, ideas] = await Promise.all([
    listCollection(COLLECTIONS.creators),
    listCollection(COLLECTIONS.destinations),
    listCollection(COLLECTIONS.services),
    listCollection(COLLECTIONS.ideas)
  ]);

  const payload = { creators, destinations, services, ideas };
  ensureContentCollections(payload);
  return payload;
}

async function getHomePageData() {
  const { creators, destinations, ideas } = await loadContentData();
  const homeConfig = (await getConfigValue("homePage")) || {};

  const featuredCreatorSlugs = homeConfig.featuredCreatorSlugs || [];
  const featuredDestinationSlugs = homeConfig.featuredDestinationSlugs || [];
  const featuredIdeaSlugs = homeConfig.featuredIdeaSlugs || [];

  const featuredCreators = featuredCreatorSlugs.length
    ? creators.filter((creator) => featuredCreatorSlugs.includes(creator.slug))
    : creators.slice(0, 3);
  const featuredDestinations = featuredDestinationSlugs.length
    ? destinations.filter((destination) => featuredDestinationSlugs.includes(destination.slug))
    : destinations.slice(0, 4);
  const featuredIdeas = (featuredIdeaSlugs.length
    ? ideas.filter((idea) => featuredIdeaSlugs.includes(idea.slug))
    : ideas.slice(0, 3)
  ).map((idea) => {
    const author = creators.find((creator) => creator.id === idea.authorId);
    return Object.assign({}, idea, {
      authorName: author ? author.name : ""
    });
  });

  return {
    heroSlides: Array.isArray(homeConfig.heroSlides) && homeConfig.heroSlides.length
      ? homeConfig.heroSlides
      : (ideas[0]
        ? [{
            id: `hero-${ideas[0].slug}`,
            variant: "photo",
            image: ideas[0].cover || "",
            mark: "野哉",
            title: ideas[0].title || "",
            desc: ideas[0].summary || "",
            targetIdeaSlug: ideas[0].slug
          }]
        : []),
    featuredCreators: featuredCreators.length ? featuredCreators : creators.slice(0, 3),
    featuredDestinations: featuredDestinations.length ? featuredDestinations : destinations.slice(0, 4),
    featuredIdeas: featuredIdeas.length
      ? featuredIdeas
      : ideas.slice(0, 3).map((idea) => {
          const author = creators.find((creator) => creator.id === idea.authorId);
          return Object.assign({}, idea, {
            authorName: author ? author.name : ""
          });
        })
  };
}

async function getCreatorsPageData(filters) {
  const { creators, destinations } = await loadContentData();
  const destinationOptions = buildOptionList(destinations, "destination");
  const styleOptions = buildOptionList(unique(creators.reduce((result, creator) => result.concat(creator.tags || []), [])));

  return {
    destinationOptions,
    styleOptions,
    destinationLabels: destinationOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    creators: filterCreators(creators, filters || {})
  };
}

async function getCreatorDetailData(slug) {
  const { creators, destinations, services, ideas } = await loadContentData();
  const creator = creators.find((item) => item.slug === slug);
  if (!creator) {
    return null;
  }

  const creatorDestinations = destinations.filter((destination) => (creator.destinationSlugs || []).includes(destination.slug));
  const relatedServices = services
    .filter((service) => (creator.serviceIds || []).includes(service.id))
    .map((service) => Object.assign({}, service, { creatorName: creator.name }));
  const groupServices = relatedServices.filter((service) => (creator.groupIds || []).includes(service.id));
  const creatorIdeas = ideas.filter((idea) => idea.authorId === creator.id);

  return {
    creator: Object.assign({}, creator, { isFavorited: false }),
    creatorDestinations,
    relatedServices,
    groupServices,
    creatorIdeas
  };
}

async function getDestinationsPageData(search) {
  const { destinations } = await loadContentData();
  return {
    destinations: filterDestinations(destinations, search)
  };
}

async function getDestinationDetailData(slug, filters) {
  const { creators, destinations, services, ideas } = await loadContentData();
  const destination = destinations.find((item) => item.slug === slug);
  if (!destination) {
    return null;
  }

  const typeOptions = buildOptionList(unique(services.map((service) => service.type)));
  const styleOptions = buildOptionList(unique(services.reduce((result, service) => result.concat(service.styles || []), [])));
  const relatedCreators = creators
    .filter((creator) => (creator.destinationSlugs || []).includes(destination.slug))
    .map((creator) => Object.assign({}, creator, { isFavorited: false }));
  const relatedIdeas = ideas
    .filter((idea) => Array.isArray(idea.destinationSlugs) && idea.destinationSlugs.includes(destination.slug))
    .map((idea) => {
      const author = creators.find((creator) => creator.id === idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    });
  const matchedServices = filterServices(
    services,
    Object.assign(
      {
        destinationSlug: destination.slug
      },
      filters || {}
    )
  ).map((service) => {
    const creator = creators.find((item) => item.id === service.creatorId);
    return Object.assign({}, service, {
      creatorName: creator ? creator.name : ""
    });
  });

  return {
    destination: Object.assign({}, destination, { isFavorited: false }),
    typeOptions,
    styleOptions,
    typeLabels: typeOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    relatedCreators,
    relatedIdeas,
    services: matchedServices
  };
}

async function getIdeasPageData(theme, creatorSlug) {
  const { creators, ideas } = await loadContentData();
  let sourceIdeas = ideas;
  let pageTitle = "旅行故事";

  if (creatorSlug) {
    const creator = creators.find((item) => item.slug === creatorSlug);
    if (creator) {
      sourceIdeas = sourceIdeas.filter((idea) => idea.authorId === creator.id);
      pageTitle = `${creator.name}的故事`;
    }
  }

  const filteredIdeas = creatorSlug
    ? sourceIdeas.filter((idea) => !theme || idea.theme === theme)
    : (!theme ? sourceIdeas : sourceIdeas.filter((idea) => idea.theme === theme));
  const themes = creatorSlug
    ? unique(sourceIdeas.map((idea) => idea.theme))
    : unique(ideas.map((idea) => idea.theme));

  return {
    themes,
    pageTitle,
    ideas: filteredIdeas
  };
}

async function getIdeaDetailData(slug) {
  const { creators, ideas } = await loadContentData();
  const idea = ideas.find((item) => item.slug === slug);
  if (!idea) {
    return null;
  }

  const author = creators.find((creator) => creator.id === idea.authorId) || null;
  return {
    idea: Object.assign({}, idea, { isFavorited: false }),
    author,
    blocks: parseIdeaBody(idea.body)
  };
}

async function getServiceDetailData(slug) {
  const { creators, destinations, services } = await loadContentData();
  const service = services.find((item) => item.slug === slug);
  if (!service) {
    return null;
  }

  const creator = creators.find((item) => item.id === service.creatorId) || null;
  const relatedDestinations = destinations.filter((item) => (service.destinationSlugs || []).includes(item.slug));
  const heroCover = service.cover || (relatedDestinations[0] ? relatedDestinations[0].cover : "");
  const photoGallery = Array.isArray(service.gallery) && service.gallery.length ? service.gallery : heroCover ? [heroCover] : [];
  const photoBaseList = heroCover ? [heroCover].concat(photoGallery) : photoGallery;
  const photoTotal = photoBaseList.length;
  const mediaTabs = [
    {
      key: "landscape",
      label: "景观",
      images: photoBaseList.slice(0, 2)
    },
    {
      key: "experience",
      label: "体验",
      images: photoBaseList.slice(1, 3).length ? photoBaseList.slice(1, 3) : photoBaseList.slice(0, 1)
    },
    {
      key: "stay",
      label: "住宿",
      images: photoBaseList.slice(2, 4).length ? photoBaseList.slice(2, 4) : photoBaseList.slice(0, 1)
    }
  ];

  return {
    service: Object.assign({}, service, {
      isFavorited: false,
      creatorRoles: getServiceCreatorRoles(service)
    }),
    travelDetail: service.travelDetail || null,
    creator,
    relatedDestinations,
    heroCover,
    photoGallery,
    photoTotal,
    mediaTabs,
    groupPeriods: Array.isArray(service.groupPeriods) ? service.groupPeriods.map(buildGroupPeriodDisplay) : []
  };
}

const handlers = {
  getHomePageData: (payload) => getHomePageData(payload),
  getCreatorsPageData: (payload) => getCreatorsPageData(payload.filters),
  getCreatorDetailData: (payload) => getCreatorDetailData(payload.slug),
  getDestinationsPageData: (payload) => getDestinationsPageData(payload.search),
  getDestinationDetailData: (payload) => getDestinationDetailData(payload.slug, payload.filters),
  getIdeasPageData: (payload) => getIdeasPageData(payload.theme, payload.creatorSlug),
  getIdeaDetailData: (payload) => getIdeaDetailData(payload.slug),
  getServiceDetailData: (payload) => getServiceDetailData(payload.slug)
};

exports.main = async (event) => {
  const action = event && event.action;
  const payload = event && event.payload ? event.payload : {};
  const handler = handlers[action];

  if (!handler) {
    return {
      ok: false,
      error: `Unsupported action: ${action || ""}`
    };
  }

  try {
    const data = await handler(payload);
    return {
      ok: true,
      data
    };
  } catch (error) {
    return {
      ok: false,
      error: error && error.message ? error.message : "Content gateway error"
    };
  }
};

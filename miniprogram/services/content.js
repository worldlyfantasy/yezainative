const { creators, destinations, services, ideas } = require("../mock/index");
const {
  getCreatorBySlug,
  getDestinationBySlug,
  getServiceBySlug,
  getIdeaBySlug,
  filterCreators,
  filterDestinations,
  filterIdeasByTheme,
  filterServices,
  getUniqueCreatorStyles,
  getUniqueIdeaThemes,
  getUniqueServiceTypes,
  getUniqueServiceStyles
} = require("../mock/helpers");
const { homeSteps, howItWorksFlows } = require("../mock/static-content");
const { parseIdeaBody } = require("../utils/content");
const { isFavorited } = require("./favorites");

function buildOptionList(items, mode) {
  return [{ label: "全部", value: "" }].concat(
    items.map((item) => {
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

function getHomePageData() {
  return {
    featuredCreators: creators.slice(0, 3),
    featuredDestinations: destinations.slice(0, 4),
    featuredIdeas: ideas.slice(0, 3).map((idea) => {
      const author = creators.find((creator) => creator.id === idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    }),
    steps: homeSteps
  };
}

function getCreatorsPageData(filters) {
  const destinationOptions = buildOptionList(destinations, "destination");
  const styleOptions = buildOptionList(getUniqueCreatorStyles());
  return {
    destinationOptions,
    styleOptions,
    destinationLabels: destinationOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    creators: filterCreators(filters || {})
  };
}

function getCreatorDetailData(slug) {
  const creator = getCreatorBySlug(slug);
  if (!creator) {
    return null;
  }

  const creatorDestinations = destinations.filter((destination) => creator.destinationSlugs.includes(destination.slug));
  const relatedServices = services
    .filter((service) => creator.serviceIds.includes(service.id))
    .map((service) => Object.assign({}, service, { creatorName: creator.name }));
  const groupServices = relatedServices.filter((service) => creator.groupIds.includes(service.id));

  return {
    creator,
    creatorDestinations,
    relatedServices,
    groupServices
  };
}

function getDestinationsPageData(search) {
  return {
    destinations: filterDestinations(search || "")
  };
}

function getDestinationDetailData(slug, filters) {
  const destination = getDestinationBySlug(slug);
  if (!destination) {
    return null;
  }

  const typeOptions = buildOptionList(getUniqueServiceTypes());
  const styleOptions = buildOptionList(getUniqueServiceStyles());
  const relatedCreators = creators
    .filter((creator) => creator.destinationSlugs.includes(destination.slug))
    .map((creator) => ({
      id: creator.id,
      slug: creator.slug,
      name: creator.name,
      stance: creator.stance
    }));
  const matchedServices = filterServices(
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
    destination: Object.assign({}, destination, {
      isFavorited: isFavorited("destinations", destination.slug)
    }),
    typeOptions,
    styleOptions,
    typeLabels: typeOptions.map((item) => item.label),
    styleLabels: styleOptions.map((item) => item.label),
    relatedCreators,
    services: matchedServices
  };
}

function getIdeasPageData(theme) {
  return {
    themes: getUniqueIdeaThemes(),
    ideas: filterIdeasByTheme(theme).map((idea) => {
      const author = creators.find((creator) => creator.id === idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    })
  };
}

function getIdeaDetailData(slug) {
  const idea = getIdeaBySlug(slug);
  if (!idea) {
    return null;
  }

  const author = creators.find((creator) => creator.id === idea.authorId) || null;

  return {
    idea: Object.assign({}, idea, {
      isFavorited: isFavorited("ideas", idea.slug)
    }),
    author,
    blocks: parseIdeaBody(idea.body)
  };
}

function getServiceDetailData(slug) {
  const service = getServiceBySlug(slug);
  if (!service) {
    return null;
  }

  const creator = creators.find((item) => item.id === service.creatorId) || null;
  const relatedDestinations = destinations.filter((item) => service.destinationSlugs.includes(item.slug));
  const heroCover = relatedDestinations[0] ? relatedDestinations[0].cover : "";

  return {
    service: Object.assign({}, service, {
      isFavorited: isFavorited("services", service.slug)
    }),
    creator,
    relatedDestinations,
    heroCover
  };
}

function getHowItWorksData() {
  return {
    flows: howItWorksFlows
  };
}

module.exports = {
  getHomePageData,
  getCreatorsPageData,
  getCreatorDetailData,
  getDestinationsPageData,
  getDestinationDetailData,
  getIdeasPageData,
  getIdeaDetailData,
  getServiceDetailData,
  getHowItWorksData
};

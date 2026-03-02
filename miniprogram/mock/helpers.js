const { creators, destinations, services, ideas } = require("./index");

function getCreatorBySlug(slug) {
  return creators.find((item) => item.slug === slug);
}

function getDestinationBySlug(slug) {
  return destinations.find((item) => item.slug === slug);
}

function getServiceBySlug(slug) {
  return services.find((item) => item.slug === slug);
}

function getIdeaBySlug(slug) {
  return ideas.find((item) => item.slug === slug);
}

function filterCreators(options = {}) {
  const { destination, style } = options;
  return creators.filter((creator) => {
    const matchDestination = destination ? creator.destinationSlugs.includes(destination) : true;
    const matchStyle = style ? creator.tags.includes(style) : true;
    return matchDestination && matchStyle;
  });
}

function filterDestinations(search) {
  if (!search) {
    return destinations;
  }

  const keyword = String(search).trim();
  if (!keyword) {
    return destinations;
  }

  return destinations.filter((destination) => {
    return destination.name.includes(keyword) || destination.description.includes(keyword);
  });
}

function filterIdeasByTheme(theme) {
  if (!theme) {
    return ideas;
  }

  return ideas.filter((idea) => idea.theme === theme);
}

function filterServices(options = {}) {
  const { destinationSlug, type, style } = options;

  return services.filter((service) => {
    const matchDestination = destinationSlug ? service.destinationSlugs.includes(destinationSlug) : true;
    const matchType = type ? service.type === type : true;
    const matchStyle = style ? service.styles.includes(style) : true;
    return matchDestination && matchType && matchStyle;
  });
}

function getUniqueCreatorStyles() {
  return Array.from(new Set(creators.reduce((result, creator) => result.concat(creator.tags), [])));
}

function getUniqueIdeaThemes() {
  return Array.from(new Set(ideas.map((idea) => idea.theme)));
}

function getUniqueServiceTypes() {
  return Array.from(new Set(services.map((service) => service.type)));
}

function getUniqueServiceStyles() {
  return Array.from(new Set(services.reduce((result, service) => result.concat(service.styles), [])));
}

module.exports = {
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
};

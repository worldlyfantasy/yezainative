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
const { howItWorksFlows } = require("../mock/static-content");
const { parseIdeaBody } = require("../utils/content");
const { isFavorited } = require("./favorites");
const { pickAuditText } = require("../utils/audit");
const { getServiceCreatorRoles } = require("./service-roles");

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
    heroSlides: [
      {
        id: "hero-aba-presence",
        variant: "photo",
        image: "https://picsum.photos/seed/yezai-landing/1600/900",
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
    ],
    featuredCreators: creators.slice(0, 3),
    featuredDestinations: destinations.slice(0, 4),
    featuredIdeas: ideas.slice(0, 3).map((idea) => {
      const author = creators.find((creator) => creator.id === idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    })
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
  const creatorIdeas = (ideas || []).filter((idea) => idea.authorId === creator.id);

  return {
    creator: Object.assign({}, creator, {
      isFavorited: isFavorited("creators", creator.slug)
    }),
    creatorDestinations,
    relatedServices,
    groupServices,
    creatorIdeas
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
    .map((creator) =>
      Object.assign({}, creator, {
        isFavorited: isFavorited("creators", creator.slug)
      })
    );
  const relatedIdeas = (ideas || [])
    .filter((idea) => idea.destinationSlugs && idea.destinationSlugs.includes(destination.slug))
    .map((idea) => {
      const author = creators.find((c) => c.id === idea.authorId);
      return Object.assign({}, idea, {
        authorName: author ? author.name : ""
      });
    });
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
    relatedIdeas,
    services: matchedServices
  };
}

function getIdeasPageData(theme, creatorSlug) {
  let sourceIdeas = ideas || [];
  let pageTitle = "旅行故事";
  if (creatorSlug) {
    const creator = creators.find((c) => c.slug === creatorSlug);
    if (creator) {
      sourceIdeas = sourceIdeas.filter((idea) => idea.authorId === creator.id);
      pageTitle = `${creator.name}的故事`;
    }
  }
  const filteredByTheme = filterIdeasByTheme(theme);
  const filteredIdeas = creatorSlug
    ? sourceIdeas.filter((idea) => !theme || idea.theme === theme)
    : filteredByTheme;
  const themes = creatorSlug
    ? Array.from(new Set(sourceIdeas.map((i) => i.theme).filter(Boolean)))
    : getUniqueIdeaThemes();

  return {
    themes,
    pageTitle,
    ideas: filteredIdeas
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

const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function formatPeriodDate(dateStr) {
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const week = WEEKDAY_NAMES[d.getDay()];
  return `${String(m).padStart(2, "0")}/${String(day).padStart(2, "0")} ${week}`;
}

function buildGroupPeriodDisplay(period) {
  const startDateLabel = formatPeriodDate(period.dateStart);
  const endDateLabel = formatPeriodDate(period.dateEnd);
  const dateLabel =
    period.dateStart === period.dateEnd
      ? startDateLabel
      : `${startDateLabel} - ${endDateLabel}`;
  const statusText = period.status === "confirmed" ? "确定成行" : "可报名";
  return Object.assign({}, period, { dateLabel, startDateLabel, endDateLabel, statusText });
}

function getServiceTagValue(tags, key) {
  const tag = (tags || []).find((item) => item.key === key);
  return tag ? tag.value : "";
}

function getServiceTimelineDisplayText(timelineText) {
  const normalized = String(timelineText || "").trim();
  return pickAuditText(normalized, normalized.replace(/支付后/g, "报名确认后"));
}

function getServiceAdjustmentDisplayText(refundText) {
  const normalized = String(refundText || "").trim();
  return pickAuditText(
    normalized || "具体退款及改期规则以最终确认方案为准。",
    "如需调整或取消，请尽快联系平台确认当次行程的可调整空间与处理方式，具体以行前确认结果为准。"
  );
}

function getItineraryDayCount(service) {
  const periods = service.groupPeriods || [];
  const firstPeriod = periods[0];

  if (firstPeriod && firstPeriod.dateStart && firstPeriod.dateEnd) {
    const start = new Date(firstPeriod.dateStart);
    const end = new Date(firstPeriod.dateEnd);
    const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    if (Number.isFinite(diff) && diff > 0) {
      return Math.min(Math.max(diff, 3), 8);
    }
  }

  const matches = String(service.durationTag || "").match(/\d+/g);
  if (matches && matches.length) {
    const parsed = parseInt(matches[matches.length - 1], 10);
    if (Number.isFinite(parsed)) {
      return Math.min(Math.max(parsed, 3), 8);
    }
  }

  return 5;
}

function getHighlightImages(photoBaseList, startIndex, count) {
  const images = (photoBaseList || []).slice(startIndex, startIndex + count).filter(Boolean);
  if (images.length) {
    return images;
  }

  return (photoBaseList || []).slice(0, 1).filter(Boolean);
}

function buildDefaultHighlights(service, tags, photoBaseList, meetingPoint, dayCount) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const highlightTheme = styles[0] || "在地体验";
  const secondaryTheme = styles[1] || "路线推进";

  return [
    {
      id: `${service.slug}-highlight-core`,
      title: `${service.name}的核心体验`,
      description: service.creatorQuote || service.summary || "围绕目的地、人物与在地经验展开本次行程安排。",
      images: getHighlightImages(photoBaseList, 0, 2)
    },
    {
      id: `${service.slug}-highlight-method`,
      title: `围绕${highlightTheme}建立可执行的行程节奏`,
      description:
        deliverables.length > 0
          ? `本次内容将结合${deliverables.join("、")}来组织每日推进方式，确保信息、体验与节奏都能落到具体安排。`
          : `围绕${highlightTheme}与${secondaryTheme}安排每日节奏，兼顾实际行进效率与内容承载。`,
      images: getHighlightImages(photoBaseList, 1, 2)
    },
    {
      id: `${service.slug}-highlight-plan`,
      title: `${meetingPoint || "指定集合点"}出发的完整安排`,
      description: pickAuditText(
        `当前 mock 版本按 ${dayCount} 天结构组织亮点、行程、费用与须知，后续接入接口后可直接替换为创作者配置内容。`,
        `当前页面按 ${dayCount} 天结构展示亮点、行程、费用与须知，方便你快速判断是否适合报名。`
      ),
      images: getHighlightImages(photoBaseList, 2, 2)
    }
  ];
}

function buildDefaultItinerary(service, tags, dayCount) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint") || "指定集合点";
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const days = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const isFirstDay = day === 1;
    const isLastDay = day === dayCount;
    const isMiddleDay = day === Math.ceil(dayCount / 2);
    const styleLabel = styles.length ? styles[(day - 1) % styles.length] : "在地体验";
    const focusDeliverable = deliverables.length ? deliverables[(day - 1) % deliverables.length] : "行程内容";

    let dayTitle = `${service.name} 第${day}日推进`;
    if (isFirstDay) {
      dayTitle = `${meetingPoint}集合，确认本次安排`;
    } else if (isLastDay) {
      dayTitle = "回到城市收束，完成本次行程复盘";
    }

    const modules = [
      {
        type: "schedule",
        title: "当日行程",
        content: isFirstDay
          ? `在${meetingPoint}完成集合与签到，确认成员信息、节奏安排和行前说明，围绕“${service.summary}”同步本次路线重点。`
          : isLastDay
            ? "上午完成最后一段内容或收尾安排，随后返回集合城市，整理记录与反馈，确认后续交付或复盘方式。"
            : `围绕${styleLabel}推进当日节奏，结合${focusDeliverable}安排步行、停留、观察或沟通时段，确保内容体验与实际推进保持平衡。`
      },
      {
        type: "transport",
        title: "交通",
        content: isFirstDay
          ? `往返${meetingPoint}的大交通需自理，集合后按现场通知统一衔接后续安排。`
          : isLastDay
            ? "根据当日收尾节点统一返程或原地解散，具体集合时间以领队通知为准。"
            : "以步行、短驳接驳或现场协调交通为主，实际节奏会根据当日路况与团队状态微调。"
      },
      {
        type: "meals",
        title: "餐食",
        content: "餐食安排以当天节点为准，行进过程中建议自备轻补给和饮水，避免临时断档。"
      },
      {
        type: "accommodation",
        title: "住宿",
        content:
          service.type === "带团旅行"
            ? "如涉及住宿或落脚点，将按当日推进节点安排，并以最终行前通知为准。"
            : "如涉及留宿或驻点，将根据最终确认方案执行；部分服务类型可能不含住宿。"
      }
    ];

    if (isMiddleDay) {
      modules.push({
        type: "tips",
        title: "温馨提示",
        content: suitable.length
          ? `建议参与者具备“${suitable[0]}”的基础条件，按领队节奏推进并留出体力缓冲。`
          : "当天请重点关注补水、保暖和节奏控制，尽量避免体能透支。"
      });
    }

    if (!isFirstDay && !isLastDay && day % 2 === 0) {
      modules.push({
        type: "support",
        title: "补给说明",
        content: "当天补给与临时调整将根据现场条件处理，建议把常用物品放在容易取用的位置。"
      });
    }

    days.push({
      key: `${service.slug}-day-${day}`,
      day,
      title: dayTitle,
      modules
    });
  }

  return {
    days
  };
}

function buildDefaultCosts(service, tags, dayCount) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint");
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const exclusions = Array.isArray(service.exclusions) ? service.exclusions : [];

  const include = [
    {
      label: "服务",
      content:
        deliverables.length > 0
          ? `包含${deliverables.slice(0, 3).join("、")}等当前页面所述的主要服务内容。`
          : "包含页面当前展示的主要服务内容与基础安排。"
    },
    {
      label: "带领",
      content: "包含创作者/领队沟通、流程说明与必要的过程协作安排。"
    },
    {
      label: "节奏",
      content: pickAuditText(
        `本次 mock 版本按 ${dayCount} 天节奏组织结构，后续可由真实接口替换具体日程内容。`,
        `当前页面展示的是本次行程的参考节奏，具体集合细节与行前准备会在确认后同步。`
      )
    }
  ];

  if (meetingPoint) {
    include.unshift({
      label: "集合",
      content: `${meetingPoint}作为默认集合信息参考，最终以实际确认安排为准。`
    });
  }

  const exclude = exclusions.length
    ? exclusions.map((item, index) => ({
        label: (String(item).replace(/[、，,\s].*$/, "").slice(0, 4) || `不含${index + 1}`),
        content: `${item}相关费用需根据实际情况自行承担。`
      }))
    : [
        {
          label: "自理",
          content: "未明确列入“费用包含”的个人消费及额外需求，默认需自行承担。"
        }
      ];

  const refundRules = [
    {
      days: "规则说明",
      percent: getServiceAdjustmentDisplayText(service.refund)
    }
  ];

  return {
    include,
    exclude,
    refundRules
  };
}

function buildDefaultNotices(service, tags) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint") || "指定集合点";
  const suggestedAge = getServiceTagValue(tags, "suggestedAge");
  const registrationDeadline = getServiceTagValue(tags, "registrationDeadline");
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const notSuitable = Array.isArray(service.notSuitable) ? service.notSuitable : [];

  return [
    {
      key: "traffic",
      title: "关于交通",
      content: registrationDeadline
        ? `建议围绕${meetingPoint}提前规划交通，并尽量在${registrationDeadline}前完成最终确认，预留必要的时间缓冲。`
        : `建议提前规划前往${meetingPoint}的交通，并预留必要的时间缓冲，以免影响集合安排。`
    },
    {
      key: "local",
      title: "关于当地",
      content: pickAuditText(
        `请尊重当地生活节奏与现场规则。页面当前信息为 mock 数据，后续可根据目的地和创作者配置替换为更具体的在地说明。`,
        "请尊重当地生活节奏与现场规则。具体在地安排会根据目的地情况、创作者节奏与出行时间进一步确认。"
      )
    },
    {
      key: "safety",
      title: "安全告知",
      content:
        suitable.length || notSuitable.length
          ? `建议优先满足“${suitable[0] || "具备基本体力"}”等条件参与${suggestedAge ? `，建议年龄参考为${suggestedAge}` : ""}；若存在“${notSuitable[0] || "特殊限制"}”等情况，请在确认前先沟通。`
          : `参与前请确认自身状态与行程强度匹配${suggestedAge ? `，建议年龄参考为${suggestedAge}` : ""}，必要时提前沟通特殊情况。`
    },
    {
      key: "packing",
      title: "准备清单",
      content: `请结合“${getServiceTimelineDisplayText(service.timeline)}”与“${service.revision}”安排，提前准备个人证件、常用物品及页面说明中提到的必要装备。`
    }
  ];
}

function buildOverviewWhyJoinText(service) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const quote = String(service.creatorQuote || "").trim();
  const summary = String(service.summary || "").trim();
  const intro = quote || summary || "把行程的重点体验、节奏与方法落到可执行的安排里。";

  const deliverableLine = deliverables.length
    ? `\n\n你将围绕${deliverables.slice(0, 4).join("、")}展开体验与练习，把收获带回日常。`
    : "";

  return intro + deliverableLine;
}

function buildOverviewSuitableText(service) {
  if (service && service.suitableDetail) {
    return service.suitableDetail;
  }
  const list = Array.isArray(service && service.suitable) ? service.suitable : [];
  const bulletLine = list.length > 0 ? "· " + list.join("\n· ") + "\n\n" : "";
  const mockParagraph1 =
    "这段旅程更适合能接受一定不确定性、愿意按领队节奏推进的旅人。行程中可能包含连续多日行走、早晚温差与天气变化，部分路段对体能与耐心都有要求；如果你更在意慢下来观察、记录与在地体验，会更容易融入这次行程的节奏。";
  const mockParagraph2 =
    "如果你愿意在路上保持补水、保暖与体力分配，并接受根据路况与团队状态做的小幅调整，会获得更完整、更松弛的体验。";
  return bulletLine + mockParagraph1 + "\n\n" + mockParagraph2;
}

function buildServiceOverview(service, tags, photoBaseList, highlights) {
  const highlightFirstImage =
    highlights && highlights[0] && highlights[0].images && highlights[0].images[0]
      ? highlights[0].images[0]
      : "";
  const coverImage = highlightFirstImage || (photoBaseList || [])[0] || "";
  return {
    coverImage,
    whyJoinText: buildOverviewWhyJoinText(service, tags),
    suitableTitle: "这段旅程适合谁",
    suitableText: buildOverviewSuitableText(service)
  };
}

function buildServiceTravelDetail(service, tags, photoBaseList) {
  const meetingPoint = getServiceTagValue(tags, "meetingPoint");
  const dayCount = getItineraryDayCount(service);
  const highlights = buildDefaultHighlights(service, tags, photoBaseList, meetingPoint, dayCount);

  return {
    id: service.id,
    title: service.name,
    sections: [
      { key: "overview", title: "概况", anchorId: "section_overview" },
      { key: "highlights", title: "亮点", anchorId: "section_highlights" },
      { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
      { key: "notices", title: "须知", anchorId: "section_notices" }
    ],
    overview: buildServiceOverview(service, tags, photoBaseList, highlights),
    highlights,
    itinerary: buildDefaultItinerary(service, tags, dayCount),
    costs: buildDefaultCosts(service, tags, dayCount),
    notices: buildDefaultNotices(service, tags)
  };
}

function getServiceDetailData(slug) {
  const service = getServiceBySlug(slug);
  if (!service) {
    return null;
  }

  const creator = creators.find((item) => item.id === service.creatorId) || null;
  const relatedDestinations = destinations.filter((item) => service.destinationSlugs.includes(item.slug));
  const heroCover = service.cover || (relatedDestinations[0] ? relatedDestinations[0].cover : "");
  const photoGallery =
    service.gallery && service.gallery.length ? service.gallery : heroCover ? [heroCover] : [];

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

  const groupPeriods = (service.groupPeriods || []).map(buildGroupPeriodDisplay);
  const tags = Array.isArray(service.tags) ? service.tags : [];
  const creatorRoles = getServiceCreatorRoles(service);
  const travelDetail = service.travelDetail || buildServiceTravelDetail(service, tags, photoBaseList);

  return {
    service: Object.assign({}, service, {
      isFavorited: isFavorited("services", service.slug),
      tags,
      creatorRoles,
      timelineDisplay: getServiceTimelineDisplayText(service.timeline),
      refundDisplay: getServiceAdjustmentDisplayText(service.refund)
    }),
    travelDetail,
    creator,
    relatedDestinations,
    heroCover,
    photoGallery,
    photoTotal,
    mediaTabs,
    groupPeriods
  };
}

function getHowItWorksData() {
  return {
    flows: howItWorksFlows.map((item) => {
      if (item.title !== "托管支付") {
        return item;
      }

      return Object.assign({}, item, {
        title: pickAuditText("托管支付", "报名确认"),
        description: pickAuditText(item.description, "提交报名信息后，平台会与您确认名额、时间与后续安排。")
      });
    })
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

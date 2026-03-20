const cloudImageUrlMap = require("../config/cloud-image-map");

const CLOUD_MEDIA_FALLBACK =
  cloudImageUrlMap["https://picsum.photos/seed/yezai-order-fallback/1200/800"] || "";

function buildServiceMockImage(seed, width, height) {
  const legacyUrl = `https://picsum.photos/seed/${seed}/${width}/${height}`;
  if (cloudImageUrlMap[legacyUrl]) {
    return cloudImageUrlMap[legacyUrl];
  }

  console.warn(`[mock/services] Missing cloud image mapping for ${legacyUrl}`);
  return CLOUD_MEDIA_FALLBACK;
}

function buildServiceMedia(slug) {
  return {
    cover: buildServiceMockImage(`yezai-service-${slug}-cover`, 1200, 900),
    gallery: [
      buildServiceMockImage(`yezai-service-${slug}-detail-1`, 1200, 900),
      buildServiceMockImage(`yezai-service-${slug}-detail-2`, 1200, 900),
      buildServiceMockImage(`yezai-service-${slug}-detail-3`, 1200, 900)
    ]
  };
}

function buildTravelDetailMock(slug) {
  return {
    id: `travel-detail-${slug}`,
    title: "高原谷地徒步手帐",
    overview: {
      coverImage: buildServiceMockImage(`yezai-${slug}-highlight-1a`, 1200, 760),
      whyJoinText:
        "把徒步从“走完”变成“看见”。这段行程会带你在牧场、寺院与峡谷的连续抬升中，用手绘地图与固定记录节奏把观察落到纸面，最终形成可复用的徒步手帐方法。",
      suitableTitle: "这段旅程适合谁",
      suitableText:
        "· 能适应海拔 3500 米以上\n· 想学习地形记录\n· 愿意分担公用装备\n\n这段旅程更适合愿意按团队节奏推进、能接受天气与路况带来弹性调整的旅人。行程中会有连续多日徒步与露营，早晚温差明显，部分路段对体能与耐心都有要求；如果你更在意慢下来观察、记录与在地体验，而不是追求打卡速度，会更容易融入这次行程的节奏。"
    },
    sections: [
      { key: "overview", title: "概况", anchorId: "section_overview" },
      { key: "highlights", title: "亮点", anchorId: "section_highlights" },
      { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
      { key: "notices", title: "须知", anchorId: "section_notices" }
    ],
    highlights: [
      {
        id: "highlight-alpine-ridge",
        title: "从谷地牧场一路抬升到高原褶皱",
        description: "沿溪谷、碎石坡和高山草甸连续行走，海拔梯度清晰，适合用脚去感受高原的空间层次。",
        images: [
          buildServiceMockImage(`yezai-${slug}-highlight-1a`, 1200, 760),
          buildServiceMockImage(`yezai-${slug}-highlight-1b`, 1200, 760)
        ]
      },
      {
        id: "highlight-handbook",
        title: "边走边记录的徒步手帐方法",
        description: "每天留出固定记录时段，创作者会带着大家整理地形、天气、步速与沿途观察，形成可复用的手帐模板。",
        images: [
          buildServiceMockImage(`yezai-${slug}-highlight-2a`, 1200, 760)
        ]
      },
      {
        id: "highlight-local-life",
        title: "和寺院、村落、牧场建立真实连接",
        description: "不是只看风景。路线把寺院停留、牧场午餐和在地家庭借宿串在一起，让行程里有稳定的人与土地关系。",
        images: [
          buildServiceMockImage(`yezai-${slug}-highlight-3a`, 1200, 760),
          buildServiceMockImage(`yezai-${slug}-highlight-3b`, 1200, 760)
        ]
      }
    ],
    itinerary: {
      days: [
        {
          key: "day-1",
          day: 1,
          title: "保山集合，完成出发前校准",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "全国各地抵达保山集合酒店，傍晚完成装备检查、路线说明和高反注意事项同步，建立本次徒步记录模板。"
            },
            {
              type: "transport",
              title: "交通",
              content: "到达保山的大交通自理，集合后统一从酒店步行前往说明会地点。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "晚餐敬请自理，建议在集合酒店周边补充第二天所需高热量零食。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "保山市区轻徒友好酒店，双人标间。"
            }
          ]
        },
        {
          key: "day-2",
          day: 2,
          title: "谷地热身徒步，进入牧场线",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "早餐后乘车至谷地起点，完成 8 公里热身徒步，学习沿途标记溪流、坡向和补给点，傍晚抵达牧场营地。"
            },
            {
              type: "transport",
              title: "交通",
              content: "酒店至徒步起点统一包车约 1.5 小时，之后全程步行。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、路餐和营地热食晚餐。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "牧场轻露营，双人帐篷。"
            }
          ]
        },
        {
          key: "day-3",
          day: 3,
          title: "穿越峡谷台地，学习地形记录",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "今天是整条线路里信息量最高的一天。清晨从溪谷借宿点出发后，先沿着碎石河床缓慢抬升，经过两次短坡切换到台地边缘，再沿着牦牛小道连续横切进入开阔坡面。领队会在第一个垭口示范如何用最少的线条记录坡向、风口、补水点和撤退路线，大家需要在停留的 40 分钟里各自完成一页手帐草图。午后这段会进入长距离缓下撤，看起来好走，但因为地形连续变化、植被遮挡和风向转换，体感并不轻松。我们会边走边复盘早上的记录，把观察到的光线、温差、脚下路感、补给消耗和心理状态一并写进当天模板里。接近傍晚时抵达溪边平台，统一整理装备、补热水、核对第二天的寺院线节奏，再进入借宿点休整。整天虽然没有技术攀登，但对节奏控制、记录专注度和体能分配都有较高要求，因此会把行进速度压得更稳，确保每个人都能把内容真正消化下来。为了让这一天的记录更完整，晚上还会安排一次 20 分钟的复盘，把每个人在高点看到的风向变化、云层移动、身体反馈和节奏失衡时刻逐条补回到手帐里，避免第二天再回忆时丢失细节。"
            },
            {
              type: "transport",
              title: "交通",
              content: "全天徒步，无车程，需自行背负个人小包。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、路餐、晚餐；午间补给点可补充热水。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "溪谷在地家庭借宿，多人间。"
            },
            {
              type: "tips",
              title: "温馨提示",
              content: "下午温差大，外层防风衣建议随手可取，避免在垭口久停受凉。"
            },
            {
              type: "gear",
              title: "装备建议",
              content: "建议今天把防风层、护膝、能量胶和备用袜放在最外层，便于在垭口与长下撤阶段快速取用。"
            }
          ]
        },
        {
          key: "day-4",
          day: 4,
          title: "寺院线轻装慢走，拉长观察时间",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "轻装沿寺院古道慢走，途中预留更长的停留时段，完成寺院、山口与村落关系的记录整理。"
            },
            {
              type: "transport",
              title: "交通",
              content: "上午短驳包车 40 分钟至古道口，之后轻装徒步。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐与晚餐，中午在寺院附近用简餐。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "山口客栈标间。"
            }
          ]
        },
        {
          key: "day-5",
          day: 5,
          title: "高处牧道长距离推进，完成节奏训练",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "从山口客栈出发进入高处牧道，今天是偏耐力型的一天，要求稳定步频和更强的补给纪律。途中会安排两次短暂停留，检查前几天的记录方式是否已经形成个人习惯。"
            },
            {
              type: "transport",
              title: "交通",
              content: "全天徒步为主，仅在终点前有 20 分钟短驳接驳。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、路餐和晚间热食。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "高地营地，双人帐篷。"
            },
            {
              type: "support",
              title: "补给说明",
              content: "今天中段没有补给点，建议早上出发前补满 1.5L 饮水并带上两份高热量零食。"
            }
          ]
        },
        {
          key: "day-6",
          day: 6,
          title: "高点驻留，做一次完整观察记录",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "上午在高点周边做轻装环线，下午集中进行一次完整的观察记录复盘，包括天气、地形、体感和同伴协作。"
            },
            {
              type: "transport",
              title: "交通",
              content: "轻装徒步，无外部交通接驳。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、午间热汤和晚餐。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "高地营地，双人帐篷。"
            }
          ]
        },
        {
          key: "day-7",
          day: 7,
          title: "下撤回到谷口，串联村落与牧场线索",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "沿山脊缓下撤回到谷口，途中重新经过牧场与村落交界带，把前几天分散的观察点串成完整路线认知。"
            },
            {
              type: "transport",
              title: "交通",
              content: "上午徒步，下午短驳包车返回谷口驻地。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、路餐与晚餐。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "谷口客栈标间。"
            },
            {
              type: "terrain",
              title: "地形提醒",
              content: "今天下撤路段碎石较多，建议放慢速度并适当使用登山杖减轻膝盖压力。"
            }
          ]
        },
        {
          key: "day-8",
          day: 8,
          title: "返回保山，集中整理手帐后解散",
          modules: [
            {
              type: "schedule",
              title: "当日行程",
              content: "早餐后统一返回保山，午后完成全程手帐整理、路线复盘与个体反馈，确认资料打包方式后解散返程。"
            },
            {
              type: "transport",
              title: "交通",
              content: "谷口至保山市区统一包车，约 2 小时。"
            },
            {
              type: "meals",
              title: "餐食",
              content: "含早餐、路餐，晚餐解散后自理。"
            },
            {
              type: "accommodation",
              title: "住宿",
              content: "当日不含住宿，可根据返程时间自行预订。"
            }
          ]
        }
      ]
    },
    costs: {
      include: [
        { label: "交通", content: "行程内包车、短驳接送及司机食宿。"},
        { label: "住宿", content: "7 晚行程住宿（酒店、借宿与营地露营按行程安排）。" },
        { label: "餐食", content: "行程标注的早餐、路餐与营地餐食。" },
        { label: "带领", content: "创作者带领、线路协作与徒步手帐共创指导。" },
        { label: "公用装备", content: "对讲机、急救包、基础营地公用装备。" }
      ],
      exclude: [
        { label: "大交通", content: "往返保山的机票、火车等大交通费用自理。" },
        { label: "个人消费", content: "自由活动期间个人餐饮、购物及额外饮品消费。" },
        { label: "单房差", content: "若因个人原因要求单住，需补足相应房差。" },
        { label: "保险", content: "建议自行购买高海拔徒步相关保险。" }
      ],
      refundRules: [
        { days: "集合日前 30 天前", percent: "收取旅游费用总额 1% 的违约金" },
        { days: "集合日前 23-29 天", percent: "收取旅游费用总额 20% 的违约金" },
        { days: "集合日前 16-22 天", percent: "收取旅游费用总额 30% 的违约金" },
        { days: "集合日前 10-15 天", percent: "收取旅游费用总额 60% 的违约金" },
        { days: "集合日前 5-9 天", percent: "收取旅游费用总额 70% 的违约金" },
        { days: "集合日前 1-4 天", percent: "收取旅游费用总额 90% 的违约金" },
        { days: "集合日当天", percent: "因个人原因未集合或中途退出，费用不退" }
      ]
    },
    notices: [
      {
        key: "traffic",
        title: "关于交通",
        content: "建议预订集合日 15:00 前抵达保山的航班或高铁，返程尽量预留 17:00 之后的离开时间，以免受山路与天气影响。"
      },
      {
        key: "local",
        title: "关于当地",
        content: "沿线昼夜温差明显，部分借宿点热水供应有限。进入寺院与村落时请遵守带领者说明，避免大声喧哗或未经允许拍摄。"
      },
      {
        key: "safety",
        title: "安全告知",
        content: "本行程海拔最高约 3900 米，需具备基础徒步经验。若近期有严重感冒、心肺不适或高反史，请在报名时提前沟通评估。"
      },
      {
        key: "packing",
        title: "准备清单",
        content: "建议携带 25-30L 小背包、防风保暖层、徒步鞋、速干衣物、头灯、水壶、防晒用品及常备个人药品。"
      }
    ]
  };
}

function getServiceTagValue(tags, key) {
  const tag = (tags || []).find((item) => item.key === key);
  return tag ? tag.value : "";
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

function getHighlightImages(slug, startIndex, count) {
  const images = [];

  for (let index = startIndex; index < startIndex + count; index += 1) {
    const suffix = String.fromCharCode(97 + ((index - 1) % 4));
    images.push(buildServiceMockImage(`yezai-${slug}-highlight-${index}${suffix}`, 1200, 760));
  }

  return images;
}

function buildGeneratedHighlights(service, dayCount) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const meetingPoint = getServiceTagValue(service.tags, "meetingPoint");
  const styleLabel = styles[0] || "在地体验";
  const secondaryStyle = styles[1] || "路线推进";

  return [
    {
      id: `${service.slug}-highlight-core`,
      title: `${service.name}的核心体验`,
      description: service.creatorQuote || service.summary || "围绕目的地与创作者方法展开本次体验。",
      images: getHighlightImages(service.slug, 1, 2)
    },
    {
      id: `${service.slug}-highlight-method`,
      title: `围绕${styleLabel}建立可执行的行程节奏`,
      description:
        deliverables.length > 0
          ? `本次内容会围绕${deliverables.slice(0, 4).join("、")}展开，让体验、记录与在地互动都能有明确承载。`
          : `行程会围绕${styleLabel}与${secondaryStyle}组织节奏，确保每天都有明确的体验重点与留白。`,
      images: getHighlightImages(service.slug, 2, 1)
    },
    {
      id: `${service.slug}-highlight-place`,
      title: `${meetingPoint || "集合点"}出发的完整在地安排`,
      description: `当前页面已经补齐 ${dayCount} 天结构的亮点、行程、费用与须知，后续可以继续替换成更细的运营内容。`,
      images: getHighlightImages(service.slug, 3, 2)
    }
  ];
}

function buildGeneratedOverview(service, highlights) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const coverImage = highlights[0] && highlights[0].images && highlights[0].images[0]
    ? highlights[0].images[0]
    : buildServiceMockImage(`yezai-${service.slug}-overview`, 1200, 760);

  return {
    coverImage,
    whyJoinText:
      (service.creatorQuote || service.summary || "这段旅程会围绕创作者的方法与目的地节奏展开。") +
      (deliverables.length ? `\n\n你将围绕${deliverables.slice(0, 4).join("、")}展开体验与练习。` : ""),
    suitableTitle: "这段旅程适合谁",
    suitableText:
      (suitable.length ? `· ${suitable.join("\n· ")}\n\n` : "") +
      "这段旅程更适合愿意按现场节奏推进、接受留白与微调的旅人。行程中会把内容体验、在地接触和实际推进放在同一条节奏线上，如果你更在意真实感受而不是密集打卡，会更容易融入。"
  };
}

function buildGeneratedItinerary(service, dayCount) {
  const meetingPoint = getServiceTagValue(service.tags, "meetingPoint") || "指定集合点";
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const suitable = Array.isArray(service.suitable) ? service.suitable : [];
  const styles = Array.isArray(service.styles) ? service.styles : [];
  const days = [];

  for (let day = 1; day <= dayCount; day += 1) {
    const isFirstDay = day === 1;
    const isLastDay = day === dayCount;
    const isMiddleDay = day === Math.ceil(dayCount / 2);
    const styleLabel = styles[(day - 1) % Math.max(styles.length, 1)] || "在地体验";
    const deliverable = deliverables[(day - 1) % Math.max(deliverables.length, 1)] || "行程内容";

    days.push({
      key: `${service.slug}-day-${day}`,
      day,
      title: isFirstDay
        ? `${meetingPoint}集合，确认本次安排`
        : isLastDay
          ? "回到城市收束，完成本次行程复盘"
          : `${service.name} 第${day}日推进`,
      modules: [
        {
          type: "schedule",
          title: "当日行程",
          content: isFirstDay
            ? `在${meetingPoint}完成集合与签到，统一说明路线重点、节奏安排与本次体验方法，围绕“${service.summary}”进入状态。`
            : isLastDay
              ? "上午完成最后一段内容或收尾安排，随后返程或原地解散，整理记录与反馈，确认后续资料交付方式。"
              : `围绕${styleLabel}推进当日节奏，结合${deliverable}安排步行、停留、观察或沟通时段，让体验和推进保持平衡。`
        },
        {
          type: "transport",
          title: "交通",
          content: isFirstDay
            ? `往返${meetingPoint}的大交通需自理，集合后按现场通知统一衔接后续安排。`
            : isLastDay
              ? "根据当日收尾节点统一返程或原地解散，具体以领队通知为准。"
              : "以步行、短驳接驳或现场协调交通为主，实际安排会根据路况和团队状态微调。"
        },
        {
          type: "meals",
          title: "餐食",
          content: "餐食安排以当天节点为准，建议随身保留轻补给与饮水，避免中段断档。"
        },
        {
          type: "accommodation",
          title: "住宿",
          content:
            service.type === "带团旅行"
              ? "如涉及住宿或驻点，将按当日推进节点安排，并以最终行前通知为准。"
              : "如涉及留宿或驻点，将根据最终确认方案执行；部分服务类型可能不含住宿。"
        }
      ].concat(
        isMiddleDay
          ? [{
              type: "tips",
              title: "温馨提示",
              content: suitable.length
                ? `建议参与者具备“${suitable[0]}”的基础条件，并为当天留出体力与节奏缓冲。`
                : "当天请重点关注补水、保暖与节奏控制，尽量避免体能透支。"
            }]
          : []
      )
    });
  }

  return { days };
}

function buildGeneratedCosts(service, dayCount) {
  const deliverables = Array.isArray(service.deliverables) ? service.deliverables : [];
  const exclusions = Array.isArray(service.exclusions) ? service.exclusions : [];
  const meetingPoint = getServiceTagValue(service.tags, "meetingPoint");

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
      content: `当前页面已按 ${dayCount} 天结构整理行程节奏，具体集合细节与准备事项会在确认后同步。`
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
        label: String(item).replace(/[、，,\s].*$/, "").slice(0, 4) || `不含${index + 1}`,
        content: `${item}相关费用需根据实际情况自行承担。`
      }))
    : [{
        label: "自理",
        content: "未明确列入“费用包含”的个人消费及额外需求，默认需自行承担。"
      }];

  return {
    include,
    exclude,
    refundRules: [
      {
        days: "规则说明",
        percent: service.refund || "如需调整或取消，请尽快联系平台确认当次行程的可调整空间与处理方式。"
      }
    ]
  };
}

function buildGeneratedNotices(service) {
  const meetingPoint = getServiceTagValue(service.tags, "meetingPoint") || "指定集合点";
  const suggestedAge = getServiceTagValue(service.tags, "suggestedAge");
  const registrationDeadline = getServiceTagValue(service.tags, "registrationDeadline");
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
      content: "请尊重当地生活节奏与现场规则。具体在地安排会根据目的地情况、创作者节奏与出行时间进一步确认。"
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
      content: `请结合“${service.timeline || "报名确认后同步节奏说明"}”与“${service.revision || "具体以最终确认方案为准"}”安排，提前准备个人证件、常用物品及页面说明中提到的必要装备。`
    }
  ];
}

function buildGeneratedTravelDetail(service) {
  const dayCount = getItineraryDayCount(service);
  const highlights = buildGeneratedHighlights(service, dayCount);

  return {
    id: `travel-detail-${service.slug}`,
    title: service.name,
    overview: buildGeneratedOverview(service, highlights),
    sections: [
      { key: "overview", title: "概况", anchorId: "section_overview" },
      { key: "highlights", title: "亮点", anchorId: "section_highlights" },
      { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
      { key: "notices", title: "须知", anchorId: "section_notices" }
    ],
    highlights,
    itinerary: buildGeneratedItinerary(service, dayCount),
    costs: buildGeneratedCosts(service, dayCount),
    notices: buildGeneratedNotices(service)
  };
}

const rawServices = [
  {
    id: "svc-ridge-journal",
    slug: "ridge-journal",
    name: "高原谷地徒步手帐",
    type: "带团旅行",
    creatorId: "creator-linyue",
    destinationSlugs: ["aba-highlands", "lancang-source"],
    summary: "以手绘地图串联牧场、寺院与峡谷，步行与露营结合。",
    creatorQuote: "这条线我走了很多遍，牧场、寺院和峡谷用手绘地图串起来，步行加露营，节奏自己能把控。推荐给想慢慢感受高原的人。",
    creatorRoles: ["创作者", "带领者"],
    suitable: ["能适应海拔 3500 米以上", "想学习地形记录", "愿意分担公用装备"],
    notSuitable: ["对气候变化敏感", "希望全程室内住宿"],
    deliverables: ["徒步行程手帐", "地形速写课", "本地家庭餐食"],
    exclusions: ["往返大交通", "个人险"],
    timeline: "支付后 5 天发送详细行程",
    revision: "支持 1 次路线微调",
    refund: "出发前 10 天可全额转让名额，之后视情况扣除实际成本。",
    price: "¥4280 / 6天",
    durationTag: "6天",
    styles: ["徒步自然", "山地穿行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "保山集合酒店", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "12-65周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "4人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前4日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-1", versionName: "高原谷地轻徒", dateStart: "2026-03-07", dateEnd: "2026-03-11", price: 2880, status: "confirmed", badge: "期+油", remainingSeats: 28, minGroup: 4 },
      { id: "gp-2", versionName: "高原谷地轻徒", dateStart: "2026-03-14", dateEnd: "2026-03-18", price: 2880, status: "available", badge: "期+油", remainingSeats: 28, minGroup: 4 },
      { id: "gp-3", versionName: "高原谷地全程", dateStart: "2026-03-08", dateEnd: "2026-03-14", price: 4580, status: "confirmed", badge: "期+油", remainingSeats: 20, minGroup: 4 },
      { id: "gp-4", versionName: "高原谷地全程", dateStart: "2026-03-15", dateEnd: "2026-03-21", price: 4580, status: "available", badge: "期+油", remainingSeats: 28, minGroup: 4 },
      { id: "gp-5", versionName: "高原谷地全程", dateStart: "2026-03-22", dateEnd: "2026-03-28", price: 4580, status: "available", badge: "期+油", remainingSeats: 15, minGroup: 4 }
    ],
    travelDetail: buildTravelDetailMock("ridge-journal")
  },
  {
    id: "svc-hexicorridor",
    slug: "hexi-tracing",
    name: "河西走廊风声记录",
    type: "定制规划",
    creatorId: "creator-linyue",
    destinationSlugs: ["hexicorridor"],
    summary: "根据团队体力安排烽燧与河谷的声景采集，用录音构筑记忆。",
    creatorQuote: "河西这一段我跑过很多次，烽燧和河谷的声景特别适合用录音留下来，节奏可以按你们体力来调。",
    suitable: ["喜欢慢慢感受高原的人", "愿意在戈壁驻扎"],
    notSuitable: ["行程只能周末", "需要夜生活"],
    deliverables: ["行程方案 + 声景提示", "必备装备清单", "路书"],
    exclusions: ["现场陪同", "设备租赁"],
    timeline: "支付后 3 天提交草案",
    revision: "支持 2 次文档修订",
    refund: "方案确认前可全额退款，确认后扣除策划费用。",
    price: "¥1990 起",
    durationTag: "5-7天",
    styles: ["公路旅行", "山地穿行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "敦煌市区指定酒店", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "18-60周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "2人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前7日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-hx-1", versionName: "河西标准线", dateStart: "2026-04-05", dateEnd: "2026-04-11", price: 1990, status: "available", remainingSeats: 12, minGroup: 2 },
      { id: "gp-hx-2", versionName: "河西标准线", dateStart: "2026-04-18", dateEnd: "2026-04-24", price: 1990, status: "available", remainingSeats: 8, minGroup: 2 }
    ]
  },
  {
    id: "svc-lancang-source",
    slug: "lancang-source-lab",
    name: "澜沧江源水系小实验",
    type: "带团旅行",
    creatorId: "creator-hechen",
    destinationSlugs: ["lancang-source", "aba-highlands", "qinghai-lake"],
    summary: "携带简单仪器在源区做水温、含沙量记录，理解一条河的诞生。",
    creatorQuote: "澜沧江源区的水文小实验我做了好几年，带大家用简单仪器测水温、含沙量，能真正理解一条河是怎么诞生的。",
    suitable: ["能适应帐篷住宿", "乐于动手", "对水文议题好奇"],
    notSuitable: ["不能长时间露天活动"],
    deliverables: ["水系观测讲义", "采样工具包", "共创展板"],
    exclusions: ["个人保暖装备", "往返交通"],
    timeline: "支付后 7 天发送准备清单",
    revision: "不提供临时加人",
    refund: "出发前 15 天可退 70%，之后按照实际成本结算。",
    price: "¥5980 / 7天",
    durationTag: "7天",
    styles: ["田野考察", "徒步自然"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "玉树市区集合", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "14-55周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "6人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前10日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-lc-1", versionName: "澜沧江源7日", dateStart: "2026-05-01", dateEnd: "2026-05-07", price: 5980, status: "confirmed", remainingSeats: 18, minGroup: 6 },
      { id: "gp-lc-2", versionName: "澜沧江源7日", dateStart: "2026-05-15", dateEnd: "2026-05-21", price: 5980, status: "available", remainingSeats: 22, minGroup: 6 }
    ]
  },
  {
    id: "svc-miao-night-walk",
    slug: "miao-night-walk",
    name: "山谷夜步与寨子谈话",
    type: "带团旅行",
    creatorId: "creator-cengu",
    destinationSlugs: ["qiandong-valley", "enxi-gorge"],
    summary: "在侗寨夜色中行走，拜访织娘与歌师，以对话完成旅程。",
    creatorQuote: "侗寨的夜步我走了很多回，织娘和歌师愿意聊的话，会打开完全不同的世界。推荐给愿意慢下来听故事的人。",
    suitable: ["乐于尊重寨子礼仪", "能步行 8 公里", "愿意共餐"],
    notSuitable: ["害怕夜行", "需要单独卫浴"],
    deliverables: ["夜步线路", "访谈提纲", "访客礼物准备"],
    exclusions: ["贵州往返交通", "个人消费"],
    timeline: "支付后 4 天确认住宿与访谈名单",
    revision: "可微调 1 次访谈安排",
    refund: "出发前 12 天可退 80%，7 天内仅可转名。",
    price: "¥3680 / 4天",
    durationTag: "4天",
    styles: ["慢旅行", "人文在地"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "黔东南肇兴侗寨", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "10-65周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "4人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前5日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-miao-1", versionName: "山谷夜步4日", dateStart: "2026-04-12", dateEnd: "2026-04-15", price: 3680, status: "available", remainingSeats: 10, minGroup: 4 },
      { id: "gp-miao-2", versionName: "山谷夜步4日", dateStart: "2026-04-26", dateEnd: "2026-04-29", price: 3680, status: "confirmed", remainingSeats: 6, minGroup: 4 }
    ]
  },
  {
    id: "svc-qiongbay-salt",
    slug: "salt-pan-diary",
    name: "盐田潮汐观测日志",
    type: "路线设计",
    creatorId: "creator-dufan",
    destinationSlugs: ["qiongbay-salt"],
    summary: "设计 3 天潮汐与渔市观察行程，记录盐田工序与居民作息。",
    creatorQuote: "琼海盐田的潮汐和渔市我拍过很多次，三天刚好能把工序和居民作息摸清楚，适合想拍纪录片式旅行的人。",
    suitable: ["喜欢纪录片式旅行", "愿意早起", "想拍摄手工劳动"],
    notSuitable: ["只想度假", "对腥味敏感"],
    deliverables: ["潮汐表与观察指引", "访问名单", "步行路线"],
    exclusions: ["交通与住宿预订"],
    timeline: "支付后 2 天提供方案",
    revision: "可免费修改 1 次",
    refund: "交付前可退 80%，交付后不退。",
    price: "¥980 起",
    durationTag: "3天",
    styles: ["城市漫游", "慢旅行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "琼海市区", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "8-70周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "1人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前3日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-salt-1", versionName: "盐田3日", dateStart: "2026-03-20", dateEnd: "2026-03-22", price: 980, status: "available", remainingSeats: 15, minGroup: 1 },
      { id: "gp-salt-2", versionName: "盐田3日", dateStart: "2026-04-02", dateEnd: "2026-04-04", price: 980, status: "available", remainingSeats: 15, minGroup: 1 }
    ]
  },
  {
    id: "svc-songhua-ice",
    slug: "songhua-dock",
    name: "松花江口码头漫步",
    type: "带团旅行",
    creatorId: "creator-dufan",
    destinationSlugs: ["songhua-river"],
    summary: "顺着旧码头与厂区缓步，听工人故事，完成线稿记录。",
    creatorQuote: "松花江口的老码头和厂区我画过很多线稿，工人愿意讲的话，一条线能串起几十年。适合能扛冻、喜欢手绘的人。",
    suitable: ["能在低温下步行", "喜欢手绘", "对工业遗产感兴趣"],
    notSuitable: ["怕冷", "希望车接车送"],
    deliverables: ["导览手册", "声音播放清单", "线稿练习纸"],
    exclusions: ["机酒"],
    timeline: "支付后 3 天寄送旅行包",
    revision: "不提供临时加位",
    refund: "出发前 8 天可退 70%，临近仅可替换同行人。",
    price: "¥2280 / 3天",
    durationTag: "3天",
    styles: ["城市漫游", "慢旅行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "哈尔滨市区", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "12-65周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "3人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前5日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-song-1", versionName: "码头漫步3日", dateStart: "2026-01-10", dateEnd: "2026-01-12", price: 2280, status: "confirmed", remainingSeats: 8, minGroup: 3 },
      { id: "gp-song-2", versionName: "码头漫步3日", dateStart: "2026-02-07", dateEnd: "2026-02-09", price: 2280, status: "available", remainingSeats: 12, minGroup: 3 }
    ]
  },
  {
    id: "svc-enxi-gorge",
    slug: "enxi-residency",
    name: "鄂西峡谷共居计划",
    type: "定制规划",
    creatorId: "creator-yaoyao",
    destinationSlugs: ["enxi-gorge"],
    summary: "陪伴旅人入住峡谷家庭三晚，完成一组纪实影像。",
    creatorQuote: "鄂西峡谷这几户人家我合作很久了，住进去三晚能拍出一组很扎实的纪实。适合愿意做家务、尊重拍摄对象的人。",
    suitable: ["能主动做家务", "尊重拍摄对象", "喜欢慢节奏"],
    notSuitable: ["只想旁观", "无法接受木屋"],
    deliverables: ["家庭介绍档案", "拍摄许可模板", "共居日程"],
    exclusions: ["相机设备", "交通"],
    timeline: "支付后 5 天安排匹配家庭",
    revision: "联合家庭协商，允许一次小调",
    refund: "匹配完成前可退全款，之后按家庭预备成本扣除。",
    price: "¥2680 起",
    durationTag: "5天",
    styles: ["人文在地", "慢旅行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "恩施市区", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "18-55周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "2人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前7日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-enxi-1", versionName: "峡谷共居5日", dateStart: "2026-04-08", dateEnd: "2026-04-12", price: 2680, status: "available", remainingSeats: 6, minGroup: 2 },
      { id: "gp-enxi-2", versionName: "峡谷共居5日", dateStart: "2026-05-06", dateEnd: "2026-05-10", price: 2680, status: "available", remainingSeats: 4, minGroup: 2 }
    ]
  },
  {
    id: "svc-nanjiang-dune",
    slug: "dune-sunset",
    name: "沙丘黄昏聆听",
    type: "带团旅行",
    creatorId: "creator-shang",
    destinationSlugs: ["nanjiang-dune"],
    summary: "驾车穿越南疆沙丘，黄昏时分停驻录音并独处。",
    creatorQuote: "南疆沙丘的黄昏我录过很多次，开车穿过去、停下来录音的那一段，特别适合想独处又喜欢公路的人。",
    suitable: ["喜欢公路", "能忍受风沙", "乐于独处"],
    notSuitable: ["怕沙", "不想远离市区"],
    deliverables: ["公路停靠点表", "录音指南", "沙丘安全提示"],
    exclusions: ["机票", "个人装备"],
    timeline: "支付后 4 天提供设备清单",
    revision: "不可临时改期",
    refund: "出发前 14 天可退 60%，之后依实际支出结算。",
    price: "¥4580 / 5天",
    durationTag: "5天",
    styles: ["公路旅行", "山地穿行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "喀什市区", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "16-60周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "4人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前10日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-dune-1", versionName: "沙丘黄昏5日", dateStart: "2026-05-20", dateEnd: "2026-05-24", price: 4580, status: "available", remainingSeats: 14, minGroup: 4 },
      { id: "gp-dune-2", versionName: "沙丘黄昏5日", dateStart: "2026-06-05", dateEnd: "2026-06-09", price: 4580, status: "available", remainingSeats: 20, minGroup: 4 }
    ]
  },
  {
    id: "svc-qinghai-loop",
    slug: "qinghai-loop",
    name: "湖岸环线体感",
    type: "路线设计",
    creatorId: "creator-hechen",
    destinationSlugs: ["qinghai-lake", "hexicorridor"],
    summary: "根据时间设计湖岸环线，加入观星与牧场交流节点。",
    creatorQuote: "青海湖岸环线我跑过很多趟，观星和牧场交流的节点都摸熟了，可以根据你的时间帮你设计一版。",
    suitable: ["喜欢自驾或骑行", "想理解湖岸生态"],
    notSuitable: ["需要密集服务", "害怕长途"],
    deliverables: ["环线路书", "露营点位推荐", "观测指引"],
    exclusions: ["车辆与营地搭建"],
    timeline: "支付后 3 天交付方案",
    revision: "支持 2 次调整",
    refund: "交付前可退 90%，交付后按比例退。",
    price: "¥1680 起",
    durationTag: "5-6天",
    styles: ["公路旅行", "田野考察"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "西宁市区", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "12-65周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "2人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前5日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-qh-1", versionName: "湖岸环线5日", dateStart: "2026-06-12", dateEnd: "2026-06-16", price: 1680, status: "available", remainingSeats: 10, minGroup: 2 },
      { id: "gp-qh-2", versionName: "湖岸环线6日", dateStart: "2026-06-20", dateEnd: "2026-06-25", price: 1980, status: "available", remainingSeats: 8, minGroup: 2 }
    ]
  },
  {
    id: "svc-yunnan-rainforest",
    slug: "rainforest-dawn",
    name: "雨林晨雾观察",
    type: "带团旅行",
    creatorId: "creator-menglu",
    destinationSlugs: ["yunnan-rainforest"],
    summary: "跟随植物学者记录雨林晨雾，练习以嗅觉识别茶树。",
    creatorQuote: "雨林晨雾和茶树的气味我记了很多本，跟着植物学者走几趟，用嗅觉认茶会变成习惯。推荐给愿意早起、能静下来观察的人。",
    suitable: ["愿意早起", "能静坐观察", "喜欢手写"],
    notSuitable: ["害怕虫蚁"],
    deliverables: ["植物观察册", "气味练习卡", "村民共餐"],
    exclusions: ["机酒"],
    timeline: "支付后 6 天寄送准备包",
    revision: "不接受临时人数增加",
    refund: "出发前 10 天可退 70%，之后仅可转让。",
    price: "¥3980 / 5天",
    durationTag: "5天",
    styles: ["徒步自然", "慢旅行"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "西双版纳景洪", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "10-60周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "4人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前7日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-rain-1", versionName: "雨林晨雾5日", dateStart: "2026-04-25", dateEnd: "2026-04-29", price: 3980, status: "confirmed", remainingSeats: 12, minGroup: 4 },
      { id: "gp-rain-2", versionName: "雨林晨雾5日", dateStart: "2026-05-10", dateEnd: "2026-05-14", price: 3980, status: "available", remainingSeats: 16, minGroup: 4 }
    ]
  },
  {
    id: "svc-wuyi-ancient",
    slug: "wuyi-ink-trail",
    name: "武夷古道静心行",
    type: "带团旅行",
    creatorId: "creator-suxi",
    destinationSlugs: ["wuyi-ancient", "minbei-creek"],
    summary: "沿古道行走与茶农共制青茶，以体感写作为主线。",
    creatorQuote: "武夷古道和茶农做青茶我走了很多年，体感写作这条线特别适合想慢下来、愿意动手、不怕淋雨的人。",
    suitable: ["渴望慢下来", "愿意实作", "不介意淋雨"],
    notSuitable: ["需要硬性打卡"],
    deliverables: ["古道行走笔记", "茶叶制作体验", "呼吸练习"],
    exclusions: ["往返交通", "个人加购"],
    timeline: "支付后 5 天发送体感练习音频",
    revision: "可更换 1 次日期",
    refund: "行前 7 天退 60%，其余扣除茶农准备成本。",
    price: "¥3280 / 4天",
    durationTag: "4天",
    styles: ["慢旅行", "人文在地"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "武夷山景区入口", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "12-65周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "4人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前5日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-wuyi-1", versionName: "古道静心4日", dateStart: "2026-04-15", dateEnd: "2026-04-18", price: 3280, status: "available", remainingSeats: 10, minGroup: 4 },
      { id: "gp-wuyi-2", versionName: "古道静心4日", dateStart: "2026-05-01", dateEnd: "2026-05-04", price: 3280, status: "confirmed", remainingSeats: 6, minGroup: 4 }
    ]
  },
  {
    id: "svc-minbei-creek",
    slug: "minbei-creek-study",
    name: "溪谷水声研究",
    type: "定制规划",
    creatorId: "creator-menglu",
    destinationSlugs: ["minbei-creek"],
    summary: "根据驻留天数设计溪谷采集路线，帮助旅人记录溪流声音。",
    creatorQuote: "闽北溪谷的水声我录了很多段，按你的驻留天数可以帮你设计一条采集路线，适合自带设备、喜欢林间走的人。",
    suitable: ["自带录音设备", "喜欢林间漫步"],
    notSuitable: ["只想城市活动"],
    deliverables: ["驻留日程", "录音节点图", "村落联系人"],
    exclusions: ["交通与住宿预订"],
    timeline: "支付后 2 天提供框架，5 天内定稿",
    revision: "含 2 次在线讨论",
    refund: "定稿前可退 70%，定稿后按工作量结算。",
    price: "¥1180 起",
    durationTag: "3-5天",
    styles: ["慢旅行", "徒步自然"],
    tags: [
      { key: "meetingPoint", label: "集合地点", value: "闽北溪谷入口", clickable: false },
      { key: "suggestedAge", label: "建议年龄", value: "10-60周岁", clickable: true },
      { key: "minGroupSize", label: "成团人数", value: "1人成行", clickable: false },
      { key: "registrationDeadline", label: "报名截止时间", value: "出行前3日", clickable: false }
    ],
    groupPeriods: [
      { id: "gp-creek-1", versionName: "溪谷水声3日", dateStart: "2026-04-01", dateEnd: "2026-04-03", price: 1180, status: "available", remainingSeats: 8, minGroup: 1 },
      { id: "gp-creek-2", versionName: "溪谷水声5日", dateStart: "2026-04-15", dateEnd: "2026-04-19", price: 1580, status: "available", remainingSeats: 6, minGroup: 1 }
    ]
  }
];

const services = rawServices.map((service) =>
  Object.assign({}, service, buildServiceMedia(service.slug), {
    travelDetail: service.travelDetail || buildGeneratedTravelDetail(service)
  })
);

module.exports = { services };

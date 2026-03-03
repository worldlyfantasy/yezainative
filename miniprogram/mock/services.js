function buildServiceMockImage(seed, width, height) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
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
    sections: [
      { key: "highlights", title: "亮点", anchorId: "section_highlights" },
      { key: "itinerary", title: "行程", anchorId: "section_itinerary" },
      { key: "costs", title: "费用", anchorId: "section_costs" },
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
    suitable: ["喜欢驾驶或长途车程", "愿意在戈壁驻扎"],
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
  Object.assign({}, service, buildServiceMedia(service.slug))
);

module.exports = { services };

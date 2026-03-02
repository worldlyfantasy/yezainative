
const creators = [
  {
    id: "creator-linyue",
    slug: "linyue",
    name: "林越",
    avatar: "https://picsum.photos/seed/yezai-creator-01/400/400",
    stance: "我记录高原与峡谷里肉眼可见的呼吸，不做模板化的赶场。",
    tags: ["徒步自然", "山地穿行", "慢旅行"],
    destinationSlugs: ["aba-highlands", "hexicorridor", "lancang-source"],
    about: [
      "十年在川西与青海拍摄影像资料，酒馆与牧房一样是我的工作场。我喜欢和当地向导一起勘线，再把适合旅人体验的路段整理出来。",
      "" +
        "‘野哉’对我来说是保持在场感——行程中留足可变空间，可能因为某位老人分享了一段故事，我们就多留一天。",
      "我提供的路线都附带地形草图与体力建议，方便队友自己判断是否加入。"
    ],
    suitable: ["想花时间感受高原日常", "能够接受高海拔节奏", "愿意和当地家庭一起用餐"],
    notSuitable: ["追求打卡密度", "需要豪华住宿", "只想拍摄标准景观"],
    serviceIds: ["svc-ridge-journal", "svc-hexicorridor", "svc-lancang-source"],
    groupIds: ["svc-ridge-journal"],
    reviews: [
      {
        content: "林越会在路上画速写，让我们理解地貌的生成，整个行程像一次亲历的地理课。",
        audience: "适合好奇地形与在地生活的人"
      },
      {
        content: "每日行程只有框架，天气或村民邀请都会调整，反而更真实。",
        audience: "适合接受弹性节奏的队友"
      }
    ]
  },
  {
    id: "creator-cengu",
    slug: "cengu",
    name: "岑谷",
    avatar: "https://picsum.photos/seed/yezai-creator-02/400/400",
    stance: "我在苗侗村寨常驻，以田野笔记陪伴旅人读懂节奏。",
    tags: ["人文在地", "慢旅行", "田野考察"],
    destinationSlugs: ["qiandong-valley", "qiongbay-salt", "wuyi-ancient"],
    about: [
      "我在黔东南支教时和多位织娘与银饰匠人成为朋友，如今协助他们记录手艺，也带少量旅行者进入日常。",
      "我不提供舞台式的‘表演’，而是提前沟通访客人数、拍摄方式，确保互相尊重。",
      "路线上常穿插夜谈环节，大家一起整理当天的声音与记忆。"
    ],
    suitable: ["需要真实接触村落生活", "愿意参与手工体验", "愿意贡献影像回访"],
    notSuitable: ["需要精确的豪华配套", "难以适应寨子作息", "希望快速移动多个城市"],
    serviceIds: ["svc-miao-night-walk", "svc-qiongbay-salt"],
    groupIds: ["svc-miao-night-walk"],
    reviews: [
      {
        content: "岑谷帮我们把对话整理成册，回城后还能寄给受访者。",
        audience: "适合愿意投入情感交流的人"
      },
      {
        content: "安排的老师傅都以自己的节奏教学，没有演出的感觉。",
        audience: "适合想静下来的朋友"
      }
    ]
  },
  {
    id: "creator-dufan",
    slug: "dufan",
    name: "杜帆",
    avatar: "https://picsum.photos/seed/yezai-creator-03/400/400",
    stance: "城市也可以慢下来，我带大家在港湾与旧厂穿梭。",
    tags: ["城市漫游", "慢旅行"],
    destinationSlugs: ["songhua-river", "qiongbay-salt", "minbei-creek"],
    about: [
      "我在东北港口城市做过城市更新顾问，擅长把看似普通的街区串成一个完整的故事。",
      "团队协作是边走边听，我会用录音和老相片帮助大家理解‘为什么此处保留了锈迹’。",
      "路线中常安排与在地咖啡师、木工短暂共创，让旅程留下一件小作品。"
    ],
    suitable: ["喜爱步行与公共交通", "想理解城市与水系关系", "能够自带保暖装备"],
    notSuitable: ["只想逛热门商场", "不想走路", "需要夜生活密集安排"],
    serviceIds: ["svc-songhua-ice", "svc-qiongbay-salt"],
    groupIds: [],
    reviews: [
      {
        content: "杜帆会分享自己采访到的工人语音，走路时像在听一部纪录片。",
        audience: "适合希望理解城市层次的人"
      },
      {
        content: "他带我们在码头画线稿，速度慢却特别满足。",
        audience: "适合愿意停留的人"
      }
    ]
  },
  {
    id: "creator-menglu",
    slug: "menglu",
    name: "孟芦",
    avatar: "https://picsum.photos/seed/yezai-creator-04/400/400",
    stance: "我与茶山、雨林共处，带领少量旅人与植物对话。",
    tags: ["徒步自然", "人文在地", "慢旅行"],
    destinationSlugs: ["yunnan-rainforest", "wuyi-ancient", "aba-highlands", "minbei-creek"],
    about: [
      "我十年前迁到滇西南，学习植物学，也协助当地茶农记录树龄。",
      "行程以清晨森林观测为主，下午会整理观察日志，并与村里的长者确认我们记录的植物名。",
      "我相信把时间花在微小处，比追逐刺激更能留下记忆。"
    ],
    suitable: ["愿意早起", "喜欢手写笔记", "能够保护脆弱环境"],
    notSuitable: ["害怕蚊虫", "期望豪华营地", "需要稳定网络"],
    serviceIds: ["svc-yunnan-rainforest", "svc-wuyi-ancient", "svc-minbei-creek"],
    groupIds: ["svc-yunnan-rainforest"],
    reviews: [
      {
        content: "孟芦会教我们辨识气味，同行的茶农也会分享经验。",
        audience: "适合珍惜植物细节的人"
      },
      {
        content: "每天晚上都留时间描摹叶子，十分疗愈。",
        audience: "适合用手写记录旅途的人"
      }
    ]
  },
  {
    id: "creator-shang",
    slug: "shangli",
    name: "尚笠",
    avatar: "https://picsum.photos/seed/yezai-creator-05/400/400",
    stance: "公路上的时间感最诚实，我负责把节奏放缓。",
    tags: ["公路旅行", "山地穿行"],
    destinationSlugs: ["nanjiang-dune", "qinghai-lake", "hexicorridor"],
    about: [
      "我跑新疆线很多年，认识不少牧民朋友，车上常备手冲工具与野外收音器。",
      "行程中会安排路边停靠，和牧人聊几句或记录风声，让旅人记住‘空’。",
      "车辆配置简单但舒适，夜宿以乡镇客栈为主，我会提前踩点。"
    ],
    suitable: ["喜欢长时间车程", "能接受自带水壶", "期待沙漠黄昏"],
    notSuitable: ["容易晕车", "需要奢华酒店", "必须高速信号"],
    serviceIds: ["svc-nanjiang-dune", "svc-qinghai-loop"],
    groupIds: ["svc-nanjiang-dune"],
    reviews: [
      {
        content: "在沙丘里没有催促，大家可以分散走，尚笠在远处守候。",
        audience: "适合想独处又安心的人"
      },
      {
        content: "车上播放的是当地朋友录的冬季驼铃，很特别。",
        audience: "适合喜欢声音采集的人"
      }
    ]
  },
  {
    id: "creator-yaoyao",
    slug: "yaoyao",
    name: "姚瑶",
    avatar: "https://picsum.photos/seed/yezai-creator-06/400/400",
    stance: "我陪伴河谷家庭拍照，也带旅人加入一餐一宿。",
    tags: ["人文在地", "慢旅行"],
    destinationSlugs: ["enxi-gorge", "qiandong-valley", "aba-highlands"],
    about: [
      "作为纪实摄影师，我在鄂西和黔东南记录乡村母亲群像，与她们共度大量日常。",
      "旅行者加入时，我会先让大家写下边界与期待，确保拜访不打扰生活。",
      "拍摄结束后会制作明信片寄回，形成持续联系。"
    ],
    suitable: ["看重人与人相处", "愿意遵守拍摄礼仪", "能参与家务"],
    notSuitable: ["只想被动观看", "无法接受乡村住宿", "需要紧密行程"],
    serviceIds: ["svc-enxi-gorge", "svc-miao-night-walk"],
    groupIds: [],
    reviews: [
      {
        content: "姚瑶会提前介绍每户家庭，让我安心。",
        audience: "适合注重尊重边界的人"
      },
      {
        content: "我们把拍好的照片冲洗出来送回村里，感觉旅程才完整。",
        audience: "适合想建立长久链接的人"
      }
    ]
  },
  {
    id: "creator-hechen",
    slug: "hechen",
    name: "何辰",
    avatar: "https://picsum.photos/seed/yezai-creator-07/400/400",
    stance: "我研究水系治理，也喜欢和旅人在河边露营。",
    tags: ["田野考察", "徒步自然", "慢旅行"],
    destinationSlugs: ["lancang-source", "songhua-river", "qinghai-lake"],
    about: [
      "我是水利工程背景，常驻澜沧江源区，与牧民一起观察冰川变化。",
      "行程安排以徒步与水样采集结合，让大家理解一条河的呼吸。",
      "夜里会搭建流动小课堂，把白天的数据整理在一起。"
    ],
    suitable: ["对水系议题感兴趣", "可以适应高海拔", "乐于记录"],
    notSuitable: ["难以耐寒", "希望度假式服务", "不能接受露营"],
    serviceIds: ["svc-lancang-source", "svc-qinghai-loop"],
    groupIds: ["svc-lancang-source"],
    reviews: [
      {
        content: "何辰把复杂的水文词汇讲得很像故事。",
        audience: "适合对知识有期待的旅人"
      },
      {
        content: "采样和测量都很认真，不像旅游，更像共修。",
        audience: "适合愿意动手的伙伴"
      }
    ]
  },
  {
    id: "creator-suxi",
    slug: "suxi",
    name: "苏夕",
    avatar: "https://picsum.photos/seed/yezai-creator-08/400/400",
    stance: "我把疲惫城市人的脚步放进茶田里，让时间松动。",
    tags: ["慢旅行", "人文在地"],
    destinationSlugs: ["wuyi-ancient", "yunnan-rainforest", "qiandong-valley"],
    about: [
      "我出生于武夷山脚，小时候跟着父亲上茶山，如今在山腰改造了一处旧仓当作驻地。",
      "行程强调呼吸练习和体感写作，不需要分享成绩，只需诚实说出疲惫。",
      "合作茶农会和我们一起制茶，旅人能真切分辨叶片温度。"
    ],
    suitable: ["想要慢下来", "愿意在自然里写作", "喜欢安静同伴"],
    notSuitable: ["需要夜生活", "无法离线", "希望持续刺激"],
    serviceIds: ["svc-wuyi-ancient", "svc-yunnan-rainforest"],
    groupIds: ["svc-wuyi-ancient"],
    reviews: [
      {
        content: "苏夕提醒我们什么时候该停下，茶香成为记忆的锚点。",
        audience: "适合长期疲惫的人"
      },
      {
        content: "夜里围炉写字，很久没这么专注过。",
        audience: "适合愿意分享感受的伙伴"
      }
    ]
  }
];

module.exports = { creators };

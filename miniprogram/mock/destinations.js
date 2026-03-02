
const destinations = [
  {
    id: "dest-aba",
    slug: "aba-highlands",
    name: "阿坝高地",
    cover: "https://picsum.photos/seed/yezai-dest-01/1200/800",
    description: "草甸与峡谷交错的高原县，村寨与牧场比景区更有吸引力。",
    descriptionDetail:
      "阿坝高地是川西高原上一片草甸与峡谷交错的土地，县城与村寨散落其间，牧场的节奏比任何景区都更真实。在这里，雪山在远处静立，牦牛与牧人共用同一条转场小路；你若愿意慢下来，会看见经幡、煨桑与当地人日复一日的生活。村寨与牧场比景区更有吸引力，因为真正的在场感来自与土地和人的相处，而非打卡式的掠过。",
    routeCount: 6,
    creatorCount: 3,
    serviceIds: ["svc-ridge-journal", "svc-lancang-source"]
  },
  {
    id: "dest-qiandong",
    slug: "qiandong-valley",
    name: "黔东南山谷",
    cover: "https://picsum.photos/seed/yezai-dest-02/1200/800",
    description: "以银饰与稻田梯田闻名的小众村寨群，日常节奏缓慢。",
    descriptionDetail:
      "黔东南山谷以银饰、织锦与层层稻田梯田闻名，苗侗村寨沿山势错落，日常节奏缓慢而扎实。赶集日里银饰叮当、染布晾在木楼外，你若住上几日，会习惯晨雾里的糯香和傍晚的火塘话。这里的小众不在于偏僻，而在于仍有人按自己的节律生活——手艺、歌谣与节庆都还长在土地里，值得用时间慢慢靠近。",
    routeCount: 5,
    creatorCount: 3,
    serviceIds: ["svc-miao-night-walk"]
  },
  {
    id: "dest-minbei",
    slug: "minbei-creek",
    name: "闽北溪谷",
    cover: "https://picsum.photos/seed/yezai-dest-03/1200/800",
    description: "山谷间遍布小茶寮与竹编作坊，适合驻留几日。",
    descriptionDetail:
      "闽北溪谷里，山谷间遍布小茶寮与竹编作坊，溪水声和焙茶的气味终年不断。适合驻留几日：白天跟茶农走一段山路，傍晚在作坊里看篾条在指尖变成篮筐，夜里就着溪声入睡。这里没有大景区的喧哗，只有茶、竹与人的日常；你若愿意把节奏交给当地，会得到一程安静而具体的旅行。",
    routeCount: 4,
    creatorCount: 2,
    serviceIds: ["svc-minbei-creek", "svc-wuyi-ancient"]
  },
  {
    id: "dest-hexi",
    slug: "hexicorridor",
    name: "河西走廊",
    cover: "https://picsum.photos/seed/yezai-dest-04/1200/800",
    description: "戈壁、烽燧与驿站遗址连成一条纵深的线，适合慢速公路体验。",
    descriptionDetail:
      "河西走廊上，戈壁、烽燧与驿站遗址连成一条纵深的线，适合用慢速公路去体验。张掖的丹霞、嘉峪关的城楼、敦煌的洞窟，若只赶路会变成一串地名；若肯放慢，你会看见祁连雪线、绿洲里的瓜果与仍在使用的古驿道。历史在这里不是标本，而是风沙、驼队与当代旅人共享的同一条走廊。",
    routeCount: 7,
    creatorCount: 2,
    serviceIds: ["svc-hexicorridor", "svc-qinghai-loop"]
  },
  {
    id: "dest-enxi",
    slug: "enxi-gorge",
    name: "鄂西峡谷",
    cover: "https://picsum.photos/seed/yezai-dest-05/1200/800",
    description: "峡谷水汽与吊脚楼营造了独特的坡地聚落，居民友善。",
    descriptionDetail:
      "鄂西峡谷中，水汽常年萦绕，吊脚楼沿坡地层层而上，形成独特的坡地聚落。居民友善，你若在寨子里多待几天，会听到山歌、土话和关于迁居与留守的故事。峡谷把这里隔成一方小世界，节奏慢、人情厚，适合想暂时离开城市、又不愿只做观光客的旅人。",
    routeCount: 3,
    creatorCount: 1,
    serviceIds: ["svc-enxi-gorge"]
  },
  {
    id: "dest-nanjiang",
    slug: "nanjiang-dune",
    name: "南疆沙丘带",
    cover: "https://picsum.photos/seed/yezai-dest-06/1200/800",
    description: "沙丘与绿洲犬牙交错，公路两侧是不断变化的光影。",
    descriptionDetail:
      "南疆沙丘带里，沙丘与绿洲犬牙交错，公路两侧是不断变化的光影与地貌。日出日落时沙线如金，绿洲里则有巴扎、手抓饭与维吾尔人家的庭院。这里适合慢行：不必赶着踩点，而是把时间交给沙漠与绿洲的交替，交给路上偶遇的葡萄架与手鼓声。",
    routeCount: 6,
    creatorCount: 1,
    serviceIds: ["svc-nanjiang-dune"]
  },
  {
    id: "dest-songhua",
    slug: "songhua-river",
    name: "松花江畔",
    cover: "https://picsum.photos/seed/yezai-dest-07/1200/800",
    description: "港湾、厂房与河岸共同组成了多层次的城市肌理。",
    descriptionDetail:
      "松花江畔，港湾、厂房与河岸共同组成了多层次的城市肌理。老工业区的锈迹与江风、码头与咖啡馆并存，城市也可以慢下来——沿着江岸走，会遇见旧船厂、在岸边长大的本地人和他们口中的「以前」。这里适合喜欢用脚步丈量城市、对历史与当下都好奇的旅人。",
    routeCount: 4,
    creatorCount: 2,
    serviceIds: ["svc-songhua-ice"]
  },
  {
    id: "dest-lancang",
    slug: "lancang-source",
    name: "澜沧江源区",
    cover: "https://picsum.photos/seed/yezai-dest-08/1200/800",
    description: "冰川与牧场之间的长坡充满生命，适合水系主题考察。",
    descriptionDetail:
      "澜沧江源区介于冰川与牧场之间，长坡上溪流纵横、草木丰茂，充满生命感。适合做水系与生态主题的慢速考察：跟随熟悉水源的当地人，看江河如何从雪山融水汇成大河，又如何滋养两岸的村落与牧场。在这里，水不是背景，而是理解整片土地的一条主线。",
    routeCount: 5,
    creatorCount: 2,
    serviceIds: ["svc-lancang-source", "svc-ridge-journal"]
  },
  {
    id: "dest-qiongbay",
    slug: "qiongbay-salt",
    name: "琼北盐田",
    cover: "https://picsum.photos/seed/yezai-dest-09/1200/800",
    description: "退潮后的盐田像镜面，配合渔村作息形成独特节奏。",
    descriptionDetail:
      "琼北盐田在退潮后像一面面镜面，映着天光与劳作的人影，配合渔村日出而作、日落而息的作息，形成独特的节奏。适合住一两晚：清晨看晒盐、午后在渔村吃刚上岸的海鲜、傍晚在盐田边等日落。这里没有度假村的喧嚣，只有海风、盐粒与当地人日复一日的生计。",
    routeCount: 4,
    creatorCount: 2,
    serviceIds: ["svc-qiongbay-salt"]
  },
  {
    id: "dest-yunnan",
    slug: "yunnan-rainforest",
    name: "滇西南雨林",
    cover: "https://picsum.photos/seed/yezai-dest-10/1200/800",
    description: "雨林与茶园交错，村落与植物守望。",
    descriptionDetail:
      "滇西南雨林与茶园交错，村落嵌在绿意里，人与植物长期守望。在这里可以慢下来：跟茶农进一次山、在雨林边缘识几种草木、在寨子里听一段迁徙与定居的故事。雨林不是背景板，而是与村落、茶园共同构成的生活场；旅行的意义在于参与这种节奏，而非匆匆穿过。",
    routeCount: 6,
    creatorCount: 2,
    serviceIds: ["svc-yunnan-rainforest"]
  },
  {
    id: "dest-wuyi",
    slug: "wuyi-ancient",
    name: "武夷古道",
    cover: "https://picsum.photos/seed/yezai-dest-11/1200/800",
    description: "古道穿过丹霞地貌，茶香与竹影在此堆叠。",
    descriptionDetail:
      "武夷古道穿过丹霞地貌，茶香与竹影在此堆叠，自古是闽赣之间的要道。如今仍可沿古道慢行：一侧是岩茶山场与制茶人家，一侧是溪流与密林。适合把几天交给这条线，白天走路、访茶，夜里宿在村舍，用脚步和一杯茶理解「岩骨花香」与古道曾经承载的人与货。",
    routeCount: 5,
    creatorCount: 2,
    serviceIds: ["svc-wuyi-ancient", "svc-minbei-creek"]
  },
  {
    id: "dest-qinghai",
    slug: "qinghai-lake",
    name: "青海湖畔",
    cover: "https://picsum.photos/seed/yezai-dest-12/1200/800",
    description: "湖岸线宽阔，人烟稀少，适合缓慢公路与观测。",
    descriptionDetail:
      "青海湖畔湖岸线宽阔，人烟稀少，适合缓慢的公路旅行与自然观测。环湖而行，会遇见牧人、经幡、油菜花海与成群的候鸟；若愿意在某一处多停几天，可以跟着当地人识草、看星、听他们讲湖与山的神话。这里的美在于空旷与安静，在于把节奏交给湖风和四季。",
    routeCount: 5,
    creatorCount: 2,
    serviceIds: ["svc-qinghai-loop", "svc-lancang-source"]
  }
];

module.exports = { destinations };

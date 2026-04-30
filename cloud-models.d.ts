
import { DataModelMethods } from "@cloudbase/wx-cloud-client-sdk";
interface IModal_TravelOrder {
  /**
   * 服务类型
   * 服务类型
   */
  serviceType?: string;
  /**
   * 联系人姓名
   * 联系人姓名
   */
  travelerName?: string;
  /**
   * 订单联系人姓名
   * 订单联系人姓名
   */
  orderContactName?: string;
  /**
   * 短编号
   * 短编号
   */
  shortId: string;
  /**
   * 备注
   * 备注
   */
  note?: string;
  /**
   * 用户OpenID
   * 用户OpenID
   */
  userOpenid: string;
  /**
   * 出行人JSON
   * 出行人JSON
   */
  travelersJson?: string;
  /**
   * 联系人证件号
   * 联系人证件号
   */
  travelerIdCard?: string;
  /**
   * 优惠金额
   * 优惠金额
   */
  discount?: number;
  /**
   * 期次编码
   * 期次编码
   */
  servicePeriodCode?: string;
  /**
   * 版本名称
   * 版本名称
   */
  versionName?: string;
  /**
   * 创作者快照JSON
   * 创作者快照JSON
   */
  creatorSnapshotJson?: string;
  /**
   * 服务Slug
   * 服务Slug
   */
  serviceSlug: string;
  /**
   * 服务快照JSON
   * 服务快照JSON
   */
  serviceSnapshotJson?: string;
  /**
   * 应付金额
   * 应付金额
   */
  payable: number;
  /**
   * 人数
   * 人数
   */
  peopleCount: number;
  /**
   * 联系人电话
   * 联系人电话
   */
  travelerPhone?: string;
  /**
   * 订单联系人电话
   * 订单联系人电话
   */
  orderContactPhone?: string;
  /**
   * 取消时间戳
   * 取消时间戳
   */
  canceledAtTs?: number;
  /**
   * 创建时间文本
   * 创建时间文本
   */
  createdAtText: string;
  /**
   * 创建时间戳
   * 创建时间戳
   */
  createdAtTs: number;
  /**
   * 订单金额
   * 订单金额
   */
  amount: number;
  /**
   * 订单号
   * 订单号
   */
  orderNo: string;
  /**
   * 客户端请求ID
   * 客户端请求ID
   */
  clientRequestId?: string;
  /**
   * 结束日期
   * 结束日期
   */
  travelDateEnd: string;
  /**
   * 服务封面
   * 服务封面
   */
  serviceCover?: string;
  /**
   * 服务名称
   * 服务名称
   */
  serviceName: string;
  /**
   * 支付时间戳
   * 支付时间戳
   */
  paidAtTs?: number;
  /**
   * 出行日期
   * 出行日期
   */
  travelDate: string;
  /**
   * 开始日期
   * 开始日期
   */
  travelDateStart: string;
  /**
   * 订单状态
   * 订单状态
   */
  status: string;
}

interface IModal_ServicePeriod {
  /**
   * 创作者ID
   * 创作者ID
   */
  creatorId?: string;
  /**
   * 结束日期
   * 结束日期
   */
  dateEnd: string;
  /**
   * 服务名称
   * 服务名称
   */
  serviceName: string;
  /**
   * 版本名称
   * 版本名称
   */
  versionName?: string;
  /**
   * 成团人数
   * 成团人数
   */
  minGroup?: number;
  /**
   * 总名额
   * 总名额
   */
  totalSeats?: number;
  /**
   * 剩余名额
   * 剩余名额
   */
  remainingSeats: number;
  /**
   * 期次编码
   * 期次编码
   */
  periodCode: string;
  /**
   * 服务Slug
   * 服务Slug
   */
  serviceSlug: string;
  /**
   * 徽标
   * 徽标
   */
  badge?: string;
  /**
   * 开始日期
   * 开始日期
   */
  dateStart: string;
  /**
   * 价格
   * 价格
   */
  price: number;
  /**
   * 服务ID
   * 服务ID
   */
  serviceId?: string;
  /**
   * 状态
   * 状态
   */
  status: string;
}


interface IModels {

    /**
    * 数据模型：旅行订单模型
    */ 
    TravelOrder: DataModelMethods<IModal_TravelOrder>;

    /**
    * 数据模型：服务期次模型
    */ 
    ServicePeriod: DataModelMethods<IModal_ServicePeriod>;    
}

declare module "@cloudbase/wx-cloud-client-sdk" {
    interface OrmClient extends IModels {}
}

declare global {
    interface WxCloud {
        models: IModels;
    }
}

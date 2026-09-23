/**
 * 画布级插画的常量与换算：屏幕（Canvas 2D）/ PNG / SVG **三端共用**。
 *
 * 与贴纸（贴在主题上、28px、默认落点要靠节点尺寸现算）不同，
 * 插画没有宿主主题、自带绝对位置，也没有"默认落点"这回事——
 * 所有需要"由存储值算出绘制参数"的地方都只允许走本模块，
 * 否则就会出现"屏幕上对、导出里歪"这类只能靠像素对照才发现的问题。
 */

/** 素材画布尺寸：所有插画都按 64×64 的 viewBox 描述（与贴纸同一约定）。 */
export const ILLUSTRATION_VIEWBOX = 64

/** 新插入时的默认边长（世界单位）。 */
export const ILLUSTRATION_DEFAULT_SIZE = 120

/**
 * 面板上可选的档位（世界单位）。
 *
 * 用离散档位而不是自由拖拽缩放：档位是**可断言**的
 * （放进去多少、渲染出来就是多少），而拖拽手柄在 jsdom 里量不出真实版面，
 * 只能靠人工拖一遍看效果——那正是本项目要避免的东西。
 */
export const ILLUSTRATION_SIZE_STEPS = [72, 120, 192] as const

/** 单张插画边长范围（与 Rust MIN/MAX_ILLUSTRATION_SIZE 保持一致）。 */
export const ILLUSTRATION_SIZE_MIN = 24
export const ILLUSTRATION_SIZE_MAX = 480

/** 尺寸档位的中文名（面板分段控件用）。 */
export const ILLUSTRATION_SIZE_LABELS: Record<number, string> = {
  72: '小',
  120: '中',
  192: '大',
}

/** 单个画布的插画数量上限（与 Rust MAX_SHEET_ILLUSTRATIONS 保持一致）。 */
export const ILLUSTRATION_MAX_PER_SHEET = 20

/** 素材坐标系 → 世界单位的缩放系数。 */
export function illustrationScale(size: number): number {
  return size / ILLUSTRATION_VIEWBOX
}

/**
 * 生成一张插画实例 id。
 *
 * 为什么前端生成：命令是"整体替换插画列表"，服务端只存不造 id；
 * 而同一张素材可以放多次，必须由发起方区分。
 */
export function createIllustrationInstanceId(): string {
  return `ill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 连插多张时每张的错开距离（世界单位）：不叠在同一处，一眼能看出有几张。 */
export const ILLUSTRATION_INSERT_STRIDE = 36

/** 新插画与地图内容底边的间隙（世界单位）。 */
export const ILLUSTRATION_INSERT_MARGIN = 24

/**
 * 计算新插画的落点：地图内容**下方**的空白带，多张时向右下错开。
 *
 * 为什么不放在正中间（第一版就是那样，被真引擎截图推翻）：
 * 插画画在 Canvas 2D 层，而主题节点是 **DOM**、叠在画布之上——
 * 放在中心等于**落在中心主题背后**（截图里火箭只露出一半）。
 * 画布层与 DOM 层的这种叠放关系是既有的（连线/外框/概要都在画布层），
 * 不值得为了一个装饰去改整条渲染分层。
 *
 * 于是沿用项目里已有的约定——「插入 → 自由主题」也是放在**整幅图下方**：
 * 用真实布局的包围盒算，不猜，保证一定看得见（想放哪儿再拖过去）。
 *
 * 为什么不按视口中心：视口中心要读相机，而相机状态在画布组件内部；
 * 让菜单与格式面板去取它的实时值，就得在两棵子树之间牵一条可变引用——
 * 那条线没有测试入口、还容易读到过期值。
 *
 * ⚠️ **必须减去 `offsetX/offsetY`**：布局产出的是"根主题相对坐标"，
 * 加上 offset 才是世界坐标（`layoutNodeToBounds` / `offsetEdge` 都这么干）；
 * 而插画的存储坐标是**布局坐标系**、渲染时才加 offset。
 * 漏了这一步，插画会整体偏出一个 offset：真引擎实测表现为
 * "一张新插画落在画面右边缘、还被裁掉一半"。
 */
export function computeIllustrationInsertPosition(
  layout: { width: number; height: number; offsetX: number; offsetY: number },
  index: number,
): { x: number; y: number } {
  const step = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0
  return {
    x: layout.width / 2 - layout.offsetX + step * ILLUSTRATION_INSERT_STRIDE,
    y:
      layout.height + ILLUSTRATION_INSERT_MARGIN - layout.offsetY +
      step * ILLUSTRATION_INSERT_STRIDE,
  }
}

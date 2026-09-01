/**
 * 工具栏图标组件：线性 SVG 图标（stroke-width 1.5），参考 Lucide / SF Symbols 风格。
 *
 * 所有图标继承 currentColor，尺寸 16×16，用于工具栏图标按钮。
 * 图标为纯函数组件，无状态无副作用。
 */

interface IconProps {
  className?: string
  size?: number
}

function Svg({ children, size = 16, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** 新建文档 */
export function FilePlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 12v6" />
      <path d="M9 15h6" />
    </Svg>
  )
}

/** 打开文档 */
export function FolderOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 14l-3-3V5a2 2 0 0 1 2-2h4l3 3h6a2 2 0 0 1 2 2v2" />
      <path d="M2 14h20l-3 6H5z" />
    </Svg>
  )
}

/** 保存 */
export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </Svg>
  )
}

/** 另存为 */
export function SaveAsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
      <path d="M9 14h6" />
    </Svg>
  )
}

/** 撤销 */
export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
    </Svg>
  )
}

/** 重做 */
export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13" />
    </Svg>
  )
}

/** 导入 */
export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Svg>
  )
}

/** 导出 */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="M16 6l-4-4-4 4" />
      <path d="M12 2v13" />
    </Svg>
  )
}

/** 模板 */
export function LayoutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  )
}

/** 演示 */
export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** 检查更新 */
export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3L3 16" />
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 21v-5h5" />
    </Svg>
  )
}

/** 下拉箭头 */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  )
}

/** 主题（文本样式）— Inspector 主题 tab */
export function TypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </Svg>
  )
}

/** 画布（网格）— Inspector 画布 tab */
export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </Svg>
  )
}

/** 关系线（链接）— Inspector 关系线 tab */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07L12.5 19.5" />
    </Svg>
  )
}

/** 分组（容器）— Inspector 分组 tab */
export function GroupIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <circle cx="8" cy="15" r="1.5" />
      <circle cx="16" cy="15" r="1.5" />
      <path d="M9.5 15h5" />
    </Svg>
  )
}

/** 新建子主题（父节点 → 带 + 的子节点） */
export function SubTopicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="9" width="7" height="6" rx="1" />
      <path d="M9 12h3" />
      <rect x="12" y="9" width="10" height="6" rx="1" />
      <path d="M17 10.5v3" />
      <path d="M15.5 12h3" />
    </Svg>
  )
}

/** 新建同级主题（树状平级节点） */
export function SiblingTopicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12h-8" />
      <path d="M21 6H8" />
      <path d="M21 18h-8" />
      <path d="M3 6v4c0 1.1.9 2 2 2h3" />
      <path d="M3 10v6c0 1.1.9 2 2 2h3" />
    </Svg>
  )
}

/** 删除 */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  )
}

/** 插入（圆形加号） */
export function InsertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </Svg>
  )
}

/** 搜索 */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Svg>
  )
}

/** 检查器显隐（右侧面板） */
export function PanelRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </Svg>
  )
}

/** 结构（分支） */
export function StructureIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Svg>
  )
}

/** 主题（调色板） */
export function ThemeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </Svg>
  )
}

/** 快捷键（键盘） */
export function KeyboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10" />
    </Svg>
  )
}

/** 太阳：浅色主题与“跟随系统”态 */
export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Svg>
  )
}

/** 月亮：暗色主题 */
export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </Svg>
  )
}

/** 显示器：跟随系统主题 */
export function MonitorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  )
}

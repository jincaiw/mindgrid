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

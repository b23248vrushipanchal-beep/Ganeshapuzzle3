import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useId,
    startTransition,
    CSSProperties,
    PointerEvent as ReactPointerEvent,
} from "react"
import {
    addPropertyControls,
    ControlType,
    useIsStaticRenderer,
} from "../lib/framer-shim"
import { AnimatePresence, motion } from "framer-motion"

/*
Merged component.

Base mechanics: the original jigsaw "PuzzleGame" component (drag pieces,
snap into clusters, reveal the finished image, optional confetti burst).

New behaviour added on top, combining the puzzle with the idea behind the
"CardStack" component (a set of items that animate in with spring physics):

1. The puzzle stays centered in the frame, both while it's being solved
   and once it's complete.
2. Once the completed image has fully revealed, it becomes clickable.
   Clicking it lifts the whole puzzle (image + underlying pieces, moved
   together as one group) straight upward, opening up space underneath it.
   An information panel fades/slides in below the image, horizontally
   centered against it. The panel's content is in VERTICAL form: a stack
   of plain paragraphs - no indices or counters - with each item's
   optional title folded into its paragraph as a small caps lead-in, so
   everything reads as prose. Every paragraph springs in downward with a
   short stagger - the same stacked, springy feel as the old CardStack
   component, just used for information instead of photos.
3. Clicking the image again collapses the panel and returns the puzzle to
   its resting, centered position. Resetting the puzzle (new image, or
   re-mount) also collapses the panel.

Everything is driven by framer-motion springs/easings so every stage -
lift, expand, collapse - transitions smoothly.
*/

interface InfoItem {
    title?: string
    text?: string
}

interface PuzzleGameProps {
    image?:
        | string
        | {
              src?: string
              srcSet?: string
              alt?: string
              width?: number
              height?: number
          }
    imageFit?: "cover" | "contain" | "fill"
    celebrationConfetti?: boolean
    idleMotion?: boolean
    backgroundColor?: string
    puzzleSize?: number | string
    outlineColor?: string
    outlineWidth?: number
    cornerRadius?: number
    style?: CSSProperties
    orientation?: "vertical" | "horizontal" | "auto"
    columns?: number
    rows?: number

    // Post-completion "lift up + reveal horizontal info strip below" behaviour.
    infoTitle?: string
    infoItems?: InfoItem[]
    infoGap?: number
    infoPanelWidth?: number
    infoPanelHeight?: number
    liftAmount?: number
    minSideMargin?: number
    infoBackgroundColor?: string
    infoTitleColor?: string
    infoTextColor?: string
    infoPanelRadius?: number
    infoItemStiffness?: number
    infoItemDamping?: number

    // Notified when the completed image has fully revealed (or un-reveals
    // after a reset). Not exposed in the Framer property panel.
    onSolvedChange?: (solved: boolean) => void

    // Private/backward-compatible values. They are intentionally not exposed
    // in the Framer property panel.
    imagePositionX?: number
    imagePositionY?: number
    resetPuzzleWhenImageChanges?: boolean
    idleMotionIntensity?: "Subtle" | "Medium"
    dragShadowIntensity?: number
    snapDistance?: number
    draggedPieceScale?: number
    showGuide?: boolean
    showSubtleGuide?: boolean
    guideOpacity?: number
    // Backward compatibility for existing instances
    puzzleWidth?: number | string
    shadowIntensity?: number
}

interface ConfettiParticle {
    id: string
    color: string
    width: number
    height: number
    startX: number
    startY: number
    endX: number
    endY: number
    startRotate: number
    endRotate: number
    duration: number
    delay: number
}

type EdgeValue = -1 | 0 | 1

interface ConfettiRainProps {
    particles: ConfettiParticle[]
    runId: number
}

interface PieceData {
    id: string
    row: number
    column: number
    initialX: number
    initialY: number
    solvedGridX: number
    solvedGridY: number
    top: EdgeValue
    right: EdgeValue
    bottom: EdgeValue
    left: EdgeValue
    neighbourIds: string[]
    clusterId: string
    isConnected: boolean
    isDragging: boolean
    zIndex: number
    x: number
    y: number
    rotate: number
    scale: number
    opacity: number
    idleResumeAt: number
}

// Framer-friendly typography: no webfont loading, no Google Fonts link and
// no FOUT. Inter is Framer's built-in default font, so it always resolves to
// a real, named font inside the Framer canvas and on published Framer sites;
// everywhere else the stack falls back gracefully to the platform's native
// UI font. Zero setup required.
const FONT_STACK =
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif'

const placeholderImage =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F6EBDD"/>
      <stop offset="35%" stop-color="#EAD9C4"/>
      <stop offset="70%" stop-color="#DCC7AD"/>
      <stop offset="100%" stop-color="#CDB49A"/>
    </linearGradient>
    <radialGradient id="g2" cx="70%" cy="25%" r="60%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g1)"/>
  <rect width="1200" height="900" fill="url(#g2)"/>
  <path d="M0 720 C220 620 450 780 700 690 C900 620 1050 690 1200 640 L1200 900 L0 900 Z" fill="#E7D5BE" opacity="0.8"/>
</svg>`)

const defaultInfoItems: InfoItem[] = [
    {
        title: "",
        text: "Gajamukhasura, an asura performed intense tapasya to please Lord Shiva. Pleased with him Shiv ji, granted him a boon that made him invincible against all weapons. No god, human, or celestial weapon could kill him.",
    },
    {
        title: "",
        text: "Blinded by power, the demon grew arrogant and began terrorizing the universe. The gods approached Lord Ganesha.",
    },
    {
        title: "",
        text: "During the fight the demon realized Ganesha's power. Seeking a way to escape, the demon turned himself into a giant mouse. Ganesha quickly caught the giant mouse and mounted him. The demon’s arrogance shattered. He begged for mercy and offered his total submission.  Ganesha ensured that the demon's power was channeled into divine service forever. Making him his vahan forever",
    },
]

function toWidthFactor(value: number | string): number {
    if (typeof value === "number")
        return Math.max(0.2, Math.min(1, value / 100))
    const parsed = Number(String(value).replace("%", "").trim())
    if (Number.isFinite(parsed)) return Math.max(0.2, Math.min(1, parsed / 100))
    return 0.68
}

function edgeSign(row: number, col: number, seed = 0): EdgeValue {
    const value = (row * 11 + col * 7 + seed) % 2 === 0 ? 1 : -1
    return value as EdgeValue
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function resolveImageSource(image: PuzzleGameProps["image"]): {
    src: string
    ratio?: number
} {
    if (typeof image === "string" && image.length > 0) {
        return { src: image }
    }
    if (image && typeof image === "object" && image.src) {
        const width = typeof image.width === "number" ? image.width : undefined
        const height =
            typeof image.height === "number" ? image.height : undefined
        const ratio = width && height && height > 0 ? width / height : undefined
        return { src: image.src, ratio }
    }
    return { src: placeholderImage }
}

function jigsawPath(
    x: number,
    y: number,
    w: number,
    h: number,
    edges: {
        top: EdgeValue
        right: EdgeValue
        bottom: EdgeValue
        left: EdgeValue
    },
    cornerRadius: number,
    connectorDepth: number
): string {
    const left = x
    const right = x + w
    const top = y
    const bottom = y + h

    const horizontalConnectorWidth = w * 0.26
    const verticalConnectorWidth = h * 0.26
    const neckRatio = 0.46
    const neckDepth = connectorDepth * 0.42

    const topCx = left + w / 2
    const rightCy = top + h / 2
    const bottomCx = left + w / 2
    const leftCy = top + h / 2

    const commands: string[] = []
    commands.push(`M ${left + cornerRadius} ${top}`)

    if (edges.top === 0) {
        commands.push(`L ${right - cornerRadius} ${top}`)
    } else {
        const dir = edges.top === 1 ? -1 : 1
        const half = horizontalConnectorWidth / 2
        const neckHalf = (horizontalConnectorWidth * neckRatio) / 2
        const xA = topCx - half
        const xB = topCx - neckHalf
        const xC = topCx + neckHalf
        const xD = topCx + half
        commands.push(`L ${xA} ${top}`)
        commands.push(
            `C ${xA + half * 0.35} ${top}, ${xB} ${top}, ${xB} ${top + dir * neckDepth}`
        )
        commands.push(
            `C ${xB} ${top + dir * (neckDepth + connectorDepth * 0.38)}, ${topCx - half * 0.42} ${top + dir * connectorDepth}, ${topCx} ${top + dir * connectorDepth}`
        )
        commands.push(
            `C ${topCx + half * 0.42} ${top + dir * connectorDepth}, ${xC} ${top + dir * (neckDepth + connectorDepth * 0.38)}, ${xC} ${top + dir * neckDepth}`
        )
        commands.push(
            `C ${xC} ${top}, ${xD - half * 0.35} ${top}, ${xD} ${top}`
        )
        commands.push(`L ${right - cornerRadius} ${top}`)
    }

    commands.push(`Q ${right} ${top}, ${right} ${top + cornerRadius}`)

    if (edges.right === 0) {
        commands.push(`L ${right} ${bottom - cornerRadius}`)
    } else {
        const dir = edges.right === 1 ? 1 : -1
        const half = verticalConnectorWidth / 2
        const neckHalf = (verticalConnectorWidth * neckRatio) / 2
        const yA = rightCy - half
        const yB = rightCy - neckHalf
        const yC = rightCy + neckHalf
        const yD = rightCy + half
        commands.push(`L ${right} ${yA}`)
        commands.push(
            `C ${right} ${yA + half * 0.35}, ${right} ${yB}, ${right + dir * neckDepth} ${yB}`
        )
        commands.push(
            `C ${right + dir * (neckDepth + connectorDepth * 0.38)} ${yB}, ${right + dir * connectorDepth} ${rightCy - half * 0.42}, ${right + dir * connectorDepth} ${rightCy}`
        )
        commands.push(
            `C ${right + dir * connectorDepth} ${rightCy + half * 0.42}, ${right + dir * (neckDepth + connectorDepth * 0.38)} ${yC}, ${right + dir * neckDepth} ${yC}`
        )
        commands.push(
            `C ${right} ${yC}, ${right} ${yD - half * 0.35}, ${right} ${yD}`
        )
        commands.push(`L ${right} ${bottom - cornerRadius}`)
    }

    commands.push(`Q ${right} ${bottom}, ${right - cornerRadius} ${bottom}`)

    if (edges.bottom === 0) {
        commands.push(`L ${left + cornerRadius} ${bottom}`)
    } else {
        const dir = edges.bottom === 1 ? 1 : -1
        const half = horizontalConnectorWidth / 2
        const neckHalf = (horizontalConnectorWidth * neckRatio) / 2
        const xA = bottomCx + half
        const xB = bottomCx + neckHalf
        const xC = bottomCx - neckHalf
        const xD = bottomCx - half
        commands.push(`L ${xA} ${bottom}`)
        commands.push(
            `C ${xA - half * 0.35} ${bottom}, ${xB} ${bottom}, ${xB} ${bottom + dir * neckDepth}`
        )
        commands.push(
            `C ${xB} ${bottom + dir * (neckDepth + connectorDepth * 0.38)}, ${bottomCx + half * 0.42} ${bottom + dir * connectorDepth}, ${bottomCx} ${bottom + dir * connectorDepth}`
        )
        commands.push(
            `C ${bottomCx - half * 0.42} ${bottom + dir * connectorDepth}, ${xC} ${bottom + dir * (neckDepth + connectorDepth * 0.38)}, ${xC} ${bottom + dir * neckDepth}`
        )
        commands.push(
            `C ${xC} ${bottom}, ${xD + half * 0.35} ${bottom}, ${xD} ${bottom}`
        )
        commands.push(`L ${left + cornerRadius} ${bottom}`)
    }

    commands.push(`Q ${left} ${bottom}, ${left} ${bottom - cornerRadius}`)

    if (edges.left === 0) {
        commands.push(`L ${left} ${top + cornerRadius}`)
    } else {
        const dir = edges.left === 1 ? -1 : 1
        const half = verticalConnectorWidth / 2
        const neckHalf = (verticalConnectorWidth * neckRatio) / 2
        const yA = leftCy + half
        const yB = leftCy + neckHalf
        const yC = leftCy - neckHalf
        const yD = leftCy - half
        commands.push(`L ${left} ${yA}`)
        commands.push(
            `C ${left} ${yA - half * 0.35}, ${left} ${yB}, ${left + dir * neckDepth} ${yB}`
        )
        commands.push(
            `C ${left + dir * (neckDepth + connectorDepth * 0.38)} ${yB}, ${left + dir * connectorDepth} ${leftCy + half * 0.42}, ${left + dir * connectorDepth} ${leftCy}`
        )
        commands.push(
            `C ${left + dir * connectorDepth} ${leftCy - half * 0.42}, ${left + dir * (neckDepth + connectorDepth * 0.38)} ${yC}, ${left + dir * neckDepth} ${yC}`
        )
        commands.push(
            `C ${left} ${yC}, ${left} ${yD + half * 0.35}, ${left} ${yD}`
        )
        commands.push(`L ${left} ${top + cornerRadius}`)
    }

    commands.push(`Q ${left} ${top}, ${left + cornerRadius} ${top}`)
    commands.push("Z")

    return commands.join(" ")
}

function ConfettiRain({ particles, runId }: ConfettiRainProps) {
    return (
        <motion.div
            key={`confetti-rain-${runId}`}
            aria-hidden
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
                position: "absolute",
                top: -80,
                left: 0,
                right: 0,
                bottom: -120,
                pointerEvents: "none",
                zIndex: 9999,
                overflow: "visible",
            }}
        >
            {particles.map((particle) => (
                <motion.div
                    key={particle.id}
                    initial={{
                        x: particle.startX,
                        y: particle.startY,
                        rotate: particle.startRotate,
                        opacity: 0,
                    }}
                    animate={{
                        x: particle.endX,
                        y: particle.endY,
                        rotate: particle.endRotate,
                        opacity: [0, 1, 1, 0],
                    }}
                    transition={{
                        duration: particle.duration,
                        delay: particle.delay,
                        ease: "easeOut",
                        times: [0, 0.08, 0.82, 1],
                    }}
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: particle.width,
                        height: particle.height,
                        borderRadius: 1.5,
                        background: particle.color,
                    }}
                />
            ))}
        </motion.div>
    )
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function PuzzleGame(props: PuzzleGameProps) {
    const {
        image,
        imageFit = "cover",
        imagePositionX = 50,
        imagePositionY = 50,
        resetPuzzleWhenImageChanges = true,
        celebrationConfetti = true,
        idleMotion = true,
        idleMotionIntensity = "Subtle",
        backgroundColor = "#EFE2CF",
        puzzleSize,
        puzzleWidth = 66,
        outlineColor = "#6D6963",
        outlineWidth = 1.5,
        cornerRadius: cornerRadiusControl = 2,
        dragShadowIntensity,
        shadowIntensity,
        snapDistance = 28,
        draggedPieceScale = 1.015,
        showGuide,
        showSubtleGuide = false,
        guideOpacity = 0.05,
        infoTitle = "Mushak ji",
        infoItems = defaultInfoItems,
        infoGap: _infoGap = 20,
        infoPanelWidth = 420,
        infoPanelHeight = 500,
        liftAmount: _liftAmount = 110,
        minSideMargin = 16,
        infoBackgroundColor = "#FFFFFF",
        infoTitleColor = "#2B2620",
        infoTextColor = "#6D6963",
        infoPanelRadius = 12,
        infoItemStiffness: _infoItemStiffness = 220,
        infoItemDamping: _infoItemDamping = 24,
        onSolvedChange,
        orientation = "auto",
        columns: customColumns,
        rows: customRows,
        style,
    } = props

    const completedImageClipId = useId().replace(/:/g, "")

    const isStatic = useIsStaticRenderer()
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })

    // Phone frames are usually taller than they are wide, while desktop
    // frames are usually wider than tall. Rather than lock the grid to one
    // fixed shape, pick the orientation that matches the actual frame the
    // component is placed in: 3 columns x 4 rows (portrait) once the
    // container itself is portrait, otherwise 4 columns x 3 rows
    // (landscape). Either way the puzzle stays at 12 pieces total.
    // Lock columns and rows once initialized for the active puzzle game
    // so rotating the device does NOT change the grid structure or corrupt pieces.
    const activeGridRef = useRef<{ columns: number; rows: number } | null>(null)
    const isPortraitContainer =
        orientation === "vertical"
            ? true
            : orientation === "horizontal"
              ? false
              : size.height > size.width
    const columns =
        activeGridRef.current?.columns ??
        (customColumns ?? (isPortraitContainer ? 3 : 4))
    const rows =
        activeGridRef.current?.rows ??
        (customRows ?? (isPortraitContainer ? 4 : 3))
    const prevGeometryRef = useRef<{
        size: { width: number; height: number }
        boardWidth: number
        boardHeight: number
        boardLeft: number
        boardTop: number
        cellWidth: number
        cellHeight: number
        pad: number
    } | null>(null)
    const [pieces, setPieces] = useState<PieceData[]>([])
    const [dragClusterId, setDragClusterId] = useState<string | null>(null)
    const [, setZCounter] = useState(5)
    const [showConfetti, setShowConfetti] = useState(false)
    const [confettiParticles, setConfettiParticles] = useState<
        ConfettiParticle[]
    >([])
    const [confettiRunId, setConfettiRunId] = useState(0)
    // Keep the solved pieces visible while their final snap settles. The
    // completed image is revealed only after that movement has finished.
    const [finalRevealActive, setFinalRevealActive] = useState(false)
    // Toggled by clicking the completed image; lifts the puzzle and expands
    // the horizontal info strip underneath it.
    const [isInfoExpanded, setIsInfoExpanded] = useState(false)
    const [, setInfoPanelHeight] = useState(0)
    const infoContentRef = useRef<HTMLDivElement | null>(null)
    const previousImageSrcRef = useRef<string>("")
    const hasInitializedPuzzleRef = useRef(false)
    const previousCompletedRef = useRef(false)
    const confettiTimeoutsRef = useRef<number[]>([])
    const idleTimeoutsRef = useRef<number[]>([])
    const dragRef = useRef<{
        pointerId: number
        clusterId: string
        startClientX: number
        startClientY: number
        originById: Record<string, { x: number; y: number }>
    } | null>(null)

    const resolvedImage = useMemo(() => resolveImageSource(image), [image])
    const imageSrc = resolvedImage.src
    const [imageNaturalRatio, setImageNaturalRatio] = useState<number | undefined>(
        () => resolvedImage.ratio
    )

    useEffect(() => {
        if (!imageSrc || typeof window === "undefined") return
        const img = new Image()
        img.src = imageSrc
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            setImageNaturalRatio(img.naturalWidth / img.naturalHeight)
        } else {
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setImageNaturalRatio(img.naturalWidth / img.naturalHeight)
                }
            }
        }
    }, [imageSrc])

    const boardRatio = resolvedImage.ratio || imageNaturalRatio || (columns / rows)
    const widthFactor = toWidthFactor(puzzleSize ?? puzzleWidth)
    const boardWidth = useMemo(() => {
        const byWidth = size.width * widthFactor
        const byHeight = size.height * 0.76 * boardRatio
        return Math.max(180, Math.min(byWidth, byHeight))
    }, [boardRatio, size.height, size.width, widthFactor])
    const boardHeight = useMemo(
        () => boardWidth / boardRatio,
        [boardWidth, boardRatio]
    )
    const boardLeft = (size.width - boardWidth) / 2
    const boardTop = (size.height - boardHeight) / 2
    const cellWidth = boardWidth / columns
    const cellHeight = boardHeight / rows
    const connectorDepth = Math.min(cellWidth, cellHeight) * 0.145
    // Corner Radius belongs to the puzzle artwork itself — both the loose
    // pieces and the completed image — not to the outer Framer component.
    // Clamp it against one cell so the jigsaw connectors remain stable.
    const puzzleCornerRadius = clamp(
        cornerRadiusControl,
        0,
        Math.min(cellWidth, cellHeight) * 0.18
    )
    const pieceCornerRadius = puzzleCornerRadius
    const pad = connectorDepth + Math.max(2, outlineWidth + 1)
    const effectiveShadow = dragShadowIntensity ?? shadowIntensity ?? 12
    // Keep snapping generous as the puzzle is scaled up. This prevents a
    // large Puzzle Size from making adjacent pieces look aligned but fail to
    // join into a single locked cluster.
    const effectiveSnapDistance = useMemo(() => {
        const smallestCell = Math.min(cellWidth, cellHeight)
        const scaleFactor = clamp(smallestCell / 130, 0.8, 1.35)
        return Math.max(snapDistance * scaleFactor, smallestCell * 0.24)
    }, [cellHeight, cellWidth, snapDistance])

    // The info panel is a vertical stack of paragraphs that opens below the
    // image. Its width follows the configured panel width, but it is capped
    // to the image itself so the two always read as one aligned block, and
    // to the frame's side margins so it can never overflow horizontally.
    const cardWidth = useMemo(
        () =>
            clamp(
                Math.min(boardWidth + 40, infoPanelWidth),
                280,
                Math.max(280, size.width - minSideMargin * 2)
            ),
        [boardWidth, infoPanelWidth, minSideMargin, size.width]
    )
    const cardHeight = useMemo(
        () =>
            clamp(
                infoPanelHeight ?? 500,
                240,
                Math.max(240, size.height - minSideMargin * 2)
            ),
        [infoPanelHeight, minSideMargin, size.height]
    )
    const infoPanelWidthResolved = cardWidth

    // Horizontally center the panel into the middle of the screen
    const infoPanelLeft = useMemo(
        () => (size.width > 0 ? Math.round((size.width - cardWidth) / 2) : 0),
        [cardWidth, size.width]
    )
    // Vertically center the panel into the middle of the screen
    const infoPanelTop = useMemo(
        () => (size.height > 0 ? Math.round((size.height - cardHeight) / 2) : 0),
        [cardHeight, size.height]
    )

    // The artwork exits completely off-screen to the right:
    // Its left edge starts at boardLeft. Moving by (size.width - boardLeft + 60) places its left
    // edge 60px past the right boundary of the container (which has overflow: hidden).
    const exitArtworkX = useMemo(
        () =>
            size.width > 0
                ? Math.max(size.width, size.width - boardLeft + 60)
                : 1000,
        [boardLeft, size.width]
    )

    // The description card enters from completely off-screen to the left:
    // Its anchored resting position is at infoPanelLeft. Moving by -(infoPanelLeft + cardWidth + 60)
    // places its right edge 60px past the left boundary of the container.
    const enterCardStartX = useMemo(
        () =>
            size.width > 0
                ? -(infoPanelLeft + cardWidth + 60)
                : -1000,
        [infoPanelLeft, cardWidth, size.width]
    )


    const imagePlacement = useMemo(() => {
        const positionX = clamp(imagePositionX, 0, 100) / 100
        const positionY = clamp(imagePositionY, 0, 100) / 100
        const boardRatio = boardWidth / boardHeight
        const sourceRatio = resolvedImage.ratio || imageNaturalRatio || boardRatio

        if (imageFit === "fill") {
            return { x: 0, y: 0, width: boardWidth, height: boardHeight }
        }

        let fittedWidth = boardWidth
        let fittedHeight = boardHeight
        if (imageFit === "cover") {
            if (sourceRatio > boardRatio) {
                fittedHeight = boardHeight
                fittedWidth = boardHeight * sourceRatio
            } else {
                fittedWidth = boardWidth
                fittedHeight = boardWidth / sourceRatio
            }
        } else {
            if (sourceRatio > boardRatio) {
                fittedWidth = boardWidth
                fittedHeight = boardWidth / sourceRatio
            } else {
                fittedHeight = boardHeight
                fittedWidth = boardHeight * sourceRatio
            }
        }

        return {
            x: (boardWidth - fittedWidth) * positionX,
            y: (boardHeight - fittedHeight) * positionY,
            width: fittedWidth,
            height: fittedHeight,
        }
    }, [
        boardHeight,
        boardWidth,
        imageFit,
        imagePositionX,
        imagePositionY,
        resolvedImage.ratio,
    ])

    useEffect(() => {
        if (typeof window === "undefined") return
        const element = containerRef.current
        if (!element) return

        const update = () => {
            const rect = element.getBoundingClientRect()
            startTransition(() => {
                setSize({
                    width: Math.max(1, rect.width),
                    height: Math.max(1, rect.height),
                })
            })
        }

        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    // Measure the info strip's natural content height so the lift knows how
    // much room the row needs below the image. The content div itself is
    // never clipped, only its parent strip is faded, so this keeps measuring
    // correctly whether the strip is open or closed.
    useEffect(() => {
        if (typeof window === "undefined") return
        const element = infoContentRef.current
        if (!element) return

        const update = () => {
            setInfoPanelHeight(element.getBoundingClientRect().height)
        }

        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [infoItems, infoTitle, boardWidth, infoPanelWidthResolved])

    const pieceBlueprint = useMemo(() => {
        const map: PieceData[] = []
        const total = rows * columns
        // Scatter margin/ring: loose pieces are distributed evenly around the
        // board on an ellipse sized to clear it, rather than a hardcoded list
        // of positions. This generalizes to any rows/columns combination.
        const scatterMargin = Math.max(
            20,
            Math.min(cellWidth, cellHeight) * 0.2
        )
        const scatterCenterX = boardLeft + boardWidth / 2
        const scatterCenterY = boardTop + boardHeight / 2
        const ringRadiusX = boardWidth / 2 + cellWidth * 0.9 + scatterMargin
        const ringRadiusY = boardHeight / 2 + cellHeight * 0.9 + scatterMargin

        const edgeMap: Array<
            Array<{
                top: EdgeValue
                right: EdgeValue
                bottom: EdgeValue
                left: EdgeValue
            }>
        > = Array.from({ length: rows }, () =>
            Array.from({ length: columns }, () => ({
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
            }))
        )

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < columns; c++) {
                if (r > 0)
                    edgeMap[r][c].top = (edgeMap[r - 1][c].bottom *
                        -1) as EdgeValue
                else edgeMap[r][c].top = 0

                if (c > 0)
                    edgeMap[r][c].left = (edgeMap[r][c - 1].right *
                        -1) as EdgeValue
                else edgeMap[r][c].left = 0

                edgeMap[r][c].right =
                    c === columns - 1 ? 0 : edgeSign(r, c + 1, 3)
                edgeMap[r][c].bottom =
                    r === rows - 1 ? 0 : edgeSign(r + 1, c, 9)
            }
        }

        for (let i = 0; i < total; i++) {
            const r = Math.floor(i / columns)
            const c = i % columns
            const solvedGridX = c * cellWidth
            const solvedGridY = r * cellHeight

            // Spread pieces evenly around an ellipse surrounding the board,
            // with a small per-piece jitter so the pile doesn't look like a
            // perfectly mechanical ring.
            const angle = (i / total) * Math.PI * 2 - Math.PI / 2
            const jitterSeed = (i * 53) % 17
            const radiusJitter = 1 + ((jitterSeed % 5) - 2) * 0.035

            let initialX =
                scatterCenterX +
                Math.cos(angle) * ringRadiusX * radiusJitter -
                cellWidth / 2
            let initialY =
                scatterCenterY +
                Math.sin(angle) * ringRadiusY * radiusJitter -
                cellHeight / 2

            const minX = 4
            const minY = 4
            const maxX = size.width - (cellWidth + pad * 2) - 4
            const maxY = size.height - (cellHeight + pad * 2) - 4

            initialX = Math.max(minX, Math.min(maxX, initialX))
            initialY = Math.max(minY, Math.min(maxY, initialY))

            map.push({
                id: `${r}-${c}`,
                row: r,
                column: c,
                initialX,
                initialY,
                solvedGridX,
                solvedGridY,
                ...edgeMap[r][c],
                neighbourIds: [],
                clusterId: `${r}-${c}`,
                isConnected: false,
                isDragging: false,
                zIndex: 1 + i,
                x: initialX,
                y: initialY,
                rotate: 0,
                scale: 1,
                opacity: 1,
                idleResumeAt: 0,
            })
        }
        return map.map((piece) => {
            const neighbours: string[] = []
            if (piece.row > 0)
                neighbours.push(`${piece.row - 1}-${piece.column}`)
            if (piece.column < columns - 1)
                neighbours.push(`${piece.row}-${piece.column + 1}`)
            if (piece.row < rows - 1)
                neighbours.push(`${piece.row + 1}-${piece.column}`)
            if (piece.column > 0)
                neighbours.push(`${piece.row}-${piece.column - 1}`)
            return { ...piece, neighbourIds: neighbours }
        })
    }, [
        rows,
        columns,
        boardLeft,
        boardTop,
        boardWidth,
        boardHeight,
        cellWidth,
        cellHeight,
        pad,
        size.width,
        size.height,
    ])

    // Initialize the puzzle only once after the component has been measured.
    // Do NOT reset whenever `pieceBlueprint` changes: Framer can issue a minor
    // resize after the completed puzzle is centered or confetti is displayed.
    // A blueprint change used to rebuild all pieces, which looked like an
    // automatic reset immediately after success.
    useEffect(() => {
        if (hasInitializedPuzzleRef.current) return
        if (size.width <= 1 || size.height <= 1) return

        hasInitializedPuzzleRef.current = true
        activeGridRef.current = { columns, rows }
        prevGeometryRef.current = {
            size,
            boardWidth,
            boardHeight,
            boardLeft,
            boardTop,
            cellWidth,
            cellHeight,
            pad,
        }
        startTransition(() => {
            setPieces(pieceBlueprint)
            setZCounter(10 + pieceBlueprint.length)
            setShowConfetti(false)
            setConfettiParticles([])
            setConfettiRunId(0)
            setIsInfoExpanded(false)
        })
        previousCompletedRef.current = false
    }, [pieceBlueprint, size.height, size.width, columns, rows, boardWidth, boardHeight, boardLeft, boardTop, cellWidth, cellHeight, pad])

    // Whenever the screen/container resizes or rotates, seamlessly reposition every piece
    // (both correctly placed and scattered ones) to match the new screen dimensions without
    // losing any player progress or causing overlaps/gaps.
    useEffect(() => {
        if (!hasInitializedPuzzleRef.current) return
        if (!prevGeometryRef.current) {
            prevGeometryRef.current = {
                size,
                boardWidth,
                boardHeight,
                boardLeft,
                boardTop,
                cellWidth,
                cellHeight,
                pad,
            }
            return
        }

        const prev = prevGeometryRef.current
        const widthDiff = Math.abs(size.width - prev.size.width)
        const heightDiff = Math.abs(size.height - prev.size.height)
        const boardDiff =
            Math.abs(boardWidth - prev.boardWidth) +
            Math.abs(boardHeight - prev.boardHeight) +
            Math.abs(boardLeft - prev.boardLeft) +
            Math.abs(boardTop - prev.boardTop)

        if (widthDiff < 0.5 && heightDiff < 0.5 && boardDiff < 0.5) {
            return
        }

        startTransition(() => {
            setPieces((currentPieces) => {
                if (currentPieces.length === 0) return currentPieces

                if (dragRef.current) {
                    dragRef.current = null
                    setDragClusterId(null)
                }

                const prevBoardWidth = prev.boardWidth
                const prevBoardHeight = prev.boardHeight
                const prevBoardLeft = prev.boardLeft
                const prevBoardTop = prev.boardTop
                const prevCellWidth = prev.cellWidth
                const prevCellHeight = prev.cellHeight
                const prevPad = prev.pad

                const newBoardWidth = boardWidth
                const newBoardHeight = boardHeight
                const newBoardLeft = boardLeft
                const newBoardTop = boardTop
                const newCellWidth = cellWidth
                const newCellHeight = cellHeight
                const newPad = pad

                const prevScatterMargin = Math.max(
                    20,
                    Math.min(prevCellWidth, prevCellHeight) * 0.2
                )
                const prevScatterCenterX = prevBoardLeft + prevBoardWidth / 2
                const prevScatterCenterY = prevBoardTop + prevBoardHeight / 2
                const prevRingRadiusX =
                    prevBoardWidth / 2 + prevCellWidth * 0.9 + prevScatterMargin
                const prevRingRadiusY =
                    prevBoardHeight / 2 + prevCellHeight * 0.9 + prevScatterMargin

                const newScatterMargin = Math.max(
                    20,
                    Math.min(newCellWidth, newCellHeight) * 0.2
                )
                const newScatterCenterX = newBoardLeft + newBoardWidth / 2
                const newScatterCenterY = newBoardTop + newBoardHeight / 2
                const newRingRadiusX =
                    newBoardWidth / 2 + newCellWidth * 0.9 + newScatterMargin
                const newRingRadiusY =
                    newBoardHeight / 2 + newCellHeight * 0.9 + newScatterMargin

                const clusterMap = new Map<string, PieceData[]>()
                currentPieces.forEach((p) => {
                    const list = clusterMap.get(p.clusterId) ?? []
                    list.push(p)
                    clusterMap.set(p.clusterId, list)
                })

                const isAllSolved =
                    clusterMap.size === 1 &&
                    currentPieces.length === columns * rows
                const repositionedById = new Map<string, PieceData>()

                clusterMap.forEach((clusterPieces) => {
                    let isBoardPlaced = isAllSolved
                    if (!isBoardPlaced) {
                        const avgDist =
                            clusterPieces.reduce((sum, p) => {
                                const targetX =
                                    prevBoardLeft -
                                    prevPad +
                                    p.column * prevCellWidth
                                const targetY =
                                    prevBoardTop -
                                    prevPad +
                                    p.row * prevCellHeight
                                return sum + Math.hypot(p.x - targetX, p.y - targetY)
                            }, 0) / clusterPieces.length

                        if (avgDist <= effectiveSnapDistance) {
                            isBoardPlaced = true
                        }
                    }

                    if (isBoardPlaced) {
                        clusterPieces.forEach((p) => {
                            const newX =
                                newBoardLeft - newPad + p.column * newCellWidth
                            const newY =
                                newBoardTop - newPad + p.row * newCellHeight
                            repositionedById.set(p.id, {
                                ...p,
                                x: newX,
                                y: newY,
                                solvedGridX: p.column * newCellWidth,
                                solvedGridY: p.row * newCellHeight,
                                isConnected: clusterPieces.length > 1 || isAllSolved,
                                isDragging: false,
                            })
                        })
                        return
                    }

                    if (clusterPieces.length > 1) {
                        const anchor = clusterPieces[0]
                        const oldAnchorCenterX =
                            anchor.x + prevPad + prevCellWidth / 2
                        const oldAnchorCenterY =
                            anchor.y + prevPad + prevCellHeight / 2

                        const dx = oldAnchorCenterX - prevScatterCenterX
                        const dy = oldAnchorCenterY - prevScatterCenterY
                        const angle = Math.atan2(dy, dx)
                        const safePrevRadX = Math.max(1, prevRingRadiusX)
                        const safePrevRadY = Math.max(1, prevRingRadiusY)
                        const normDist = Math.hypot(
                            dx / safePrevRadX,
                            dy / safePrevRadY
                        )

                        const newAnchorCenterX =
                            newScatterCenterX +
                            Math.cos(angle) * (newRingRadiusX * normDist)
                        const newAnchorCenterY =
                            newScatterCenterY +
                            Math.sin(angle) * (newRingRadiusY * normDist)

                        const targetAnchorX =
                            newAnchorCenterX - newPad - newCellWidth / 2
                        const targetAnchorY =
                            newAnchorCenterY - newPad - newCellHeight / 2
                        let originX =
                            targetAnchorX - anchor.column * newCellWidth
                        let originY =
                            targetAnchorY - anchor.row * newCellHeight

                        const minCol = Math.min(
                            ...clusterPieces.map((p) => p.column)
                        )
                        const maxCol = Math.max(
                            ...clusterPieces.map((p) => p.column)
                        )
                        const minRow = Math.min(
                            ...clusterPieces.map((p) => p.row)
                        )
                        const maxRow = Math.max(
                            ...clusterPieces.map((p) => p.row)
                        )

                        const clusterLeft = originX + minCol * newCellWidth
                        const clusterRight =
                            originX +
                            (maxCol + 1) * newCellWidth +
                            newPad * 2
                        const clusterTop = originY + minRow * newCellHeight
                        const clusterBottom =
                            originY +
                            (maxRow + 1) * newCellHeight +
                            newPad * 2

                        if (clusterLeft < 4) originX += 4 - clusterLeft
                        if (clusterRight > size.width - 4)
                            originX -= clusterRight - (size.width - 4)
                        if (clusterTop < 4) originY += 4 - clusterTop
                        if (clusterBottom > size.height - 4)
                            originY -= clusterBottom - (size.height - 4)

                        clusterPieces.forEach((p) => {
                            const newX = originX + p.column * newCellWidth
                            const newY = originY + p.row * newCellHeight
                            repositionedById.set(p.id, {
                                ...p,
                                x: newX,
                                y: newY,
                                solvedGridX: p.column * newCellWidth,
                                solvedGridY: p.row * newCellHeight,
                                isDragging: false,
                            })
                        })
                        return
                    }

                    // Single loose piece
                    const p = clusterPieces[0]
                    const oldCenterX = p.x + prevPad + prevCellWidth / 2
                    const oldCenterY = p.y + prevPad + prevCellHeight / 2

                    const dx = oldCenterX - prevScatterCenterX
                    const dy = oldCenterY - prevScatterCenterY
                    const angle = Math.atan2(dy, dx)
                    const safePrevRadX = Math.max(1, prevRingRadiusX)
                    const safePrevRadY = Math.max(1, prevRingRadiusY)
                    const normDist = Math.hypot(
                        dx / safePrevRadX,
                        dy / safePrevRadY
                    )

                    const newCenterX =
                        newScatterCenterX +
                        Math.cos(angle) * (newRingRadiusX * normDist)
                    const newCenterY =
                        newScatterCenterY +
                        Math.sin(angle) * (newRingRadiusY * normDist)

                    let newX = newCenterX - newPad - newCellWidth / 2
                    let newY = newCenterY - newPad - newCellHeight / 2

                    const minX = 4
                    const minY = 4
                    const maxX = size.width - (newCellWidth + newPad * 2) - 4
                    const maxY = size.height - (newCellHeight + newPad * 2) - 4

                    newX = Math.max(minX, Math.min(maxX, newX))
                    newY = Math.max(minY, Math.min(maxY, newY))

                    repositionedById.set(p.id, {
                        ...p,
                        x: newX,
                        y: newY,
                        solvedGridX: p.column * newCellWidth,
                        solvedGridY: p.row * newCellHeight,
                        isDragging: false,
                    })
                })

                return currentPieces.map((p) => repositionedById.get(p.id) ?? p)
            })
        })

        prevGeometryRef.current = {
            size,
            boardWidth,
            boardHeight,
            boardLeft,
            boardTop,
            cellWidth,
            cellHeight,
            pad,
        }
    }, [
        size,
        boardWidth,
        boardHeight,
        boardLeft,
        boardTop,
        cellWidth,
        cellHeight,
        pad,
        effectiveSnapDistance,
        columns,
        rows,
    ])

    useEffect(() => {
        const previousSrc = previousImageSrcRef.current
        if (!previousSrc) {
            previousImageSrcRef.current = imageSrc
            return
        }
        if (previousSrc === imageSrc) return
        previousImageSrcRef.current = imageSrc
        startTransition(() => {
            setShowConfetti(false)
            setConfettiParticles([])
            setConfettiRunId(0)
            setIsInfoExpanded(false)
        })
        previousCompletedRef.current = false
        if (!resetPuzzleWhenImageChanges) return
        activeGridRef.current = null
        prevGeometryRef.current = null
        hasInitializedPuzzleRef.current = false
        startTransition(() => {
            setPieces(pieceBlueprint)
            setDragClusterId(null)
            setZCounter(10 + pieceBlueprint.length)
        })
    }, [imageSrc, pieceBlueprint, resetPuzzleWhenImageChanges])

    const totalPieces = rows * columns
    const hasCompleted = useMemo(
        () =>
            new Set(pieces.map((p) => p.clusterId)).size === 1 &&
            pieces.length === totalPieces,
        [pieces, totalPieces]
    )
    const connectedCount = useMemo(
        () => pieces.filter((p) => p.isConnected).length,
        [pieces]
    )
    const showGuideNow =
        (showGuide ?? showSubtleGuide ?? false) &&
        connectedCount === 0 &&
        !hasCompleted
    const guideVisibleOpacity = clamp(guideOpacity, 0, 0.06)

    const areCompatibleNeighbours = useCallback(
        (a: PieceData, b: PieceData): boolean => {
            const dr = b.row - a.row
            const dc = b.column - a.column
            if (Math.abs(dr) + Math.abs(dc) !== 1) return false
            if (dr === 0 && dc === 1)
                return (
                    a.right !== 0 &&
                    b.left !== 0 &&
                    a.right === (-b.left as EdgeValue)
                )
            if (dr === 0 && dc === -1)
                return (
                    a.left !== 0 &&
                    b.right !== 0 &&
                    a.left === (-b.right as EdgeValue)
                )
            if (dr === 1 && dc === 0)
                return (
                    a.bottom !== 0 &&
                    b.top !== 0 &&
                    a.bottom === (-b.top as EdgeValue)
                )
            if (dr === -1 && dc === 0)
                return (
                    a.top !== 0 &&
                    b.bottom !== 0 &&
                    a.top === (-b.bottom as EdgeValue)
                )
            return false
        },
        []
    )

    const getClusterPieces = useCallback(
        (pieceList: PieceData[], clusterId: string) => {
            return pieceList.filter((p) => p.clusterId === clusterId)
        },
        []
    )

    const getClusterOrigin = useCallback((clusterPieces: PieceData[]) => {
        const anchor = clusterPieces[0]
        if (!anchor) {
            return { x: 0, y: 0 }
        }
        return {
            x: anchor.x - anchor.solvedGridX,
            y: anchor.y - anchor.solvedGridY,
        }
    }, [])

    const normalizeClusterToOrigin = useCallback(
        (clusterPieces: PieceData[], originX: number, originY: number) => {
            const byId = new Map<string, PieceData>()
            clusterPieces.forEach((piece) => {
                byId.set(piece.id, {
                    ...piece,
                    x: originX + piece.solvedGridX,
                    y: originY + piece.solvedGridY,
                })
            })
            return byId
        },
        []
    )

    const normalizeAllClusters = useCallback(
        (pieceList: PieceData[]) => {
            const clusterMap = new Map<string, PieceData[]>()
            pieceList.forEach((piece) => {
                const existing = clusterMap.get(piece.clusterId) ?? []
                existing.push(piece)
                clusterMap.set(piece.clusterId, existing)
            })
            const normalizedById = new Map<string, PieceData>()
            clusterMap.forEach((clusterPieces) => {
                const origin = getClusterOrigin(clusterPieces)
                const clusterNormalized = normalizeClusterToOrigin(
                    clusterPieces,
                    origin.x,
                    origin.y
                )
                clusterNormalized.forEach((value, key) =>
                    normalizedById.set(key, value)
                )
            })
            return pieceList.map(
                (piece) => normalizedById.get(piece.id) ?? piece
            )
        }, [getClusterOrigin]
    )

    const detectClusterAttachment = useCallback(
        (pieceList: PieceData[], draggedClusterId: string) => {
            const draggedPieces = getClusterPieces(pieceList, draggedClusterId)
            const otherClusterIds = Array.from(
                new Set(
                    pieceList
                        .filter((p) => p.clusterId !== draggedClusterId)
                        .map((p) => p.clusterId)
                )
            )

            let best:
                | {
                      sourceClusterId: string
                      targetClusterId: string
                      sourcePieceId: string
                      deltaX: number
                      deltaY: number
                      score: number
                  }
                | undefined

            for (const targetClusterId of otherClusterIds) {
                const targetPieces = getClusterPieces(
                    pieceList,
                    targetClusterId
                )
                for (const sourcePiece of draggedPieces) {
                    for (const targetPiece of targetPieces) {
                        if (!sourcePiece.neighbourIds.includes(targetPiece.id))
                            continue
                        if (!areCompatibleNeighbours(sourcePiece, targetPiece))
                            continue
                        const targetOriginX =
                            targetPiece.x - targetPiece.solvedGridX
                        const targetOriginY =
                            targetPiece.y - targetPiece.solvedGridY
                        const desiredX = targetOriginX + sourcePiece.solvedGridX
                        const desiredY = targetOriginY + sourcePiece.solvedGridY
                        const deltaX = desiredX - sourcePiece.x
                        const deltaY = desiredY - sourcePiece.y
                        const score = Math.hypot(deltaX, deltaY)
                        if (score > effectiveSnapDistance) continue
                        if (!best || score < best.score) {
                            best = {
                                sourceClusterId: draggedClusterId,
                                targetClusterId,
                                sourcePieceId: sourcePiece.id,
                                deltaX,
                                deltaY,
                                score,
                            }
                        }
                    }
                }
            }

            return best
        },
        [areCompatibleNeighbours, effectiveSnapDistance, getClusterPieces]
    )

    const clearConfettiTimeouts = useCallback(() => {
        confettiTimeoutsRef.current.forEach((timeoutId) => {
            if (typeof window !== "undefined") {
                window.clearTimeout(timeoutId)
            }
        })
        confettiTimeoutsRef.current = []
    }, [])

    const clearIdleTimeouts = useCallback(() => {
        idleTimeoutsRef.current.forEach((timeoutId) => {
            if (typeof window !== "undefined") {
                window.clearTimeout(timeoutId)
            }
        })
        idleTimeoutsRef.current = []
    }, [])

    const buildConfettiParticles = useCallback(
        (runId: number) => {
            const palette = [
                "#FF6A5E",
                "#FFD54A",
                "#66D99A",
                "#6FA8F7",
                "#A78BFA",
                "#FFB082",
            ]
            const count = 64
            const widthSafe = Math.max(220, size.width)
            const heightSafe = Math.max(220, size.height)
            return Array.from({ length: count }, (_, index) => {
                const startX = Math.random() * widthSafe
                const startY = -(Math.random() * 90 + 10)
                const drift = -48 + Math.random() * 96
                return {
                    id: `confetti-${runId}-${index}`,
                    color: palette[index % palette.length],
                    width: 5 + Math.random() * 5,
                    height: 14 + Math.random() * 18,
                    startX,
                    startY,
                    endX: startX + drift,
                    endY: heightSafe + 120 + Math.random() * 60,
                    startRotate: -180 + Math.random() * 360,
                    endRotate: -720 + Math.random() * 1440,
                    duration: 1.3 + Math.random() * 0.9,
                    delay: Math.random() * 0.34,
                } satisfies ConfettiParticle
            })
        },
        [size.height, size.width]
    )

    const mergeClusters = useCallback(
        (
            pieceList: PieceData[],
            sourceClusterId: string,
            targetClusterId: string
        ) => {
            const sourcePieces = getClusterPieces(pieceList, sourceClusterId)
            const targetPieces = getClusterPieces(pieceList, targetClusterId)
            const mergedIds = new Set<string>([
                ...sourcePieces.map((p) => p.id),
                ...targetPieces.map((p) => p.id),
            ])
            return pieceList.map((piece) => {
                const inMerged = mergedIds.has(piece.id)
                if (!inMerged) return piece
                return {
                    ...piece,
                    clusterId: targetClusterId,
                    isConnected: mergedIds.size > 1,
                    isDragging: false,
                    idleResumeAt: 0,
                }
            })
        },
        [getClusterPieces]
    )

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>, piece: PieceData) => {
            if (isStatic || hasCompleted) return
            event.preventDefault()
            const clusterId = piece.clusterId
            const clusterPieceIds = new Set(
                pieces.filter((p) => p.clusterId === clusterId).map((p) => p.id)
            )
            const originById: Record<string, { x: number; y: number }> = {}
            pieces.forEach((p) => {
                if (clusterPieceIds.has(p.id))
                    originById[p.id] = { x: p.x, y: p.y }
            })
            dragRef.current = {
                pointerId: event.pointerId,
                clusterId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                originById,
            }
            startTransition(() => {
                setDragClusterId(clusterId)
                setZCounter((prev) => {
                    const next = prev + 1
                    setPieces((current) =>
                        current.map((p) =>
                            p.clusterId === clusterId
                                ? {
                                      ...p,
                                      zIndex: next,
                                      isDragging: true,
                                      idleResumeAt: Number.POSITIVE_INFINITY,
                                  }
                                : { ...p, isDragging: false }
                        )
                    )
                    return next
                })
            })
        },
        [hasCompleted, isStatic, pieces, normalizeClusterToOrigin]
    )

    useEffect(() => {
        if (typeof window === "undefined") return
        const onPointerMove = (event: PointerEvent) => {
            const drag = dragRef.current
            if (!drag || event.pointerId !== drag.pointerId) return
            const dx = event.clientX - drag.startClientX
            const dy = event.clientY - drag.startClientY
            startTransition(() => {
                setPieces((current) =>
                    current.map((piece) => {
                        if (piece.clusterId !== drag.clusterId) return piece
                        const origin = drag.originById[piece.id]
                        if (!origin) return piece
                        return { ...piece, x: origin.x + dx, y: origin.y + dy }
                    })
                )
            })
        }

        const onPointerUp = (event: PointerEvent) => {
            const drag = dragRef.current
            if (!drag || event.pointerId !== drag.pointerId) return
            dragRef.current = null
            const releasedIds = Object.keys(drag.originById)
            const resumeAt = Date.now() + 250
            // Commit the final snap synchronously. A low-priority transition here
            // can briefly leave the individual pieces visually separated after
            // completion, before Framer finishes reconciling their positions.
            setPieces((current) => {
                const normalizedCurrent = normalizeAllClusters(current)
                const attach = detectClusterAttachment(
                    normalizedCurrent,
                    drag.clusterId
                )
                let nextPieces = normalizedCurrent
                if (attach) {
                    nextPieces = normalizedCurrent.map((piece) => {
                        if (piece.clusterId !== attach.sourceClusterId)
                            return piece
                        return {
                            ...piece,
                            x: piece.x + attach.deltaX,
                            y: piece.y + attach.deltaY,
                            isDragging: false,
                        }
                    })
                    nextPieces = mergeClusters(
                        nextPieces,
                        attach.sourceClusterId,
                        attach.targetClusterId
                    )
                    const mergedCluster = getClusterPieces(
                        nextPieces,
                        attach.targetClusterId
                    )
                    const mergedOrigin = getClusterOrigin(mergedCluster)
                    const normalizedMerged = normalizeClusterToOrigin(
                        mergedCluster,
                        mergedOrigin.x,
                        mergedOrigin.y
                    )
                    nextPieces = nextPieces.map(
                        (piece) => normalizedMerged.get(piece.id) ?? piece
                    )
                } else {
                    // Check if dragged cluster was placed near its solved board target
                    const draggedPieces = getClusterPieces(
                        normalizedCurrent,
                        drag.clusterId
                    )
                    let didSnapToBoard = false
                    if (draggedPieces.length > 0) {
                        const boardOriginX = boardLeft - pad
                        const boardOriginY = boardTop - pad
                        const targetPiece = draggedPieces[0]
                        const targetSolvedX = boardOriginX + targetPiece.solvedGridX
                        const targetSolvedY = boardOriginY + targetPiece.solvedGridY
                        const deltaX = targetSolvedX - targetPiece.x
                        const deltaY = targetSolvedY - targetPiece.y
                        const score = Math.hypot(deltaX, deltaY)

                        if (score <= effectiveSnapDistance) {
                            didSnapToBoard = true
                            nextPieces = normalizedCurrent.map((piece) => {
                                if (piece.clusterId !== drag.clusterId)
                                    return piece
                                return {
                                    ...piece,
                                    x: boardOriginX + piece.solvedGridX,
                                    y: boardOriginY + piece.solvedGridY,
                                    isDragging: false,
                                    idleResumeAt: resumeAt,
                                }
                            })

                            // Check if any other clusters also on the board are adjacent and should merge
                            const otherClusterIds = Array.from(
                                new Set(
                                    nextPieces
                                        .filter((p) => p.clusterId !== drag.clusterId)
                                        .map((p) => p.clusterId)
                                )
                            )
                            for (const otherId of otherClusterIds) {
                                const otherPieces = getClusterPieces(nextPieces, otherId)
                                const isOtherOnBoard = otherPieces.every((op) => {
                                    const ox = boardOriginX + op.solvedGridX
                                    const oy = boardOriginY + op.solvedGridY
                                    return Math.hypot(op.x - ox, op.y - oy) < 2
                                })
                                if (isOtherOnBoard) {
                                    const canJoin = draggedPieces.some((dp) =>
                                        otherPieces.some((op) =>
                                            dp.neighbourIds.includes(op.id) &&
                                            areCompatibleNeighbours(dp, op)
                                        )
                                    )
                                    if (canJoin) {
                                        nextPieces = mergeClusters(
                                            nextPieces,
                                            drag.clusterId,
                                            otherId
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (!didSnapToBoard) {
                        nextPieces = normalizedCurrent.map((piece) =>
                            piece.clusterId === drag.clusterId
                                ? {
                                      ...piece,
                                      isDragging: false,
                                      idleResumeAt: resumeAt,
                                  }
                                : piece
                        )
                    }
                }

                const uniqueClusterCount = new Set(
                    nextPieces.map((p) => p.clusterId)
                ).size
                if (uniqueClusterCount === 1) {
                    const centeredOriginX = (size.width - boardWidth) / 2 - pad
                    const centeredOriginY =
                        (size.height - boardHeight) / 2 - pad
                    return nextPieces.map((p) => ({
                        ...p,
                        x: centeredOriginX + p.solvedGridX,
                        y: centeredOriginY + p.solvedGridY,
                        isConnected: true,
                        isDragging: false,
                    }))
                }
                return nextPieces
            })
            setDragClusterId(null)
            if (typeof window !== "undefined") {
                const timeoutId = window.setTimeout(() => {
                    startTransition(() => {
                        setPieces((current) =>
                            current.map((piece) =>
                                releasedIds.includes(piece.id)
                                    ? { ...piece, idleResumeAt: 0 }
                                    : piece
                            )
                        )
                    })
                }, 280)
                idleTimeoutsRef.current.push(timeoutId)
            }
        }

        window.addEventListener("pointermove", onPointerMove)
        window.addEventListener("pointerup", onPointerUp)
        window.addEventListener("pointercancel", onPointerUp)
        return () => {
            window.removeEventListener("pointermove", onPointerMove)
            window.removeEventListener("pointerup", onPointerUp)
            window.removeEventListener("pointercancel", onPointerUp)
        }
    }, [
        boardHeight,
        boardWidth,
        detectClusterAttachment,
        getClusterOrigin,
        getClusterPieces,
        mergeClusters,
        normalizeAllClusters,
        normalizeClusterToOrigin,
        pad,
        size.height,
        size.width,
    ])

    // Do not replace the puzzle at the exact frame the final piece snaps in.
    // First let the last cluster glide into the solved grid, then gently dissolve
    // the seams into a single image. This avoids the abrupt "pop" caused by
    // crossfading while the pieces are still moving.
    useEffect(() => {
        if (!hasCompleted) {
            setFinalRevealActive(false)
            return
        }

        if (isStatic || typeof window === "undefined") {
            setFinalRevealActive(true)
            return
        }

        setFinalRevealActive(false)
        const timeoutId = window.setTimeout(() => {
            setFinalRevealActive(true)
        }, 460)

        return () => window.clearTimeout(timeoutId)
    }, [hasCompleted, isStatic])

    // Solved success animation: When the puzzle completes, celebration confetti plays.
    // Right after the confetti effect finishes, trigger the horizontal choreography
    // (artwork slides off-screen right, description card slides in from left to center).
    useEffect(() => {
        if (!finalRevealActive) {
            setIsInfoExpanded(false)
            return
        }

        // Trigger after celebration confetti finishes (confetti runs 2600ms)
        const confettiDuration = celebrationConfetti && !isStatic ? 2600 : 600
        const timeoutId = window.setTimeout(() => {
            setIsInfoExpanded(true)
        }, confettiDuration)

        return () => window.clearTimeout(timeoutId)
    }, [finalRevealActive, celebrationConfetti, isStatic])

    // Let the host frame know when the puzzle becomes clickable (solved) or
    // goes back to unsolved (reset / new image), so surrounding UI can swap
    // hints or chrome accordingly.
    useEffect(() => {
        onSolvedChange?.(finalRevealActive)
    }, [finalRevealActive, onSolvedChange])

    useEffect(() => {
        return () => {
            clearConfettiTimeouts()
            clearIdleTimeouts()
        }
    }, [clearConfettiTimeouts, clearIdleTimeouts])

    // The final merge already positions every piece using one shared solved-grid
    // origin. Do not re-center it in a later effect: that second position update
    // makes each piece animate independently and creates a visible "split then join".

    useEffect(() => {
        const wasCompleted = previousCompletedRef.current
        if (
            !wasCompleted &&
            finalRevealActive &&
            celebrationConfetti &&
            !isStatic
        ) {
            clearConfettiTimeouts()
            const nextRunId = confettiRunId + 1
            const particles = buildConfettiParticles(nextRunId)
            startTransition(() => {
                setConfettiRunId(nextRunId)
                setConfettiParticles(particles)
                setShowConfetti(true)
            })
            if (typeof window !== "undefined") {
                const timeoutId = window.setTimeout(() => {
                    startTransition(() => {
                        setShowConfetti(false)
                        setConfettiParticles([])
                    })
                }, 2600)
                confettiTimeoutsRef.current.push(timeoutId)
            }
        }
        previousCompletedRef.current = finalRevealActive
    }, [
        buildConfettiParticles,
        celebrationConfetti,
        clearConfettiTimeouts,
        confettiRunId,
        finalRevealActive,
        isStatic,
    ])

    const handleImageClick = useCallback(() => {
        if (!finalRevealActive) return
        setIsInfoExpanded((prev) => !prev)
    }, [finalRevealActive])

    return (
        <div
            ref={containerRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                // Keep the surrounding Framer frame square. Corner Radius is applied
                // only to the puzzle/image artwork below.
                borderRadius: 0,
                background: backgroundColor,
                touchAction: "none",
                fontFamily: FONT_STACK,
                ...style,
            }}
        >
            {showGuideNow && (
                <div
                    aria-hidden
                    style={{
                        position: "absolute",
                        left: boardLeft,
                        top: boardTop,
                        width: boardWidth,
                        height: boardHeight,
                        opacity: guideVisibleOpacity,
                        pointerEvents: "none",
                        borderRadius: puzzleCornerRadius,
                        overflow: "hidden",
                    }}
                >
                    <svg
                        width={boardWidth}
                        height={boardHeight}
                        viewBox={`0 0 ${boardWidth} ${boardHeight}`}
                        style={{ position: "absolute", left: 0, top: 0 }}
                    >
                        <image
                            href={imageSrc}
                            x={imagePlacement.x}
                            y={imagePlacement.y}
                            width={imagePlacement.width}
                            height={imagePlacement.height}
                            preserveAspectRatio="none"
                            opacity={0.95}
                        />
                        {pieces.map((piece) => {
                            const path = jigsawPath(
                                piece.column * cellWidth,
                                piece.row * cellHeight,
                                cellWidth,
                                cellHeight,
                                {
                                    top: piece.top,
                                    right: piece.right,
                                    bottom: piece.bottom,
                                    left: piece.left,
                                },
                                pieceCornerRadius,
                                connectorDepth
                            )
                            return (
                                <path
                                    key={`board-${piece.id}`}
                                    d={path}
                                    fill="none"
                                    stroke={outlineColor}
                                    strokeWidth={outlineWidth}
                                />
                            )
                        })}
                    </svg>
                </div>
            )}

            <AnimatePresence>
                {showConfetti &&
                    celebrationConfetti &&
                    confettiParticles.length > 0 && (
                        <ConfettiRain
                            particles={confettiParticles}
                            runId={confettiRunId}
                        />
                    )}
            </AnimatePresence>

            {/* Everything that makes up the puzzle - the loose/solved pieces and the
                completed image - lives inside this single wrapper so the horizontal
                exit animation moves them together as one rigid group off-screen to the right. */}
            <motion.div
                initial={false}
                animate={{
                    x: isInfoExpanded ? exitArtworkX : 0,
                    y: 0,
                }}
                transition={{
                    duration: 0.85,
                    ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                    position: "absolute",
                    inset: 0,
                }}
            >
                {/* Keep the finished image mounted from the start so the browser can
                    decode and paint it before the puzzle completes. On completion it
                    waits until the final snap settles, then fades over the solved pieces
                    while only the seam strokes dissolve away. Once it has slid into
                    place it also becomes clickable, opening the horizontal info strip
                    below it. */}
                <motion.div
                    initial={false}
                    animate={{
                        opacity: finalRevealActive ? 1 : 0,
                        scale: 1,
                    }}
                    transition={{
                        opacity: {
                            duration: finalRevealActive ? 0.82 : 0.18,
                            ease: [0.22, 1, 0.36, 1],
                        },
                        scale: {
                            duration: finalRevealActive ? 0.82 : 0.18,
                            ease: [0.22, 1, 0.36, 1],
                        },
                    }}
                    onClick={handleImageClick}
                    aria-hidden={!hasCompleted}
                    aria-label={hasCompleted ? "Completed puzzle" : undefined}
                    role={finalRevealActive ? "button" : undefined}
                    style={{
                        position: "absolute",
                        left: boardLeft,
                        top: boardTop,
                        width: boardWidth,
                        height: boardHeight,
                        // Match the loose puzzle pieces exactly: this radius belongs to the
                        // artwork, not the surrounding component frame.
                        borderRadius: puzzleCornerRadius,
                        overflow: "hidden",
                        pointerEvents: finalRevealActive ? "auto" : "none",
                        cursor: finalRevealActive ? "pointer" : "default",
                        // Pieces receive a larger zIndex every time they are picked up.
                        // Keep the completed-image layer above every possible piece.
                        zIndex: 9000,
                        willChange: "opacity, transform",
                        transformOrigin: "center center",
                        transform: "translateZ(0)",
                    }}
                >
                    <svg
                        width={boardWidth}
                        height={boardHeight}
                        viewBox={`0 0 ${boardWidth} ${boardHeight}`}
                        style={{ display: "block", overflow: "hidden" }}
                    >
                        <defs>
                            {/* SVG clipping is deliberate here: CSS borderRadius alone can be
                    bypassed by the SVG paint layer in Framer's canvas renderer. */}
                            <clipPath id={completedImageClipId}>
                                <rect
                                    x="0"
                                    y="0"
                                    width={boardWidth}
                                    height={boardHeight}
                                    rx={puzzleCornerRadius}
                                    ry={puzzleCornerRadius}
                                />
                            </clipPath>
                        </defs>
                        <g clipPath={`url(#${completedImageClipId})`}>
                            <image
                                href={imageSrc}
                                x={imagePlacement.x}
                                y={imagePlacement.y}
                                width={imagePlacement.width}
                                height={imagePlacement.height}
                                preserveAspectRatio="none"
                            />
                        </g>
                    </svg>
                </motion.div>

                {pieces.map((piece) => {
                    const localPath = jigsawPath(
                        pad,
                        pad,
                        cellWidth,
                        cellHeight,
                        {
                            top: piece.top,
                            right: piece.right,
                            bottom: piece.bottom,
                            left: piece.left,
                        },
                        pieceCornerRadius,
                        connectorDepth
                    )
                    const clipId = `clip-piece-${piece.id.replace("-", "_")}`
                    const isDragging =
                        piece.isDragging || dragClusterId === piece.clusterId
                    const clusterSize = pieces.filter(
                        (p) => p.clusterId === piece.clusterId
                    ).length
                    const isLooseSingle =
                        clusterSize === 1 && !piece.isConnected
                    const canIdle =
                        idleMotion &&
                        !hasCompleted &&
                        !isDragging &&
                        isLooseSingle &&
                        piece.idleResumeAt <= Date.now()
                    const baseSeed = piece.row * 17 + piece.column * 29 + 7
                    const xAmp =
                        idleMotionIntensity === "Medium"
                            ? 5 + (baseSeed % 3)
                            : 2 + (baseSeed % 3)
                    const yAmp =
                        idleMotionIntensity === "Medium"
                            ? 8 + (baseSeed % 3)
                            : 4 + (baseSeed % 3)
                    const rAmp =
                        idleMotionIntensity === "Medium"
                            ? 0.9 + (baseSeed % 4) * 0.1
                            : 0.45 + (baseSeed % 4) * 0.08
                    const idleDuration = 4 + ((baseSeed * 0.13) % 3)
                    const idleDelay = ((baseSeed * 0.17) % 1.2) - 0.6
                    const idleDirection = baseSeed % 2 === 0 ? 1 : -1
                    const currentShadow = isDragging
                        ? `0 ${Math.max(5, effectiveShadow * 0.45)}px ${Math.max(8, effectiveShadow * 1.05)}px rgba(66, 49, 28, 0.2)`
                        : "none"

                    return (
                        <motion.div
                            key={piece.id}
                            onPointerDown={(event) =>
                                handlePointerDown(event, piece)
                            }
                            animate={{
                                x: piece.x,
                                y: piece.y,
                                // Keep the actual pieces fully visible. Only their seams dissolve
                                // after the final snap settles, so the picture appears to become
                                // whole rather than being swapped out.
                                opacity: piece.opacity,
                            }}
                            transition={
                                hasCompleted
                                    ? {
                                          x: {
                                              type: "spring",
                                              stiffness: 260,
                                              damping: 30,
                                              mass: 0.72,
                                          },
                                          y: {
                                              type: "spring",
                                              stiffness: 260,
                                              damping: 30,
                                              mass: 0.72,
                                          },
                                          opacity: { duration: 0.12 },
                                      }
                                    : {
                                          type: "spring",
                                          stiffness: isDragging ? 540 : 680,
                                          damping: isDragging ? 44 : 38,
                                          mass: 0.52,
                                      }
                            }
                            style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                width: cellWidth + pad * 2,
                                height: cellHeight + pad * 2,
                                zIndex: piece.zIndex,
                                cursor:
                                    isStatic || hasCompleted
                                        ? "default"
                                        : isDragging
                                          ? "grabbing"
                                          : "grab",
                                filter: `drop-shadow(${currentShadow})`,
                                willChange: "transform",
                                touchAction: "none",
                            }}
                        >
                            <motion.div
                                animate={
                                    canIdle
                                        ? {
                                              x: [0, xAmp * idleDirection, 0],
                                              y: [0, -yAmp, 0],
                                              rotate: [
                                                  0,
                                                  rAmp * idleDirection,
                                                  0,
                                              ],
                                          }
                                        : { x: 0, y: 0, rotate: 0 }
                                }
                                transition={
                                    canIdle
                                        ? {
                                              duration: idleDuration,
                                              ease: "easeInOut",
                                              repeat: Infinity,
                                              repeatType: "mirror",
                                              delay: idleDelay,
                                          }
                                        : hasCompleted
                                          ? { duration: 0 }
                                          : { duration: 0.2, ease: "easeOut" }
                                }
                                style={{ width: "100%", height: "100%" }}
                            >
                                <svg
                                    width={cellWidth + pad * 2}
                                    height={cellHeight + pad * 2}
                                    viewBox={`0 0 ${cellWidth + pad * 2} ${cellHeight + pad * 2}`}
                                    style={{
                                        display: "block",
                                        overflow: "visible",
                                        transformOrigin: `${(cellWidth + pad * 2) / 2}px ${(cellHeight + pad * 2) / 2}px`,
                                    }}
                                >
                                    <motion.g
                                        animate={
                                            isDragging
                                                ? {
                                                      scale: draggedPieceScale,
                                                      y: 0,
                                                      rotate: 0,
                                                  }
                                                : { scale: 1, y: 0, rotate: 0 }
                                        }
                                        transition={
                                            isDragging
                                                ? {
                                                      type: "spring",
                                                      stiffness: 460,
                                                      damping: 32,
                                                      mass: 0.5,
                                                  }
                                                : hasCompleted
                                                  ? { duration: 0 }
                                                  : { duration: 0.2 }
                                        }
                                        style={{ transformOrigin: "center" }}
                                    >
                                        <defs>
                                            <clipPath id={clipId}>
                                                <path d={localPath} />
                                            </clipPath>
                                        </defs>
                                        <image
                                            href={imageSrc}
                                            x={
                                                pad +
                                                imagePlacement.x -
                                                piece.column * cellWidth
                                            }
                                            y={
                                                pad +
                                                imagePlacement.y -
                                                piece.row * cellHeight
                                            }
                                            width={imagePlacement.width}
                                            height={imagePlacement.height}
                                            preserveAspectRatio="none"
                                            clipPath={`url(#${clipId})`}
                                        />
                                        <motion.path
                                            d={localPath}
                                            fill="none"
                                            stroke={outlineColor}
                                            strokeWidth={outlineWidth}
                                            initial={false}
                                            animate={{
                                                opacity: finalRevealActive
                                                    ? 0
                                                    : 1,
                                            }}
                                            transition={{
                                                duration: finalRevealActive
                                                    ? 0.82
                                                    : 0.16,
                                                ease: [0.22, 1, 0.36, 1],
                                            }}
                                        />
                                    </motion.g>
                                </svg>
                            </motion.div>
                        </motion.div>
                    )
                })}
            </motion.div>

            {/* Info panel: enters from off-screen left and anchors perfectly in the
                center of the screen, while the artwork exits completely off-screen to the right.
                Tap the card or artwork again to toggle back and forth. */}
            <motion.div
                initial={false}
                animate={{
                    opacity: isInfoExpanded ? 1 : 0,
                    x: isInfoExpanded ? 0 : enterCardStartX,
                }}
                transition={{
                    x: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
                    opacity: {
                        duration: isInfoExpanded ? 0.45 : 0.25,
                        ease: [0.22, 1, 0.36, 1],
                        delay: isInfoExpanded ? 0.05 : 0,
                    },
                }}
                aria-hidden={!isInfoExpanded}
                    onClick={handleImageClick}
                style={{
                    position: "absolute",
                    left: infoPanelLeft,
                    top: infoPanelTop,
                    width: cardWidth,
                    height: cardHeight,
                    borderRadius: infoPanelRadius,
                    background: infoBackgroundColor,
                    boxShadow: "0 14px 38px rgba(40, 30, 15, 0.16)",
                    pointerEvents: isInfoExpanded ? "auto" : "none",
                    cursor: isInfoExpanded ? "pointer" : "default",
                    overflowY: "auto",
                    overflowX: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "24px 28px",
                    boxSizing: "border-box",
                    zIndex: 9500,
                }}
            >
                <div
                    ref={infoContentRef}
                    style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14,
                        margin: "auto 0",
                    }}
                >
                    {infoTitle && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                width: "100%",
                                flexShrink: 0,
                            }}
                        >
                            <div
                                style={{
                                    color: infoTitleColor,
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    letterSpacing: "0.2em",
                                    textTransform: "uppercase",
                                    lineHeight: 1.2,
                                    flexShrink: 0,
                                }}
                            >
                                {infoTitle}
                            </div>
                            <div
                                aria-hidden
                                style={{
                                    flex: 1,
                                    height: 1,
                                    background: infoTextColor,
                                    opacity: 0.18,
                                }}
                            />
                        </div>
                    )}
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            width: "100%",
                        }}
                    >
                        {infoItems.map((item, index) => (
                            <motion.p
                                key={index}
                                initial={false}
                                animate={
                                    isInfoExpanded
                                        ? { opacity: 1, y: 0 }
                                        : { opacity: 0, y: 10 }
                                }
                                transition={{
                                    duration: 0.45,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: isInfoExpanded
                                        ? 0.08 + index * 0.06
                                        : 0,
                                }}
                                style={{
                                    margin: 0,
                                    color: infoTextColor,
                                    fontSize: 12,
                                    lineHeight: 1.62,
                                    letterSpacing: "0.01em",
                                }}
                            >
                                {item.title && (
                                    <span
                                        style={{
                                            color: infoTitleColor,
                                            fontSize: 10.5,
                                            fontWeight: 700,
                                            letterSpacing: "0.14em",
                                            textTransform: "uppercase",
                                            marginRight: 6,
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {item.title} —
                                    </span>
                                )}
                                {item.text}
                            </motion.p>
                        ))}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

PuzzleGame.displayName = "Puzzle Reveal Card"

addPropertyControls(PuzzleGame, {
    image: {
        type: ControlType.ResponsiveImage,
        title: "Image",
    },
    imageFit: {
        type: ControlType.Enum,
        title: "Image Fit",
        defaultValue: "cover",
        options: ["cover", "contain", "fill"],
        optionTitles: ["Cover", "Contain", "Fill"],
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background Color",
        defaultValue: "#EFE2CF",
    },
    puzzleSize: {
        type: ControlType.Number,
        title: "Puzzle Size",
        defaultValue: 66,
        min: 30,
        max: 95,
        unit: "%",
        step: 1,
    },
    outlineColor: {
        type: ControlType.Color,
        title: "Stroke Color",
        defaultValue: "#6D6963",
    },
    outlineWidth: {
        type: ControlType.Number,
        title: "Stroke Width",
        defaultValue: 1.5,
        min: 0.5,
        max: 4,
        step: 0.5,
    },
    cornerRadius: {
        type: ControlType.Number,
        title: "Corner Radius",
        defaultValue: 0,
        description: "Rounds the puzzle pieces and completed image.",
        min: 0,
        max: 20,
        step: 1,
    },
    celebrationConfetti: {
        type: ControlType.Boolean,
        title: "Celebration Confetti",
        defaultValue: true,
    },
    idleMotion: {
        type: ControlType.Boolean,
        title: "Idle Motion",
        defaultValue: true,
    },
    liftAmount: {
        type: ControlType.Number,
        title: "Lift Amount",
        description:
            "How far the puzzle rises upward when the info strip opens below it.",
        defaultValue: 110,
        min: 0,
        max: 240,
        step: 1,
        unit: "px",
    },
    minSideMargin: {
        type: ControlType.Number,
        title: "Min Side Margin",
        description:
            "Smallest gap kept from the frame's edges when the horizontal info strip opens below the image.",
        defaultValue: 16,
        min: 0,
        max: 120,
        step: 1,
        unit: "px",
    },
    infoPanelWidth: {
        type: ControlType.Number,
        title: "Info Panel Width",
        description:
            "Width of the info panel that opens below the image. It never grows wider than the image itself.",
        defaultValue: 420,
        min: 220,
        max: 640,
        step: 4,
        unit: "px",
    },
    infoTitle: {
        type: ControlType.String,
        title: "Info Title",
        defaultValue: "Vighnakarta to Vighnaharta",
    },
    infoItems: {
        type: ControlType.Array,
        title: "Info Items",
        description:
            "Each item becomes one paragraph; its optional title is used as a small lead-in at the start of the paragraph.",
        control: {
            type: ControlType.Object,
            controls: {
                title: {
                    type: ControlType.String,
                    title: "Title",
                    defaultValue: "",
                },
                text: {
                    type: ControlType.String,
                    title: "Text",
                    defaultValue: "",
                    displayTextArea: true,
                },
            },
        },
        defaultValue: defaultInfoItems,
        maxCount: 8,
    },
    infoGap: {
        type: ControlType.Number,
        title: "Info Gap",
        description: "Vertical space between the image and the info strip.",
        defaultValue: 20,
        min: 0,
        max: 80,
        step: 1,
        unit: "px",
    },
    infoBackgroundColor: {
        type: ControlType.Color,
        title: "Info Background",
        defaultValue: "#FFFFFF",
    },
    infoTitleColor: {
        type: ControlType.Color,
        title: "Info Title Color",
        defaultValue: "#2B2620",
    },
    infoTextColor: {
        type: ControlType.Color,
        title: "Info Text Color",
        defaultValue: "#6D6963",
    },
    infoPanelRadius: {
        type: ControlType.Number,
        title: "Info Corner Radius",
        defaultValue: 12,
        min: 0,
        max: 40,
        step: 1,
    },
    infoItemStiffness: {
        type: ControlType.Number,
        title: "Item Stiffness",
        description: "Spring stiffness of each info item entering the row.",
        defaultValue: 220,
        min: 60,
        max: 500,
        step: 5,
    },
    infoItemDamping: {
        type: ControlType.Number,
        title: "Item Damping",
        description: "Spring damping of each info item entering the row.",
        defaultValue: 24,
        min: 8,
        max: 60,
        step: 1,
    },
})

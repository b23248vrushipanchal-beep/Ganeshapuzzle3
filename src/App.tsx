import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import PuzzleGame from "./components/PuzzleGame"
import QREntrance from "./components/QREntrance"
import { QrCode, Lock } from "lucide-react"

interface Artwork {
    src: string
    title: string
    year: string
    infoTitle?: string
    infoItems: { title?: string; text: string }[]
}

const ARTWORKS: Artwork[] = [
    {
        src: "/art/ganesha.jpg",
        title: "Bal Ganesha",
        year: "2026",
        infoTitle: "Mushak ji",
        infoItems: [
            {
                text: "Gajamukhasura, an asura performed intense tapasya to please Lord Shiva. Pleased with him Shiv ji, granted him a boon that made him invincible against all weapons. No god, human, or celestial weapon could kill him.",
            },
            {
                text: "Blinded by power, the demon grew arrogant and began terrorizing the universe. The gods approached Lord Ganesha.",
            },
            {
                text: "During the fight the demon realized Ganesha's power. Seeking a way to escape, the demon turned himself into a giant mouse. Ganesha quickly caught the giant mouse and mounted him. The demon’s arrogance shattered. He begged for mercy and offered his total submission. Ganesha ensured that the demon's power was channeled into divine service forever. Making him his vahan forever",
            },
        ],
    },

]

export default function App() {
    const artwork = ARTWORKS[0]

    // Determine initial unlock state from URL search params or hash (e.g., when scanned with phone)
    const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
        if (typeof window === "undefined") return false
        const params = new URLSearchParams(window.location.search)
        return (
            params.get("play") === "true" ||
            params.get("access") === "granted" ||
            window.location.hash === "#puzzle"
        )
    })

    // Listen to browser navigation changes
    useEffect(() => {
        const handlePopState = () => {
            const params = new URLSearchParams(window.location.search)
            setIsUnlocked(
                params.get("play") === "true" ||
                params.get("access") === "granted" ||
                window.location.hash === "#puzzle"
            )
        }

        window.addEventListener("popstate", handlePopState)
        window.addEventListener("hashchange", handlePopState)
        return () => {
            window.removeEventListener("popstate", handlePopState)
            window.removeEventListener("hashchange", handlePopState)
        }
    }, [])

    // Track device/screen orientation (upright vs sideways)
    const [isLandscape, setIsLandscape] = useState<boolean>(() => {
        if (typeof window === "undefined") return false
        return window.innerWidth > window.innerHeight
    })

    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight)
        }
        window.addEventListener("resize", handleResize)
        window.addEventListener("orientationchange", handleResize)
        return () => {
            window.removeEventListener("resize", handleResize)
            window.removeEventListener("orientationchange", handleResize)
        }
    }, [])

    const handleUnlock = () => {
        const url = new URL(window.location.href)
        url.searchParams.set("play", "true")
        url.hash = "puzzle"
        window.history.pushState({}, "", url.toString())
        setIsUnlocked(true)
    }

    const handleLock = () => {
        const url = new URL(window.location.href)
        url.searchParams.delete("play")
        url.searchParams.delete("access")
        url.hash = ""
        window.history.pushState({}, "", url.pathname)
        setIsUnlocked(false)
    }

    return (
        <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-paper font-sans text-ink">
            {/* Film grain texture */}
            <div aria-hidden className="grain-overlay" />

            {/* Ambient wash behind device */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(60% 50% at 50% 45%, rgba(180,85,45,0.10), transparent 70%)",
                }}
            />

            <AnimatePresence mode="wait">
                {!isUnlocked ? (
                    <motion.div
                        key="gate"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-10 flex h-full w-full items-center justify-center overflow-auto"
                    >
                        <QREntrance onUnlock={handleUnlock} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="puzzle-stage"
                        initial={{ opacity: 0, y: 26, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.985 }}
                        transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
                        className="relative shrink-0 rounded-[34px] bg-[#221d16] p-[9px] shadow-[0_60px_120px_-50px_rgba(43,38,32,0.55),0_24px_48px_-28px_rgba(43,38,32,0.35)] ring-1 ring-ink/20"
                        style={
                            isLandscape
                                ? {
                                      height: "min(calc(100dvh - 32px), 880px)",
                                      width: "min(calc(100vw - 32px), calc(min(calc(100dvh - 32px), 880px) * (16 / 9)))",
                                      aspectRatio: "16 / 9",
                                  }
                                : {
                                      height: "min(calc(100dvh - 32px), 880px)",
                                      width: "min(calc(100vw - 32px), calc(min(calc(100dvh - 32px), 880px) * (9 / 16)))",
                                      aspectRatio: "9 / 16",
                                  }
                        }
                    >
                        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[26px] bg-paper">
                            {/* Floating QR Gate Return Pill */}
                            <div className="absolute top-4 right-4 z-40">
                                <button
                                    onClick={handleLock}
                                    type="button"
                                    className="group flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper/90 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur-sm hover:border-[#b4552d]/40 hover:bg-paper active:scale-95 transition cursor-pointer"
                                    title="Return to QR Entrance Gate"
                                >
                                    <QrCode className="h-3.5 w-3.5 text-[#b4552d]" />
                                    <span className="font-serif">QR Pass</span>
                                    <Lock className="h-3 w-3 text-muted group-hover:text-ink transition" />
                                </button>
                            </div>

                            {/* ── puzzle stage ────────────────────────────────── */}
                            <main className="relative flex h-full w-full min-h-0 flex-1 flex-col p-2.5">
                                <div className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] border border-ink/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                                    <PuzzleGame
                                        image={artwork.src}
                                        puzzleSize={74}
                                        orientation={isLandscape ? "horizontal" : "vertical"}
                                        backgroundColor="#EFE2CF"
                                        outlineColor="#6D6963"
                                        outlineWidth={1.5}
                                        cornerRadius={2}
                                        showGuide
                                        guideOpacity={0.06}
                                        celebrationConfetti
                                        idleMotion
                                        infoTitle={artwork.infoTitle || "Mushak ji"}
                                        infoItems={artwork.infoItems}
                                        infoPanelWidth={420}
                                        infoPanelHeight={500}
                                        infoGap={16}
                                        liftAmount={96}
                                        minSideMargin={14}
                                    />
                                </div>
                            </main>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

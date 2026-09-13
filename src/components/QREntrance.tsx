import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import QRCodeCard from "./QRCodeCard"
import QRScannerView from "./QRScannerView"
import { QrCode, Camera, ShieldCheck } from "lucide-react"

interface QREntranceProps {
    onUnlock: () => void
}

export default function QREntrance({ onUnlock }: QREntranceProps) {
    const [viewMode, setViewMode] = useState<"pass" | "scanner">("pass")
    const [isVerifying, setIsVerifying] = useState(false)

    // Construct the live URL that will directly unlock the puzzle when scanned with an external phone
    const unlockUrl = useMemo(() => {
        if (typeof window === "undefined") return "https://atelier-puzzle.local/?play=true"
        const url = new URL(window.location.href)
        url.searchParams.set("play", "true")
        url.hash = "puzzle"
        return url.toString()
    }, [])

    const handleSuccessfulScan = (_codeText: string) => {
        setIsVerifying(true)
        setTimeout(() => {
            onUnlock()
        }, 800)
    }

    const handleSimulateScan = () => {
        setIsVerifying(true)
        setTimeout(() => {
            onUnlock()
        }, 900)
    }

    return (
        <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-y-auto px-4 py-8 font-sans text-[#2b2620]">
            {/* Ambient Background Radial */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                    background:
                        "radial-gradient(55% 45% at 50% 50%, rgba(180,85,45,0.14), transparent 75%)",
                }}
            />

            {/* Verification Fullscreen Transition Flash */}
            <AnimatePresence>
                {isVerifying && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#221d16]/95 backdrop-blur-md text-[#f4ecdd]"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="flex flex-col items-center text-center p-6"
                        >
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#b4552d] text-[#f4ecdd] shadow-[0_0_50px_rgba(180,85,45,0.5)]">
                                <ShieldCheck className="h-10 w-10" />
                            </div>
                            <h2 className="mt-6 font-serif text-2xl font-bold tracking-tight">
                                Access Granted
                            </h2>
                            <p className="mt-2 text-sm text-[#efe2cf]/80 max-w-sm">
                                Verified exhibition ticket. Entering Atelier Nº 12...
                            </p>
                            <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-[#efe2cf]/20">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 0.8, ease: "easeInOut" }}
                                    className="h-full bg-[#b4552d]"
                                />
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Center Content Container */}
            <div className="flex w-full max-w-lg flex-col items-center">
                {/* Brand Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-6 text-center"
                >
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#2b2620]/15 bg-[#efe2cf]/90 px-3.5 py-1 text-xs font-semibold tracking-widest uppercase text-[#b4552d] shadow-xs">
                        <span>Gallery Entry Gate</span>
                    </div>

                    <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl text-[#2b2620]">
                        Atelier Nº 12
                    </h1>

                    <p className="mt-2 text-xs sm:text-sm text-[#6d6963] max-w-md mx-auto leading-relaxed">
                        Scan the official exhibition pass with your mobile device or use the live camera scanner to unlock the interactive puzzle gallery.
                    </p>

                    {/* Mode Navigation Tabs */}
                    <div className="mt-5 inline-flex items-center rounded-full border border-[#2b2620]/15 bg-[#efe2cf] p-1 shadow-inner">
                        <button
                            type="button"
                            onClick={() => setViewMode("pass")}
                            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition cursor-pointer ${
                                viewMode === "pass"
                                    ? "bg-[#2b2620] text-[#f4ecdd] shadow-xs"
                                    : "text-[#6d6963] hover:text-[#2b2620]"
                            }`}
                        >
                            <QrCode className="h-3.5 w-3.5" />
                            <span>Exhibition Pass</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setViewMode("scanner")}
                            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition cursor-pointer ${
                                viewMode === "scanner"
                                    ? "bg-[#2b2620] text-[#f4ecdd] shadow-xs"
                                    : "text-[#6d6963] hover:text-[#2b2620]"
                            }`}
                        >
                            <Camera className="h-3.5 w-3.5" />
                            <span>Live Scanner</span>
                        </button>
                    </div>
                </motion.div>

                {/* Dynamic View Stage */}
                <div className="w-full flex justify-center">
                    <AnimatePresence mode="wait">
                        {viewMode === "pass" ? (
                            <motion.div
                                key="pass"
                                initial={{ opacity: 0, x: -16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 16 }}
                                transition={{ duration: 0.3 }}
                                className="w-full flex justify-center"
                            >
                                <QRCodeCard
                                    unlockUrl={unlockUrl}
                                    onOpenScanner={() => setViewMode("scanner")}
                                    onSimulateScan={handleSimulateScan}
                                />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="scanner"
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -16 }}
                                transition={{ duration: 0.3 }}
                                className="w-full flex justify-center"
                            >
                                <QRScannerView
                                    onScanSuccess={handleSuccessfulScan}
                                    onClose={() => setViewMode("pass")}
                                    onSimulateScan={handleSimulateScan}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Notes */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8 text-center text-[11px] text-[#6d6963]/80 font-serif"
                >
                    Private Studio Collection · Archival Series 2026 · All Rights Reserved
                </motion.div>
            </div>
        </div>
    )
}

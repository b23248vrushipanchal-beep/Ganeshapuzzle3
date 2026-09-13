import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { motion } from "framer-motion"
import { QrCode, Copy, Check, Sparkles, Camera, Download } from "lucide-react"

interface QRCodeCardProps {
    onOpenScanner: () => void
    onSimulateScan: () => void
    unlockUrl: string
}

export default function QRCodeCard({
    onOpenScanner,
    onSimulateScan,
    unlockUrl,
}: QRCodeCardProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const [copied, setCopied] = useState(false)
    const [qrReady, setQrReady] = useState(false)

    useEffect(() => {
        if (!canvasRef.current) return

        QRCode.toCanvas(
            canvasRef.current,
            unlockUrl,
            {
                width: 240,
                margin: 2,
                color: {
                    dark: "#2b2620",
                    light: "#efe2cf",
                },
                errorCorrectionLevel: "H",
            },
            (err) => {
                if (!err) {
                    setQrReady(true)
                }
            }
        )
    }, [unlockUrl])

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(unlockUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleDownload = () => {
        if (!canvasRef.current) return
        const link = document.createElement("a")
        link.download = "atelier-puzzle-pass.png"
        link.href = canvasRef.current.toDataURL("image/png")
        link.click()
    }

    return (
        <div className="flex flex-col items-center">
            {/* Museum Exhibition Ticket */}
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative w-full max-w-[420px] overflow-hidden rounded-[26px] border border-[#2b2620]/15 bg-[#efe2cf] p-6 shadow-[0_25px_60px_-15px_rgba(43,38,32,0.28),inset_0_1px_0_rgba(255,255,255,0.7)] text-[#2b2620]"
            >
                {/* Vintage Ticket Header */}
                <div className="flex items-center justify-between border-b border-[#2b2620]/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b4552d] text-[#f4ecdd] text-xs font-serif font-bold shadow-sm">
                            12
                        </span>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6d6963]">
                                Atelier Exhibition Pass
                            </p>
                            <h3 className="font-serif text-base font-bold leading-none tracking-tight">
                                Bal Ganesha · Jigsaw
                            </h3>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#b4552d]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#b4552d]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#b4552d] animate-pulse" />
                        Gate Active
                    </span>
                </div>

                {/* Ticket Body / QR Stage */}
                <div className="my-5 flex flex-col items-center justify-center">
                    <div className="relative rounded-2xl bg-[#f4ecdd] p-4 shadow-[inset_0_2px_8px_rgba(43,38,32,0.08),0_10px_24px_-8px_rgba(43,38,32,0.15)] border border-[#2b2620]/10">
                        {/* Decorative Corner Flairs */}
                        <div className="absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 border-[#b4552d]" />
                        <div className="absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 border-[#b4552d]" />
                        <div className="absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-[#b4552d]" />
                        <div className="absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-[#b4552d]" />

                        <canvas
                            ref={canvasRef}
                            className={`h-[190px] w-[190px] transition-opacity duration-500 ${
                                qrReady ? "opacity-100" : "opacity-0"
                            }`}
                        />
                        {!qrReady && (
                            <div className="flex h-[190px] w-[190px] items-center justify-center">
                                <QrCode className="h-12 w-12 animate-pulse text-[#b4552d]/40" />
                            </div>
                        )}
                    </div>

                    <p className="mt-4 text-center font-serif text-xs italic text-[#6d6963]">
                        Point your mobile camera at this code, or use our live scanner below.
                    </p>
                </div>

                {/* Perforation Cut Effect */}
                <div className="relative my-2 -mx-6 flex items-center">
                    <div className="h-5 w-5 -ml-2.5 rounded-full bg-[#f4ecdd] border-r border-[#2b2620]/15" />
                    <div className="flex-1 border-t-2 border-dashed border-[#2b2620]/20" />
                    <div className="h-5 w-5 -mr-2.5 rounded-full bg-[#f4ecdd] border-l border-[#2b2620]/15" />
                </div>

                {/* Actions Bar */}
                <div className="pt-3 flex items-center justify-between gap-2 text-xs">
                    <button
                        onClick={handleCopy}
                        type="button"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2b2620]/15 bg-[#f4ecdd]/80 px-3 py-2 font-medium text-[#2b2620] hover:bg-[#f4ecdd] active:scale-[0.98] transition shadow-xs cursor-pointer"
                        title="Copy direct puzzle unlock link"
                    >
                        {copied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-emerald-700" />
                                <span className="text-emerald-700">Copied!</span>
                            </>
                        ) : (
                            <>
                                <Copy className="h-3.5 w-3.5 text-[#6d6963]" />
                                <span>Copy Link</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={handleDownload}
                        type="button"
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-[#2b2620]/15 bg-[#f4ecdd]/80 px-3 py-2 font-medium text-[#2b2620] hover:bg-[#f4ecdd] active:scale-[0.98] transition shadow-xs cursor-pointer"
                        title="Download QR code image"
                    >
                        <Download className="h-3.5 w-3.5 text-[#6d6963]" />
                        <span>Save Pass</span>
                    </button>
                </div>
            </motion.div>

            {/* Main Interactive Controls */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                    onClick={onOpenScanner}
                    type="button"
                    className="flex items-center gap-2 rounded-full bg-[#b4552d] px-5 py-2.5 text-sm font-semibold text-[#f4ecdd] shadow-[0_8px_20px_-6px_rgba(180,85,45,0.45)] hover:bg-[#9d4420] active:scale-[0.98] transition cursor-pointer"
                >
                    <Camera className="h-4 w-4" />
                    <span>Launch QR Scanner</span>
                </button>

                <button
                    onClick={onSimulateScan}
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-[#2b2620]/20 bg-[#efe2cf] px-4 py-2.5 text-sm font-medium text-[#2b2620] hover:bg-[#e4d4bd] active:scale-[0.98] transition shadow-xs cursor-pointer"
                >
                    <Sparkles className="h-4 w-4 text-[#b4552d]" />
                    <span>Instant Demo Scan</span>
                </button>
            </div>
        </div>
    )
}

import { useEffect, useRef, useState, useCallback } from "react"
import jsQR from "jsqr"
import { motion, AnimatePresence } from "framer-motion"
import {
    Camera,
    Upload,
    X,
    Sparkles,
    AlertCircle,
    CheckCircle2,
    SwitchCamera,
} from "lucide-react"

interface QRScannerViewProps {
    onScanSuccess: (decodedText: string) => void
    onClose: () => void
    onSimulateScan: () => void
}

export default function QRScannerView({
    onScanSuccess,
    onClose,
    onSimulateScan,
}: QRScannerViewProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const animFrameRef = useRef<number | null>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
    const [scannedCode, setScannedCode] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    // Play subtle pleasant chime with Web Audio API
    const playSuccessChime = useCallback(() => {
        try {
            const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
            const now = ctx.currentTime

            const osc1 = ctx.createOscillator()
            const gain1 = ctx.createGain()
            osc1.type = "sine"
            osc1.frequency.setValueAtTime(587.33, now) // D5
            gain1.gain.setValueAtTime(0.15, now)
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
            osc1.connect(gain1)
            gain1.connect(ctx.destination)
            osc1.start(now)
            osc1.stop(now + 0.35)

            const osc2 = ctx.createOscillator()
            const gain2 = ctx.createGain()
            osc2.type = "sine"
            osc2.frequency.setValueAtTime(880, now + 0.09) // A5
            gain2.gain.setValueAtTime(0.18, now + 0.09)
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
            osc2.connect(gain2)
            gain2.connect(ctx.destination)
            osc2.start(now + 0.09)
            osc2.stop(now + 0.55)
        } catch {
            // Audio context not allowed or unsupported
        }
    }, [])

    const handleCodeDetected = useCallback(
        (codeText: string) => {
            if (isProcessing) return
            setIsProcessing(true)
            setScannedCode(codeText)
            playSuccessChime()

            // Stop camera stream
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop())
            }

            // Brief celebration delay to show success state before launching
            setTimeout(() => {
                onScanSuccess(codeText)
            }, 900)
        },
        [isProcessing, onScanSuccess, playSuccessChime]
    )

    // Check available devices
    useEffect(() => {
        if (navigator.mediaDevices?.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices().then((devices) => {
                const videoInputs = devices.filter((d) => d.kind === "videoinput")
                setHasMultipleCameras(videoInputs.length > 1)
            }).catch(() => { })
        }
    }, [])

    // Start video camera stream
    useEffect(() => {
        let isMounted = true

        const stopCurrentStream = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop())
                streamRef.current = null
            }
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current)
                animFrameRef.current = null
            }
        }

        const startCamera = async () => {
            stopCurrentStream()
            setErrorMessage(null)

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                setHasPermission(false)
                setErrorMessage("Camera access is not supported in this browser.")
                return
            }

            try {
                const constraints: MediaStreamConstraints = {
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                }

                const stream = await navigator.mediaDevices.getUserMedia(constraints)
                if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop())
                    return
                }

                streamRef.current = stream
                setHasPermission(true)

                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.setAttribute("playsinline", "true")
                    videoRef.current.play().catch(() => { })
                }
            } catch (err: unknown) {
                if (!isMounted) return
                setHasPermission(false)
                const error = err as Error
                if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                    setErrorMessage("Camera permission was denied. Please allow camera access, or use image upload / demo scan.")
                } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
                    setErrorMessage("No camera device found on this system.")
                } else {
                    setErrorMessage("Unable to open camera: " + (error.message || "Unknown error"))
                }
            }
        }

        startCamera()

        return () => {
            isMounted = false
            stopCurrentStream()
        }
    }, [facingMode])

    // Continuous frame scanning loop
    useEffect(() => {
        if (!hasPermission || isProcessing) return

        let running = true

        const scanFrame = () => {
            if (!running) return

            const video = videoRef.current
            const canvas = canvasRef.current

            if (
                video &&
                canvas &&
                video.readyState === video.HAVE_ENOUGH_DATA &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
            ) {
                const ctx = canvas.getContext("2d", { willReadFrequently: true })
                if (ctx) {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert",
                    })

                    if (code && code.data && code.data.trim().length > 0) {
                        handleCodeDetected(code.data)
                        return
                    }
                }
            }

            animFrameRef.current = requestAnimationFrame(scanFrame)
        }

        animFrameRef.current = requestAnimationFrame(scanFrame)

        return () => {
            running = false
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current)
            }
        }
    }, [hasPermission, isProcessing, handleCodeDetected])

    // Handle file upload scanning
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const img = new Image()
            img.onload = () => {
                const offscreen = document.createElement("canvas")
                offscreen.width = img.width
                offscreen.height = img.height
                const ctx = offscreen.getContext("2d", { willReadFrequently: true })
                if (ctx) {
                    ctx.drawImage(img, 0, 0)
                    const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
                    const code = jsQR(imgData.data, imgData.width, imgData.height)
                    if (code && code.data) {
                        handleCodeDetected(code.data)
                    } else {
                        alert("No QR code detected in this image. Please try a clearer QR code image.")
                    }
                }
            }
            img.src = event.target?.result as string
        }
        reader.readAsDataURL(file)
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-[480px] overflow-hidden rounded-[26px] border border-[#2b2620]/15 bg-[#efe2cf] p-6 shadow-[0_25px_60px_-15px_rgba(43,38,32,0.3)] text-[#2b2620]"
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#2b2620]/10 pb-3">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b4552d] text-[#f4ecdd]">
                        <Camera className="h-4 w-4" />
                    </span>
                    <div>
                        <h3 className="font-serif text-base font-bold leading-none">
                            Live QR Scanner
                        </h3>
                        <p className="text-[11px] text-[#6d6963]">
                            Align the exhibition QR code within the frame
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {hasMultipleCameras && (
                        <button
                            onClick={() =>
                                setFacingMode((prev) =>
                                    prev === "environment" ? "user" : "environment"
                                )
                            }
                            type="button"
                            className="rounded-full p-2 text-[#6d6963] hover:bg-[#f4ecdd] hover:text-[#2b2620] transition cursor-pointer"
                            title="Switch camera"
                        >
                            <SwitchCamera className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        type="button"
                        className="rounded-full p-2 text-[#6d6963] hover:bg-[#f4ecdd] hover:text-[#2b2620] transition cursor-pointer"
                        title="Close scanner"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Video Viewport Area */}
            <div className="relative my-4 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#221d16] shadow-inner">
                {/* Hidden canvas used for reading raw pixel data */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Video Element */}
                <video
                    ref={videoRef}
                    className={`h-full w-full object-cover transition-opacity duration-300 ${hasPermission && !errorMessage ? "opacity-100" : "opacity-0"
                        }`}
                    playsInline
                    muted
                    autoPlay
                />

                {/* Viewfinder Overlay */}
                {hasPermission && !scannedCode && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        {/* Target Reticle */}
                        <div className="relative h-[210px] w-[210px]">
                            {/* Reticle Brackets */}
                            <div className="absolute top-0 left-0 h-6 w-6 border-t-3 border-l-3 border-[#b4552d] rounded-tl-md shadow-sm" />
                            <div className="absolute top-0 right-0 h-6 w-6 border-t-3 border-r-3 border-[#b4552d] rounded-tr-md shadow-sm" />
                            <div className="absolute bottom-0 left-0 h-6 w-6 border-b-3 border-l-3 border-[#b4552d] rounded-bl-md shadow-sm" />
                            <div className="absolute bottom-0 right-0 h-6 w-6 border-b-3 border-r-3 border-[#b4552d] rounded-br-md shadow-sm" />

                            {/* Animated Laser Scanning Line */}
                            <motion.div
                                animate={{
                                    y: [0, 204, 0],
                                    opacity: [0.3, 0.9, 0.3],
                                }}
                                transition={{
                                    duration: 2.2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                                className="absolute left-1 right-1 h-[2px] bg-gradient-to-r from-transparent via-[#b4552d] to-transparent shadow-[0_0_8px_#b4552d]"
                            />
                        </div>
                    </div>
                )}

                {/* Scanning Success Overlay */}
                <AnimatePresence>
                    {scannedCode && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center bg-[#221d16]/90 p-4 text-center text-[#f4ecdd]"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-[#f4ecdd] shadow-lg"
                            >
                                <CheckCircle2 className="h-10 w-10" />
                            </motion.div>
                            <h4 className="mt-3 font-serif text-lg font-bold">
                                Pass Verified!
                            </h4>
                            <p className="mt-1 text-xs text-[#efe2cf]/80 max-w-[280px] truncate">
                                Unlocking Atelier Nº 12 Exhibition...
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Fallback / Error State */}
                {errorMessage && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-[#f4ecdd]">
                        <AlertCircle className="h-10 w-10 text-[#b4552d] mb-2" />
                        <p className="text-xs text-[#efe2cf]/90 font-medium">
                            {errorMessage}
                        </p>
                        <p className="mt-2 text-[11px] text-[#efe2cf]/60">
                            You can upload an image of the QR code or use Instant Demo Scan below.
                        </p>
                    </div>
                )}
            </div>

            {/* Alternative Scanner Controls */}
            <div className="flex flex-col gap-2 pt-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2b2620]/15 bg-[#f4ecdd]/80 px-3 py-2 font-medium text-[#2b2620] hover:bg-[#f4ecdd] active:scale-[0.98] transition cursor-pointer"
                    >
                        <Upload className="h-3.5 w-3.5 text-[#6d6963]" />
                        <span>Upload QR Image</span>
                    </button>

                    <button
                        onClick={onSimulateScan}
                        type="button"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#2b2620]/15 bg-[#f4ecdd]/80 px-3 py-2 font-medium text-[#2b2620] hover:bg-[#f4ecdd] active:scale-[0.98] transition cursor-pointer"
                    >
                        <Sparkles className="h-3.5 w-3.5 text-[#b4552d]" />
                        <span>Demo Unlock</span>
                    </button>
                </div>

                <div className="flex justify-center mt-1">
                    <button
                        onClick={onClose}
                        type="button"
                        className="text-[11px] text-[#6d6963] hover:text-[#2b2620] underline underline-offset-2 cursor-pointer"
                    >
                        Back to Exhibition Pass
                    </button>
                </div>
            </div>
        </motion.div>
    )
}

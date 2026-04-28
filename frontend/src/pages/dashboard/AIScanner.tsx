import DashboardShell from "@/components/dashboard/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { apiFetch } from "@/lib/api";
import { motion } from "framer-motion";
import { AlertTriangle, Camera, CheckCircle2, Download, Leaf, Lock, ScanLine, ShieldCheck, Trash2, Upload, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

type ScanResult = {
  disease: string;
  scientificName: string;
  crop: string;
  confidence: number;
  severity: "Low" | "Moderate" | "High";
  spreadRisk: "Low" | "Moderate" | "High";
  affectedArea: string;
  description: string;
  treatment: string;
  organicAlternatives: string[];
  fertilizerRecommendations: string[];
  prevention: string;
};

type ScanHistoryItem = {
  id: string;
  disease: string;
  crop: string;
  severity: ScanResult["severity"];
  confidence: number;
  scannedAt: string;
};

type ScanResponse = {
  scanId?: string;
  result: ScanResult;
  scannedAt: string;
  analysisMode: string;
  advisory: string;
};

type ScanMeta = {
  analysisMode: string;
  advisory: string;
};

const MAX_SCAN_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_SCAN_IMAGE_DIMENSION = 1280;
const SCAN_UPLOAD_QUALITY = 0.82;
const SCAN_OUTPUT_MIME_TYPE = "image/jpeg";

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to read image preview."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image for scanning."));
    image.src = src;
  });
}

async function optimizeImageForScan(file: File) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const scale = Math.min(1, MAX_SCAN_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image for scanning.");
  }

  context.drawImage(image, 0, 0, width, height);
  const optimizedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, SCAN_OUTPUT_MIME_TYPE, SCAN_UPLOAD_QUALITY);
  });
  if (!optimizedBlob) {
    throw new Error("Unable to optimize image for faster scanning.");
  }

  const optimizedFile = new File([optimizedBlob], `${file.name.replace(/\.[^.]+$/, "") || "crop-scan"}.jpg`, {
    type: SCAN_OUTPUT_MIME_TYPE,
  });
  const previewDataUrl = canvas.toDataURL(SCAN_OUTPUT_MIME_TYPE, SCAN_UPLOAD_QUALITY);
  return { file: optimizedFile, previewDataUrl };
}

function ProGate() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative max-w-lg overflow-hidden rounded-[1.75rem] border border-emerald-200/60 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(236,253,245,0.92))] p-7 text-center shadow-[0_25px_80px_-40px_rgba(5,150,105,0.5)] dark:border-emerald-500/30 dark:bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_40%),linear-gradient(135deg,rgba(15,23,42,0.97),rgba(17,24,39,0.96))]"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-emerald-100 text-primary shadow-inner">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground">AI Crop Scanner</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Upgrade to Pro for faster diagnostics, treatment suggestions, and a cleaner field-health workflow built for daily scouting.
        </p>
        <div className="mt-6 grid gap-3 text-left text-sm text-muted-foreground sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/70 bg-white/75 p-3.5 dark:border-white/10 dark:bg-background/60">
            <p className="font-semibold text-foreground">Instant diagnosis</p>
            <p className="mt-1">Identify likely crop diseases from a field image in seconds.</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/70 bg-white/75 p-3.5 dark:border-white/10 dark:bg-background/60">
            <p className="font-semibold text-foreground">Treatment guidance</p>
            <p className="mt-1">Get a practical next-step plan and prevention reminders.</p>
          </div>
        </div>
        <Button asChild className="mt-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/dashboard/upgrade">
            <Zap className="mr-2 h-4 w-4" /> Upgrade to Pro
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}

function ScannerLab() {
  const [scanning, setScanning] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useLocalStorage<ScanHistoryItem[]>("agrixl-scan-history", []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const formatRelativeTime = (value: string) => {
    const diffMs = Date.now() - new Date(value).getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const scanningTips = useMemo(() => {
    if (!selectedImage) {
      return [
        "Use natural light when possible.",
        "Frame the affected leaf, fruit, or vegetable clearly against a simple background.",
        "Retake if the image is blurry or shadowed.",
      ];
    }

    if (!result) {
      return [
        "Keep one affected area centered before starting the scan.",
        "Avoid hands or tools covering the crop surface in the photo.",
        "If the crop is wet or dark, retake the image in brighter light.",
      ];
    }

    if (result.severity === "High") {
      return [
        "Isolate badly affected plants or produce quickly to reduce spread.",
        "Use the treatment plan soon and monitor nearby crops within 24 hours.",
        "Take another scan after intervention to compare progression.",
      ];
    }

    if (result.severity === "Moderate") {
      return [
        "Rescan a second angle of the same crop part to confirm consistency.",
        "Check neighboring plants for similar symptoms before treatment.",
        "Track changes over the next few days with repeat scans.",
      ];
    }

    return [
      "No major symptoms were detected, but keep scouting routinely.",
      "Scan again if color, texture, or spots change over time.",
      "Store this result and compare it with future scans from the same crop.",
    ];
  }, [result, selectedImage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    void (async () => {
      try {
        const { file: optimizedFile, previewDataUrl } = await optimizeImageForScan(file);
        if (optimizedFile.size > MAX_SCAN_FILE_SIZE_BYTES) {
          toast.error("Image is still too large after optimization. Please choose a smaller image.");
          return;
        }

        setSelectedFile(optimizedFile);
        setSelectedImage(previewDataUrl);
        setResult(null);
        setScanMeta(null);
        setCameraError(null);
        setScanError(null);
        setCameraOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to prepare image for scanning.");
      }
    })();
  };

  const openCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setCameraOpen(true);

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch {
      setCameraError("Camera access was blocked. You can still upload an image from your device.");
      setCameraOpen(false);
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const captureFromCamera = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedImage = canvas.toDataURL("image/jpeg", 0.92);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) {
      setCameraError("Unable to capture the crop image. Please try again.");
      return;
    }

    try {
      const rawFile = new File([blob], `crop-scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      const { file: optimizedFile, previewDataUrl } = await optimizeImageForScan(rawFile);

      setSelectedFile(optimizedFile);
      setSelectedImage(previewDataUrl || capturedImage);
      setResult(null);
      setScanMeta(null);
      setScanError(null);
      closeCamera();
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Unable to prepare captured image.");
    }
  };

  const startScan = async () => {
    if (!selectedImage || !selectedFile) return;

    setScanning(true);
    setResult(null);
    setScanMeta(null);
    setScanError(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      const response = await apiFetch<ScanResponse>("/scanner/crops", {
        method: "POST",
        body: formData,
      });

      setResult(response.result);
      setScanMeta({ analysisMode: response.analysisMode, advisory: response.advisory });
      setRecentScans((current) => [
        {
          id: response.scanId || crypto.randomUUID(),
          disease: response.result.disease,
          crop: response.result.crop,
          severity: response.result.severity,
          confidence: response.result.confidence,
          scannedAt: response.scannedAt,
        },
        ...current.slice(0, 5),
      ]);
      toast.success("Crop diagnosis is ready.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze crop image.";
      setScanError(message);
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  const severityTone =
    result?.severity === "High"
      ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
      : result?.severity === "Moderate"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300";

  const treatmentItems = result?.treatment
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  const preventionItems = result?.prevention
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadResult = () => {
    if (!result || !selectedImage) return;

    const generatedAt = new Date().toLocaleString();
    const preventionItems = result.prevention
      .split(".")
      .map((item) => item.trim())
      .filter(Boolean);
    const treatmentItems = result.treatment
      .split(".")
      .map((item) => item.trim())
      .filter(Boolean);

    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crop Diagnosis Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #ffffff;
      color: #10231a;
      margin: 0;
      padding: 0;
    }
    .report {
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 18px 16px;
      background: #17642f;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
    }
    .meta {
      padding: 12px 16px 0;
      color: #6b7280;
      font-size: 14px;
    }
    .content {
      flex: 1;
      padding: 10px 16px 28px;
    }
    .footer {
      margin-top: auto;
      background: #17642f;
      color: #ffffff;
      padding: 14px 16px;
      font-size: 13px;
    }
    .top {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .image {
      width: 235px;
      height: 205px;
      object-fit: cover;
      display: block;
    }
    .summary {
      flex: 1;
    }
    .summary h2 {
      margin: 0 0 8px;
      font-size: 18px;
      color: #222222;
    }
    .latin {
      margin: 0 0 8px;
      color: #8b8b8b;
      font-style: italic;
    }
    .detail {
      margin: 0 0 6px;
      font-size: 14px;
      color: #444444;
    }
    .section {
      margin-top: 12px;
    }
    .section h3 {
      margin: 0 0 6px;
      color: #17642f;
      font-size: 18px;
    }
    .section p,
    .section li {
      font-size: 14px;
      line-height: 1.45;
      color: #4b5563;
    }
    .section ul {
      margin: 0;
      padding-left: 18px;
    }
    .section li {
      margin-bottom: 4px;
    }
    @media (max-width: 640px) {
      .top {
        flex-direction: column;
      }
      .image {
        width: 100%;
        height: auto;
      }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="header">
      <h1>Agrilink X AI Diagnosis Report</h1>
    </div>
    <div class="meta">Generated: ${generatedAt}</div>
    <div class="content">
      <div class="top">
        <img class="image" src="${selectedImage}" alt="Crop scan image" />
        <div class="summary">
          <h2>${result.disease}</h2>
          <p class="latin">${result.scientificName}</p>
          <p class="detail">Plant: ${result.crop}</p>
          <p class="detail">Confidence: ${result.confidence}%</p>
          <p class="detail">Severity: ${result.severity}</p>
          <p class="detail">Spread Risk: ${result.spreadRisk}</p>
          <p class="detail">Affected Area: ${result.affectedArea}</p>
        </div>
      </div>
      <div class="section">
        <h3>Description</h3>
        <p>${result.description}</p>
      </div>
      <div class="section">
        <h3>Treatment Plan</h3>
        <ul>${treatmentItems.map((item) => `<li>${item}.</li>`).join("")}</ul>
      </div>
      <div class="section">
        <h3>Organic Alternatives</h3>
        <ul>${result.organicAlternatives.map((item) => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="section">
        <h3>Fertilizer Recommendations</h3>
        <ul>${result.fertilizerRecommendations?.map((item) => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="section">
        <h3>Prevention Tips</h3>
        <ul>${preventionItems.map((item) => `<li>${item}.</li>`).join("")}</ul>
      </div>
    </div>
    <div class="footer">Agrilink X AI crop health analysis report.</div>
  </div>
</body>
</html>`;

    downloadFile("crop-diagnosis-report.html", reportHtml, "text/html;charset=utf-8");
  };

  const handleClearRecentScans = () => {
    if (recentScans.length === 0) return;
    setRecentScans([]);
    toast.success("Recent scans cleared.");
  };

  return (
    <div className="space-y-5">
      <section className="px-1 py-1 sm:px-2">
        <div className="w-full max-w-4xl space-y-2.5">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 text-emerald-700">
              <Leaf className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.2em]">AI Crop Diagnosis</span>
            </div>
            <h2 className="max-w-4xl break-words font-display text-[1.65rem] font-bold leading-[1.12] text-foreground sm:text-[1.95rem] lg:text-[2.2rem]">
              AI Disease Diagnosis
            </h2>
            <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground sm:text-[15px]">
              Upload a clear crop image for instant AI-powered analysis of a leaf, fruit, or vegetable with diagnosis guidance made for growers on the move.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden p-0">
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageSelect} />
          <canvas ref={canvasRef} className="hidden" />

          <div className="mb-2 flex items-center justify-between px-1">
            <div>
              <p className="text-sm font-semibold text-foreground">Live scan panel</p>
              <p className="text-sm text-muted-foreground">Use the camera in the field or upload from your gallery.</p>
            </div>
            <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">AI Ready</div>
          </div>

          <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.55rem] border border-border/70 bg-[#f5f7f6] p-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.28)] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(17,24,39,0.98))]">
            {cameraOpen ? (
              <div className="w-full max-w-2xl text-center">
                <div className="overflow-hidden rounded-[1.25rem] border border-emerald-200 bg-black shadow-md">
                  <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
                </div>
                <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Button onClick={() => void captureFromCamera()} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    <Camera className="mr-2 h-4 w-4" /> Capture Photo
                  </Button>
                  <Button type="button" variant="outline" onClick={closeCamera} className="rounded-xl">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : scanning ? (
              <>
                {selectedImage && (
                  <img src={selectedImage} alt="Scanning crop" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(15,23,42,0.1))]" />
                <div className="relative h-52 w-52">
                  <div className="absolute inset-0 rounded-full border border-emerald-200" />
                  <div className="absolute inset-4 rounded-full border border-emerald-200/80" />
                  <div className="absolute inset-8 rounded-full border border-emerald-200/60" />
                  <div className="radar-sweep absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(16,185,129,0.3)_56deg,transparent_70deg)]" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="sensor-pulse h-4 w-4 rounded-full bg-primary" />
                  </div>
                </div>
                <div className="absolute bottom-6 rounded-full bg-white/85 px-4 py-2 text-sm font-medium text-emerald-700 shadow-lg backdrop-blur dark:bg-background/85 dark:text-emerald-300">
                  Analyzing crop image...
                </div>
              </>
            ) : selectedImage ? (
              <div className="w-full max-w-2xl text-center">
                <img src={selectedImage} alt="Selected crop" className="mx-auto aspect-video w-full rounded-[1.25rem] border border-emerald-200 bg-white object-cover shadow-md dark:border-emerald-500/30 dark:bg-card" />
                {scanError && <p className="mt-4 text-sm text-destructive">{scanError}</p>}
                <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Button onClick={() => void startScan()} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    <ScanLine className="mr-2 h-4 w-4" /> Start Diagnosis
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedImage(null);
                      setSelectedFile(null);
                      setResult(null);
                      setScanMeta(null);
                      setScanError(null);
                    }}
                    className="rounded-xl"
                  >
                    Choose Another Image
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-md text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.1rem] bg-transparent text-primary">
                  <Camera className="h-8 w-8" />
                </div>
                <h3 className="font-display text-[1.45rem] font-bold text-foreground">Ready for a field check</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Capture a clear photo of the leaf, fruit, or vegetable in daylight for the best result. Focus on spots, streaks, rot, or discoloration.
                </p>
                {cameraError && <p className="mt-3 text-sm text-destructive">{cameraError}</p>}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button onClick={() => void openCamera()} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    <Camera className="mr-2 h-4 w-4" /> Open Camera
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="rounded-xl">
                    <Upload className="mr-2 h-4 w-4" /> Upload Image
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.section>

        <div className="space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[1.55rem] border border-border/70 bg-white/85 p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)] dark:bg-card/90 dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-[1rem] bg-emerald-100 p-2.5 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">Diagnosis Result</h3>
                <p className="text-sm text-muted-foreground">Review severity, confidence, and what to do next.</p>
              </div>
            </div>

            {result ? (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" onClick={handleDownloadResult} className="rounded-xl">
                    <Download className="mr-2 h-4 w-4" /> Download Diagnosis Result
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.1rem] border border-border bg-muted/40 p-3.5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Likely diagnosis</p>
                    <p className="mt-2 font-display text-xl font-bold text-foreground">{result.disease}</p>
                    {scanMeta && (
                      <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                        {scanMeta.analysisMode === "gemini" ? "Gemini analysis" : "Fallback analysis"}
                      </div>
                    )}
                  </div>
                  <div className={`rounded-[1.1rem] border p-3.5 ${severityTone}`}>
                    <p className="text-[11px] uppercase tracking-[0.18em]">Severity</p>
                    <p className="mt-2 font-display text-xl font-bold">{result.severity}</p>
                  </div>
                </div>

                <div className="rounded-[1.1rem] border border-border bg-muted/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Model confidence</p>
                    <p className="font-semibold text-foreground">{result.confidence}%</p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100">
                    <div className="h-full rounded-full bg-emerald-gradient" style={{ width: `${result.confidence}%` }} />
                  </div>
                </div>
                {scanMeta?.advisory && (
                  <div className="rounded-[1.1rem] border border-emerald-200/80 bg-emerald-50/70 p-3.5 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                    {scanMeta.advisory}
                  </div>
                )}

                <div className="space-y-3.5">
                  <div className="rounded-[1.25rem] border border-emerald-200/80 bg-white p-4 shadow-sm dark:border-emerald-500/30 dark:bg-background/70">
                    <div className="flex items-center gap-3">
                      <ScanLine className="h-5 w-5 text-emerald-600" />
                      <div>
                        <h4 className="font-display text-lg font-bold text-foreground">Treatment Plan</h4>
                        <p className="text-sm text-muted-foreground">
                          Recommended next steps for {result.disease.toLowerCase()} on {result.crop.toLowerCase()}.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {treatmentItems.map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <p className="text-sm leading-7 text-foreground">{item}.</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border border-emerald-200/80 bg-white p-4 shadow-sm dark:border-emerald-500/30 dark:bg-background/70">
                    <div className="flex items-center gap-3">
                      <Leaf className="h-5 w-5 text-emerald-600" />
                      <div>
                        <h4 className="font-display text-lg font-bold text-foreground">Organic Alternatives</h4>
                        <p className="text-sm text-muted-foreground">
                          Lower-input options matched to this diagnosis result.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {result.organicAlternatives.map((item) => (
                        <div key={item} className="flex items-start gap-3">
                          <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <p className="text-sm leading-7 text-foreground">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {result.fertilizerRecommendations && result.fertilizerRecommendations.length > 0 && (
                    <div className="rounded-[1.25rem] border border-emerald-200/80 bg-white p-4 shadow-sm dark:border-emerald-500/30 dark:bg-background/70">
                      <div className="flex items-center gap-3">
                        <Leaf className="h-5 w-5 text-emerald-600" />
                        <div>
                          <h4 className="font-display text-lg font-bold text-foreground">Fertilizer Recommendations</h4>
                          <p className="text-sm text-muted-foreground">
                            Nutrient and soil advice to support crop recovery.
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3">
                        {result.fertilizerRecommendations.map((item) => (
                          <div key={item} className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                            <p className="text-sm leading-7 text-foreground">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-[1.25rem] border border-emerald-200/80 bg-white p-4 shadow-sm dark:border-emerald-500/30 dark:bg-background/70">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      <div>
                        <h4 className="font-display text-lg font-bold text-foreground">Prevention Tips</h4>
                        <p className="text-sm text-muted-foreground">
                          Follow these steps after this diagnosis to reduce repeat spread.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {preventionItems.map((item, index) => (
                        <div key={item} className="flex items-start gap-3">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-600 text-[11px] font-semibold text-emerald-700">
                            {index + 1}
                          </div>
                          <p className="text-sm leading-7 text-foreground">{item}.</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-muted/30 text-center">
                <div>
                  <Leaf className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {scanError || "Diagnosis details, treatment plan, organic alternatives, and prevention tips will appear after a scan."}
                  </p>
                </div>
              </div>
            )}
          </motion.section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border border-border/70 bg-white/85 p-4 shadow-sm dark:bg-card/90">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="font-semibold text-foreground">Scanning tips</p>
              </div>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {scanningTips.map((tip, index) => (
                  <li key={tip} className="flex gap-2">
                    <span className="font-semibold text-foreground">{index + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-[1.4rem] border border-border/70 bg-white/85 p-4 shadow-sm dark:bg-card/90">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <p className="font-semibold text-foreground">Recent scans</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearRecentScans}
                  disabled={recentScans.length === 0}
                  className="rounded-lg"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {recentScans.length > 0 ? (
                  recentScans.map((scan) => (
                    <div key={scan.id} className="rounded-xl bg-muted/40 px-3 py-2">
                      <p className="font-medium text-foreground">{scan.disease}</p>
                      <p className="text-xs text-muted-foreground">
                        {scan.crop} | {scan.severity} | {scan.confidence}% | {formatRelativeTime(scan.scannedAt)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl bg-muted/40 px-3 py-2">
                    No scans yet. Your recent scan history will appear here.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AIScanner() {
  const { role } = useAuth();
  const hasAccess = role === "farmer_pro" || role === "company";

  return <DashboardShell title="AI Crop Scanner">{hasAccess ? <ScannerLab /> : <ProGate />}</DashboardShell>;
}

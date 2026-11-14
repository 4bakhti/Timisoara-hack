"use client";

/* The camera is the interface. All buttons have accessible names, without visual copy. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Camera, CameraOff, Check, CloudOff, Download, Grid3X3, ImagePlus, LoaderCircle, PersonStanding, RotateCcw, Share2, SwitchCamera, Volume2, VolumeX, X } from "lucide-react";
import { useCoachSession, unlockAudio, type CoachSpeech } from "@/coach";
import { setMuted, speakInstruction, stopSpeaking } from "@/coach/voice";
import type { ShotIdea } from "@/lib/contracts";
import { grabFrame, type FrameSource, type GrabbedFrame } from "@/vision/frame";
import { samplePlan } from "@/lib/fixtures";
import { useAutomaticPose } from "./useAutomaticPose";
import "./camera.css";

function IconButton({ label, children, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active} className={`pose-camera-icon ${active ? "pose-camera-active" : ""}`} {...props}>{children}</button>;
}

const DEMO_IDEA = samplePlan("en").ideas[0];
const NO_CAPTURE = () => undefined;
const namedError = (error: unknown, name: string) => typeof error === "object" && error !== null && "name" in error && error.name === name;

/** Audio toggles do not reload the tracker or interrupt the target. */
function LiveGuide({ source, overlay, idea, sound, mirrored, onState }: {
  source: FrameSource; overlay: HTMLCanvasElement; idea: ShotIdea; sound: boolean; mirrored: boolean;
  onState: (state: "loading" | "ready" | "matched" | "error") => void;
}) {
  const soundRef = useRef(sound);
  useEffect(() => { soundRef.current = sound; if (!sound) stopSpeaking(); }, [sound]);
  const [speech] = useState<CoachSpeech>(() => ({
    say: ({ instruction, lang }) => { if (soundRef.current) void speakInstruction(instruction, lang); },
    cancel: stopSpeaking,
  }));
  const session = useCoachSession({
    video: source instanceof HTMLVideoElement ? source : null,
    still: source instanceof HTMLImageElement ? source.src : null,
    overlay, idea, mode: "solo", lang: navigator.language.startsWith("ro") ? "ro" : "en",
    mirrored, voice: true, speech, autoCapture: false, minimalGuides: true, onCapture: NO_CAPTURE,
  });
  useEffect(() => {
    onState(session.phase === "error" ? "error" : session.phase === "loading" ? "loading" : session.phase === "holding" ? "matched" : "ready");
  }, [session.phase, onState]);
  return <span className="pose-camera-sr" role="status">{session.instruction?.text}</span>;
}

export function CameraScreen({ demo = false }: { demo?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const taking = useRef(false);
  const generation = useRef(0);
  const [overlay, setOverlay] = useState<HTMLCanvasElement | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [image, setImage] = useState<string | null>(demo ? "/demo/scene.svg" : null);
  const [source, setSource] = useState<FrameSource | null>(null);
  const [retry, setRetry] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const [guidance, setGuidance] = useState(true);
  const [grid, setGrid] = useState(false);
  const [sound, setSound] = useState(false);
  const [lastShot, setLastShot] = useState<(GrabbedFrame & { url: string }) | null>(null);
  const [preview, setPreview] = useState(false);
  const [flash, setFlash] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [guideState, setGuideState] = useState<"loading" | "ready" | "matched" | "error">("loading");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [aspect, setAspect] = useState(3 / 4);
  const active = visible && !preview;
  const mirrored = !image && facing === "user";
  const automatic = useAutomaticPose(source, guidance && active && !demo);
  const idea = demo ? DEMO_IDEA : automatic.idea;

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(area);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    return () => { if (lastShot) URL.revokeObjectURL(lastShot.url); };
  }, [lastShot]);
  useEffect(() => { if (image?.startsWith("blob:")) return () => URL.revokeObjectURL(image); }, [image]);
  useEffect(() => {
    generation.current++;
    // External camera replacement must invalidate the previous decoded frame immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(null);
    setCameraError(null);
    let cancelled = false;
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("secure_camera_required");
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (!video) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        if (video.videoWidth && video.videoHeight) {
          setAspect(video.videoWidth / video.videoHeight);
          setSource(video);
        }
      } catch (error) {
        stream?.getTracks().forEach(t => t.stop());
        if (!cancelled) setCameraError(namedError(error, "NotAllowedError")
          ? "Allow camera access in your browser, then retry."
          : !window.isSecureContext ? "Open this page over HTTPS to use the camera."
          : "Camera unavailable. Retry or open a photo.");
      }
    };
    if (!image && active) void start();
    return () => {
      cancelled = true;
      // Invalidate in-flight JPEG encoding, including uploads without a live stream.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      stream?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [facing, image, retry, active]);
  // An uploaded image stays decoded while the camera is paused for preview.
  useEffect(() => {
    if (image && active && imageRef.current?.complete && imageRef.current.naturalWidth) setSource(imageRef.current);
  }, [image, active]);
  useEffect(() => {
    if (!guidance || !active || !idea) overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
  }, [guidance, active, idea, overlay]);
  useEffect(() => {
    if (!problem) return;
    const timer = setTimeout(() => setProblem(null), 5000);
    return () => clearTimeout(timer);
  }, [problem]);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), 180);
    return () => clearTimeout(timer);
  }, [flash]);

  const capture = async () => {
    if (!source || taking.current) return;
    taking.current = true;
    const run = generation.current;
    try {
      const shot = await grabFrame(source, { mirrored, quality: .94 });
      if (run !== generation.current) return;
      setLastShot({ ...shot, url: URL.createObjectURL(shot.blob) });
      setFlash(true);
      stopSpeaking();
      // Like a camera, stay in the viewfinder. The thumbnail opens the photo.
    } catch { setProblem("Could not take the photo. Try again."); }
    finally { taking.current = false; }
  };
  const share = async () => {
    if (!lastShot) return;
    const file = new File([lastShot.blob], "framewise.jpg", { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); }
      catch (error) { if (!namedError(error, "AbortError")) setProblem("Sharing is unavailable. Use the download button."); }
    } else setProblem("Use the download button to save this photo.");
  };
  const frameWidth = size.width && size.height ? Math.min(size.width, size.height * aspect) : undefined;
  const frameStyle = { width: frameWidth, aspectRatio: aspect } as CSSProperties;
  const loading = active && guidance && (automatic.pending || Boolean(idea && guideState === "loading"));
  const failed = automatic.unavailable || (idea && guideState === "error");

  return <main className="pose-camera-camera" aria-label="Pose camera">
    <header className="pose-camera-top" inert={preview}>
      <IconButton label={sound ? "Mute guidance" : "Enable spoken guidance"} active={sound} onClick={() => { unlockAudio(); setMuted(sound); setSound(!sound); }}>{sound ? <Volume2 /> : <VolumeX />}</IconButton>
      <IconButton label={failed ? "Pose guidance unavailable" : "Pose guidance"} active={guidance} onClick={() => {
        if (failed) setProblem("Pose guidance is unavailable. Check the connection and Gemini configuration.");
        setGuidance(!guidance);
      }}>{loading ? <LoaderCircle className="pose-camera-spin" /> : failed ? <CloudOff /> : <PersonStanding />}</IconButton>
      <IconButton label="Composition grid" active={grid} onClick={() => setGrid(!grid)}><Grid3X3 /></IconButton>
    </header>
    <div ref={areaRef} className="pose-camera-viewfinder" inert={preview}>
      <div className="pose-camera-frame" style={frameStyle}>
        <video ref={videoRef} autoPlay playsInline muted className="pose-camera-media" style={{ transform: mirrored ? "scaleX(-1)" : undefined, visibility: image ? "hidden" : "visible" }} onResize={e => {
          const video = e.currentTarget;
          if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
        }} />
        {image && <img ref={imageRef} src={image} alt={demo ? "Sample scene" : "Your photo"} className="pose-camera-media" onLoad={e => {
          setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
          setSource(e.currentTarget);
        }} onError={() => setProblem("This photo could not be opened. Choose a JPEG or PNG.")} />}
        <canvas ref={setOverlay} className="pose-camera-overlay" aria-hidden="true" style={{ transform: mirrored ? "scaleX(-1)" : undefined }} />
        {grid && <div className="pose-camera-grid" aria-hidden="true"><i /><i /><i /><i /></div>}
        {flash && <div className="pose-camera-flash" aria-hidden="true" />}
        {source && guidance && active && idea && overlay && <LiveGuide source={source} overlay={overlay} idea={idea} sound={sound && !demo} mirrored={mirrored} onState={setGuideState} />}
        {source && guidance && active && idea && guideState === "matched" && <span className="pose-camera-match" role="status" aria-label="Pose matched"><Check size={18} /></span>}
        {!source && !cameraError && !image && <LoaderCircle className={`pose-camera-waiting pose-camera-spin`} aria-label="Opening camera" />}
        {cameraError && <div className="pose-camera-permission">
          <CameraOff size={32} strokeWidth={1.3} />
          <p>{cameraError}</p>
          <IconButton label="Retry camera" onClick={() => setRetry(n => n + 1)}><RotateCcw /></IconButton>
        </div>}
        {demo && <span className="pose-camera-demo">Demo</span>}
      </div>
    </div>
    <footer className="pose-camera-bottom" inert={preview}>
      <div className="pose-camera-shutterRow">
        {lastShot ? <button className="pose-camera-thumbnail" aria-label="Open last photo" onClick={() => setPreview(true)}><img src={lastShot.url} alt="" /></button>
          : <IconButton label="Open a photo" onClick={() => inputRef.current?.click()}><ImagePlus /></IconButton>}
        <button className="pose-camera-shutter" aria-label="Take photo" disabled={!source || !active} onClick={() => void capture()}><span /></button>
        <IconButton label={image ? "Return to camera" : "Switch camera"} onClick={() => {
          generation.current++;
          setSource(null);
          if (image) setImage(null);
          else setFacing(f => f === "user" ? "environment" : "user");
        }}>{image ? <Camera /> : <SwitchCamera />}</IconButton>
      </div>
      <div className="pose-camera-homeBar" aria-hidden="true" />
    </footer>
    <input ref={inputRef} className="pose-camera-sr" type="file" accept="image/*" aria-label="Choose photo" onChange={e => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith("image/")) {
        generation.current++;
        setSource(null);
        setImage(URL.createObjectURL(file));
        setPreview(false);
      }
      e.target.value = "";
    }} />
    {preview && lastShot && <section className="pose-camera-preview" role="dialog" aria-modal="true" aria-label="Captured photo" tabIndex={-1}
      ref={node => { node?.focus(); }} onKeyDown={event => {
        if (event.key === "Escape") setPreview(false);
        if (event.key === "Tab") {
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, a"));
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div className="pose-camera-previewTop"><IconButton label="Back to camera" onClick={() => setPreview(false)}><X /></IconButton><IconButton label="Open another photo" onClick={() => inputRef.current?.click()}><ImagePlus /></IconButton></div>
      <img src={lastShot.url} alt="Your captured photo" className="pose-camera-captured" />
      <div className="pose-camera-previewActions">
        <a className="pose-camera-icon" href={lastShot.url} download="framewise.jpg" aria-label="Download photo"><Download /></a>
        <IconButton label="Share photo" onClick={() => void share()}><Share2 /></IconButton>
      </div>
    </section>}
    {problem && <div className="pose-camera-toast" role="alert" onClick={() => setProblem(null)}>{problem}</div>}
  </main>;
}

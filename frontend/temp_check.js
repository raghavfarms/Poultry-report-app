import { Dialog } from "./AdminUi.jsx";
import { useEffect, useRef, useState } from "react";
import { loadFaceModels, detectFaceForEnrolment, getFaceApi } from "../services/faceModelLoader.js";
import { enrolFace, clearFaceRegistration, uploadWorkerPhoto, fetchFirmFaceDescriptors } from "../services/adminApi.js";
export default function FaceRegistrationModal({ worker, onClose, onSaved }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectionLoopRef = useRef(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [cameraError, setCameraError] = useState("");
  const [faceDetection, setFaceDetection] = useState(null);
  const [feedback, setFeedback] = useState("Initializing camera & models...");
  const [busy, setBusy] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [error, setError] = useState("");
  const [enrolledFaces, setEnrolledFaces] = useState([]);
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        setFeedback("Loading neural models...");
        await loadFaceModels();
        if (!mounted) return;
        setModelsReady(true);
        startCamera(facingMode);
      } catch (err) {
        if (!mounted) return;
        setCameraError(err.message || "Failed to initialize models.");
      }
    }
    init();
    return () => {
      mounted = false;
      stopCamera();
      if (detectionLoopRef.current) cancelAnimationFrame(detectionLoopRef.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    async function loadDescriptors() {
      try {
        const firmId = worker?.firm?._id || worker?.firm;
        if (!firmId) return;
        const data = await fetchFirmFaceDescriptors(firmId);
        if (!active) return;
        const currentWorkerId = String(worker._id);
        const others = (data?.descriptors || []).filter(
          (d) => String(d.workerId) !== currentWorkerId
        );
        setEnrolledFaces(others);
      } catch (err) {
        console.warn("Could not pre-load firm face descriptors for duplicate check:", err);
      }
    }
    loadDescriptors();
    return () => {
      active = false;
    };
  }, [worker]);
  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }
  async function startCamera(mode) {
    stopCamera();
    setCameraError("");
    setFeedback("Accessing camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
          setFeedback("Position face inside the oval guide.");
          startDetectionLoop();
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setCameraError("Camera permission denied or camera not available. Please allow camera access.");
    }
  }
  function toggleCamera() {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    startCamera(nextMode);
  }
  function startDetectionLoop() {
    let lastCheckTime = 0;
    async function loop(timestamp) {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        detectionLoopRef.current = requestAnimationFrame(loop);
        return;
      }
      if (timestamp - lastCheckTime > 200) {
        lastCheckTime = timestamp;
        try {
          const res = await detectFaceForEnrolment(videoRef.current);
          setFaceDetection(res);
          if (res.status === "SUCCESS") {
            setFeedback("\u2713 Face detected! Hold steady and click Enrol Face.");
          } else if (res.status === "NO_FACE") {
            setFeedback("Align face inside the oval.");
          } else if (res.status === "MULTIPLE_FACES") {
            setFeedback("\u26A0\uFE0F Multiple faces detected. Keep only 1 person in frame.");
          } else if (res.status === "TOO_FAR") {
            setFeedback("Move closer to the camera.");
          }
        } catch (e) {
        }
      }
      detectionLoopRef.current = requestAnimationFrame(loop);
    }
    detectionLoopRef.current = requestAnimationFrame(loop);
  }
  function captureFacePhotoBlob(videoEl, box) {
    return new Promise((resolve) => {
      try {
        if (!videoEl || !videoEl.videoWidth) return resolve(null);
        const canvas = document.createElement("canvas");
        const vWidth = videoEl.videoWidth;
        const vHeight = videoEl.videoHeight;
        if (box && box.width && box.height) {
          const padX = box.width * 0.35;
          const padY = box.height * 0.35;
          const sx = Math.max(0, box.x - padX);
          const sy = Math.max(0, box.y - padY);
          const sw = Math.min(vWidth - sx, box.width + padX * 2);
          const sh = Math.min(vHeight - sy, box.height + padY * 2);
          canvas.width = Math.min(sw, 400);
          canvas.height = Math.min(sh, 400);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        } else {
          canvas.width = Math.min(vWidth, 400);
          canvas.height = Math.min(vHeight, 400);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        }
        canvas.toBlob(
          (blob) => resolve(blob),
          "image/jpeg",
          0.85
        );
      } catch (err) {
        console.warn("Could not capture frame blob:", err);
        resolve(null);
      }
    });
  }
  async function handleEnrol() {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setError("");
    try {
      setFeedback("Processing high-quality face descriptor...");
      const res = await detectFaceForEnrolment(videoRef.current);
      if (res.status !== "SUCCESS") {
        throw new Error(res.message || "Face quality check failed. Please reposition.");
      }
      if (Array.isArray(enrolledFaces) && enrolledFaces.length > 0) {
        const faceapi = await getFaceApi();
        let duplicateMatch = null;
        for (const existing of enrolledFaces) {
          if (!existing.descriptor || existing.descriptor.length !== 128) continue;
          const dist = faceapi.euclideanDistance(res.descriptor, existing.descriptor);
          if (dist <= 0.42) {
            duplicateMatch = existing;
            break;
          }
        }
        if (duplicateMatch) {
          const dupMsg = `Duplicate face detected! This face is already enrolled for worker "${duplicateMatch.fullName}" (${duplicateMatch.workerCode}). Multiple workers cannot share the same face.`;
          setError(dupMsg);
          setFeedback("\u26A0\uFE0F Duplicate face rejected.");
          setBusy(false);
          return;
        }
      }
      const payload = {
        score: res.score,
        faceBox: res.box
      };
      const result = await enrolFace(worker._id, res.descriptor, payload);
      if (!worker.hasPhotograph) {
        try {
          const photoBlob = await captureFacePhotoBlob(videoRef.current, res.box);
          if (photoBlob) {
            await uploadWorkerPhoto(worker._id, photoBlob);
          }
        } catch (photoErr) {
          console.warn("Face enrolled, but auto-photo capture upload failed:", photoErr);
        }
      }
      setEnrolled(true);
      setFeedback(`\u2713 ${result.message}`);
      setTimeout(() => {
        onSaved(result.message);
      }, 1200);
    } catch (err) {
      const msg = err.message || "Failed to enrol face. Please retry.";
      setError(msg);
      setFeedback(msg.includes("Duplicate face") ? "\u26A0\uFE0F Duplicate face rejected." : "Enrolment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function handleClear() {
    if (!window.confirm(`Are you sure you want to clear the face registration for ${worker.fullName}?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await clearFaceRegistration(worker._id);
      onSaved(res.message);
    } catch (err) {
      setError(err.message || "Failed to clear face registration.");
    } finally {
      setBusy(false);
    }
  }
  const isAligned = faceDetection?.status === "SUCCESS";
  return /* @__PURE__ */ React.createElement(Dialog, { title: "Enrol face recognition", onClose, busy, maxWidth: "max-w-xl" }, /* @__PURE__ */ React.createElement("div", { className: "flex w-full flex-col" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-semibold text-slate-500 mb-1" }, worker.fullName, " \xB7 ", worker.workerCode), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 py-1" }, error && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `rounded-xl border p-3 text-xs flex items-start gap-2.5 ${error.includes("Duplicate face") ? "border-rose-300 bg-rose-50 text-rose-800" : "border-red-200 bg-red-50 text-red-700"}`
    },
    /* @__PURE__ */ React.createElement("span", { className: "text-base leading-none" }, "\u26A0\uFE0F"),
    /* @__PURE__ */ React.createElement("div", { className: "flex-1" }, error.includes("Duplicate face") && /* @__PURE__ */ React.createElement("div", { className: "font-bold text-rose-900 mb-0.5" }, "Duplicate Face Warning"), /* @__PURE__ */ React.createElement("span", null, error))
  ), cameraError ? /* @__PURE__ */ React.createElement("div", { className: "rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800" }, /* @__PURE__ */ React.createElement("p", { className: "font-semibold" }, "Camera Unavailable"), /* @__PURE__ */ React.createElement("p", { className: "mt-1 text-xs text-amber-700" }, cameraError), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => startCamera(facingMode),
      className: "mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
    },
    "Retry Camera"
  )) : /* @__PURE__ */ React.createElement("div", { className: "relative mx-auto flex h-60 sm:h-72 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-slate-900 shadow-inner" }, /* @__PURE__ */ React.createElement(
    "video",
    {
      ref: videoRef,
      playsInline: true,
      muted: true,
      autoPlay: true,
      className: `h-full w-full object-cover ${facingMode === "user" ? "scale-x-[-1]" : ""}`
    }
  ), /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `pointer-events-none absolute h-48 sm:h-52 w-36 sm:w-40 rounded-[50%] border-2 transition-colors duration-200 ${isAligned ? "border-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(52,211,153,0.5)]" : faceDetection?.status === "MULTIPLE_FACES" ? "border-amber-400 bg-amber-500/10" : "border-white/60 bg-transparent"}`
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: toggleCamera,
      title: "Switch Camera",
      className: "absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur-md hover:bg-slate-950/80"
    },
    "\u{1F504}"
  ), /* @__PURE__ */ React.createElement("div", { className: "absolute bottom-2 inset-x-3 rounded-lg bg-slate-950/75 py-1.5 px-3 text-center text-xs font-medium text-white backdrop-blur-xs" }, feedback)), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-slate-500" }, "Status:"), /* @__PURE__ */ React.createElement(
    "span",
    {
      className: `font-semibold ${worker.faceStatus === "REGISTERED" ? "text-emerald-700" : worker.faceStatus === "RE_REGISTRATION_REQUIRED" ? "text-amber-700" : "text-slate-500"}`
    },
    worker.faceStatus === "REGISTERED" ? "\u2713 Registered" : worker.faceStatus === "RE_REGISTRATION_REQUIRED" ? "Re-registration Required" : "Not Registered"
  )), !worker.hasPhotograph && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" }, "\u{1F4F7} Auto-saves photo"))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2.5 border-t border-slate-100 bg-slate-50 p-3 rounded-b-xl -mx-2 -mb-2 sm:-mx-3 sm:-mb-3 mt-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: busy || !cameraActive || !isAligned || enrolled,
      onClick: handleEnrol,
      className: `w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold text-white shadow-sm transition active:scale-[0.98] cursor-pointer ${isAligned && !busy && !enrolled ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20" : "cursor-not-allowed bg-slate-300 text-slate-500"}`
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F4F7}"),
    /* @__PURE__ */ React.createElement("span", null, busy ? "Enrolling..." : enrolled ? "\u2713 Enrolled" : "Capture & Enrol Face")
  ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-2" }, worker.faceStatus === "REGISTERED" ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: busy,
      onClick: handleClear,
      className: "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer py-1",
      title: "Remove enrolled face"
    },
    /* @__PURE__ */ React.createElement("span", null, "\u{1F5D1}\uFE0F"),
    /* @__PURE__ */ React.createElement("span", null, "Clear Face Data")
  ) : /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: busy,
      onClick: onClose,
      "aria-label": "Close dialog",
      className: "whitespace-nowrap rounded-xl border border-slate-300 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 active:scale-95 transition cursor-pointer shadow-xs text-center"
    },
    enrolled ? "Done" : "Cancel"
  )))));
}

import React, { useRef, useEffect, useState } from 'react';
import { AsciiOptions } from '../types';
import { getAsciiChar } from '../utils/asciiConverter';
import { playStartupSound, playScanSound, startAmbientHum, stopAmbientHum } from '../utils/soundEffects';
import { ScanEye, Camera, FileText, Upload, Video } from 'lucide-react';
import { uploadOriginalImageToCloudinary } from '../services/cloudinaryService';

interface AsciiCanvasProps {
  options: AsciiOptions;
  onCapture: (imageData: string) => void;
}

export const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ options, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null); // For processing pixels
  const prevFrameRef = useRef<Float32Array | null>(null); // Store previous frame for smoothing
  const uploadedImageUrlRef = useRef<string | null>(null);
  const asciiTextRef = useRef('');
  const animationRef = useRef<number>();
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'camera' | 'image'>('camera');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const getCameraErrorMessage = (err: unknown) => {
      if (!window.isSecureContext) {
        return "Camera needs a secure origin. Open this app on localhost or HTTPS, not a local IP over HTTP.";
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        return "This browser does not support camera access.";
      }

      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            return "Camera permission was denied. Allow camera access in your browser site settings and reload.";
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            return "No camera device was found on this system.";
          case 'NotReadableError':
          case 'TrackStartError':
            return "Camera is busy or blocked by another app.";
          case 'OverconstrainedError':
          case 'ConstraintNotSatisfiedError':
            return "Requested camera settings are not supported on this device.";
          case 'SecurityError':
            return "Browser security blocked camera access. Use localhost or HTTPS.";
          default:
            return `Camera access failed: ${err.name}`;
        }
      }

      return "Unable to access camera due to an unknown browser or device error.";
    };

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("This browser does not support camera access.");
          return;
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 }, 
              facingMode: 'user' 
            } 
          });
        } catch (err) {
          // Some browsers/devices reject facingMode or detailed constraints.
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Ensure video actually plays
          await videoRef.current.play().catch(e => console.error("Play error:", e));
          
          // Play sci-fi startup sound when camera is ready
          playStartupSound();
          // Start the continuous background hum
          startAmbientHum();
          setError(null);
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError(getCameraErrorMessage(err));
      }
    };

    startCamera();

    return () => {
      if (uploadedImageUrlRef.current) {
        URL.revokeObjectURL(uploadedImageUrlRef.current);
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      stopAmbientHum();
    };
  }, []);

  // Handle Canvas Resizing
  useEffect(() => {
    const handleResize = () => {
        if (canvasRef.current) {
            // Check parent size to avoid scrollbar issues, fallback to window
            const parent = canvasRef.current.parentElement;
            if (parent) {
                canvasRef.current.width = parent.clientWidth;
                canvasRef.current.height = parent.clientHeight;
            } else {
                canvasRef.current.width = window.innerWidth;
                canvasRef.current.height = window.innerHeight;
            }
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Reset smoothing buffer when dimensions likely change
    prevFrameRef.current = null;
  }, [options.fontSize]);

  useEffect(() => {
    const renderLoop = () => {
      const video = videoRef.current;
      const image = imageRef.current;
      const canvas = canvasRef.current;
      const hiddenCanvas = hiddenCanvasRef.current;
      const renderSource = sourceType === 'image' ? image : video;
      const sourceReady = sourceType === 'image'
        ? Boolean(image && image.complete && image.naturalWidth > 0)
        : Boolean(video && video.readyState >= 2);
      
      if (!renderSource || !canvas || !hiddenCanvas || !sourceReady) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      const hiddenCtx = hiddenCanvas.getContext('2d', { willReadFrequently: true });

      if (!ctx || !hiddenCtx) {
          animationRef.current = requestAnimationFrame(renderLoop);
          return;
      }

      // Determine processing resolution
      const charHeight = options.fontSize;
      const charWidth = charHeight * 0.6; // Approximation for monospace aspect ratio
      
      const cols = Math.floor(canvas.width / charWidth);
      const rows = Math.floor(canvas.height / charHeight);

      // Safety check for zero dimensions
      if (cols <= 0 || rows <= 0) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      // Set hidden canvas size to the number of chars (cols x rows)
      if (hiddenCanvas.width !== cols || hiddenCanvas.height !== rows) {
        hiddenCanvas.width = cols;
        hiddenCanvas.height = rows;
        prevFrameRef.current = null; // Reset smoothing buffer on resize
      }

      // 1. Draw source to small hidden canvas
      if (sourceType === 'camera') {
        // We flip the live camera horizontally for a natural mirror effect.
        hiddenCtx.save();
        hiddenCtx.translate(cols, 0);
        hiddenCtx.scale(-1, 1);
        hiddenCtx.drawImage(renderSource, 0, 0, cols, rows);
        hiddenCtx.restore();
      } else {
        hiddenCtx.drawImage(renderSource, 0, 0, cols, rows);
      }
      
      // 2. Get pixel data
      const frameData = hiddenCtx.getImageData(0, 0, cols, rows);
      const data = frameData.data;

      // --- TEMPORAL SMOOTHING START ---
      // Blend current frame with previous frame to reduce ASCII jitter
      const pixelCount = data.length;
      
      // Initialize buffer if needed
      if (!prevFrameRef.current || prevFrameRef.current.length !== pixelCount) {
        prevFrameRef.current = new Float32Array(pixelCount);
        for(let i=0; i<pixelCount; i++) prevFrameRef.current[i] = data[i];
      }

      const prev = prevFrameRef.current;
      // Smoothing factor: 0.0 = no smoothing, 0.9 = very slow trails. 
      // 0.75 provides a very smooth, liquid-like effect.
      const inertia = 0.75; 

      for (let i = 0; i < pixelCount; i++) {
        // Simple Low-pass filter
        // val = prev + (target - prev) * (1 - inertia)
        const target = data[i];
        const current = prev[i];
        const newValue = current + (target - current) * (1 - inertia);
        
        prev[i] = newValue;
        data[i] = newValue; // Update the view for rendering
      }
      // --- TEMPORAL SMOOTHING END ---

      // 3. Clear main canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 4. Setup Font
      ctx.font = `${options.fontSize}px 'JetBrains Mono', monospace`;
      ctx.textBaseline = 'top';

      // 5. Build and Draw ASCII
      const contrastFactor = (259 * (options.contrast * 255 + 255)) / (255 * (259 - options.contrast * 255));
      const asciiRows: string[] = new Array(rows);

      if (options.colorMode === 'color') {
          // Full Color Mode
          for (let y = 0; y < rows; y++) {
            let rowText = "";
            for (let x = 0; x < cols; x++) {
                const offset = (y * cols + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                
                // Calculate brightness
                let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                brightness = contrastFactor * (brightness - 128) + 128;
                brightness *= options.brightness;
                brightness = Math.max(0, Math.min(255, brightness));

                const char = getAsciiChar(brightness, options.density);
                rowText += char;
                
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillText(char, x * charWidth, y * charHeight);
            }
            asciiRows[y] = rowText;
          }
      } else {
          // Monochromatic / Matrix Modes
          if (options.colorMode === 'matrix') ctx.fillStyle = '#00ff41'; // Matrix Green
          else if (options.colorMode === 'retro') ctx.fillStyle = '#ffb000'; // Amber
          else ctx.fillStyle = '#ffffff'; // BW

          for (let y = 0; y < rows; y++) {
            let rowText = "";
            for (let x = 0; x < cols; x++) {
                const offset = (y * cols + x) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                
                let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                brightness = contrastFactor * (brightness - 128) + 128;
                brightness *= options.brightness;
                brightness = Math.max(0, Math.min(255, brightness));

                rowText += getAsciiChar(brightness, options.density);
            }
            asciiRows[y] = rowText;
            ctx.fillText(rowText, 0, y * charHeight);
          }
      }

      asciiTextRef.current = asciiRows.join('\n');

      animationRef.current = requestAnimationFrame(renderLoop);
    };

    animationRef.current = requestAnimationFrame(renderLoop);

    // Cleanup function to prevent zombie loops when options change
    return () => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
    };
  }, [options, sourceType]);

  const handleCaptureClick = () => {
    if (canvasRef.current) {
        playScanSound();
        // We capture the visible canvas (The ASCII Art)
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onCapture(dataUrl);
    }
  };

  const handleScreenshotClick = () => {
    if (canvasRef.current) {
      playScanSound();
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ascii_world_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleTextDownloadClick = () => {
    if (!asciiTextRef.current) {
      return;
    }

    playScanSound();
    const blob = new Blob([asciiTextRef.current], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ascii_world_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUseCameraClick = () => {
    setSourceType('camera');
    setUploadStatus(null);
    prevFrameRef.current = null;
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file.');
      event.target.value = '';
      return;
    }

    setError(null);
    prevFrameRef.current = null;

    if (uploadedImageUrlRef.current) {
      URL.revokeObjectURL(uploadedImageUrlRef.current);
    }

    const localUrl = URL.createObjectURL(file);
    uploadedImageUrlRef.current = localUrl;

    if (imageRef.current) {
      imageRef.current.src = localUrl;
    }

    setSourceType('image');
    setUploadStatus('Hold on.. We are generating..');

    try {
      await uploadOriginalImageToCloudinary(file);
      setUploadStatus('Here is your ascii art.');
    } catch (uploadError) {
      console.error('Failed to generate:', uploadError);
      setUploadStatus('ASCII preview loaded.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="relative w-full h-full bg-black">
        {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-500 z-50">
                <p>{error}</p>
            </div>
        )}
        {uploadStatus && (
            <div className="absolute top-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-green-500/20 bg-black/72 px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] text-green-400 shadow-[0_18px_45px_rgba(0,0,0,0.45),0_0_24px_rgba(0,255,65,0.08)] backdrop-blur-xl">
                {uploadStatus}
            </div>
        )}
        {/* Important: Video must not be display:none for textures to update in some browsers. 
            Using opacity-0 and z-index -1 keeps it in the DOM but invisible. */}
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 opacity-0 pointer-events-none -z-10 w-1 h-1" 
            playsInline 
            autoPlay 
            muted 
        />
        <img
            ref={imageRef}
            alt="Uploaded source"
            className="absolute top-0 left-0 opacity-0 pointer-events-none -z-10 w-1 h-1"
        />
        <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageFileChange}
            className="hidden"
        />
        <canvas ref={hiddenCanvasRef} className="hidden" />
        <canvas ref={canvasRef} className="block w-full h-full" />
        
        {/* Floating Controls Container */}
        <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 flex items-center gap-6 z-40">
            <button 
                onClick={handleImageUploadClick}
                className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                title="Upload Image"
            >
                <Upload className="w-6 h-6" />
            </button>

            {sourceType === 'image' && (
                <button 
                    onClick={handleUseCameraClick}
                    className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                    title="Return to Live Camera"
                >
                    <Video className="w-6 h-6" />
                </button>
            )}

            <button 
                onClick={handleTextDownloadClick}
                className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                title="Save ASCII Text"
            >
                <FileText className="w-6 h-6" />
            </button>

            {/* Screenshot Button */}
            <button 
                onClick={handleScreenshotClick}
                className="bg-black/60 hover:bg-green-900/80 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 hover:scale-105 hover:shadow-[0_0_15px_rgba(0,255,0,0.3)]"
                title="Save Snapshot"
            >
                <Camera className="w-6 h-6" />
            </button>

            {/* Scan & Analyze Button (Primary) */}
            <button 
                onClick={handleCaptureClick}
                className="bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/50 p-4 rounded-full backdrop-blur-md transition-all active:scale-95 group relative hover:shadow-[0_0_25px_rgba(0,255,0,0.5)]"
                title="Scan & Analyze"
            >
                <div className="absolute inset-0 rounded-full border border-green-500 opacity-50 animate-ping"></div>
                <ScanEye className="w-6 h-6" />
            </button>
        </div>
    </div>
  );
};

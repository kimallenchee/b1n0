import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const F = '"DM Sans", sans-serif'
const TARGET_W = 1200
const TARGET_H = 630
const ASPECT = TARGET_W / TARGET_H // ~1.9

interface ImageCropperProps {
  file: File
  onCropped: (blob: Blob) => void
  onCancel: () => void
}

export function ImageCropper({ file, onCropped, onCancel }: ImageCropperProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [dragging, setDragging] = useState<'move' | 'resize' | null>(null)
  const [dragStart, setDragStart] = useState({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    const img = new Image()
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
      // Initial crop: max area with correct aspect ratio, centered
      const imgAspect = img.naturalWidth / img.naturalHeight
      let cw: number, ch: number
      if (imgAspect > ASPECT) {
        ch = img.naturalHeight
        cw = ch * ASPECT
      } else {
        cw = img.naturalWidth
        ch = cw / ASPECT
      }
      setCrop({ x: (img.naturalWidth - cw) / 2, y: (img.naturalHeight - ch) / 2, w: cw, h: ch })
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Scale factor: displayed size vs natural size
  const getScale = useCallback(() => {
    if (!imgRef.current || imgSize.w === 0) return 1
    return imgRef.current.clientWidth / imgSize.w
  }, [imgSize.w])

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation()
    setDragging(type)
    setDragStart({ mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h })
  }, [crop])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const scale = getScale()
    const dx = (e.clientX - dragStart.mx) / scale
    const dy = (e.clientY - dragStart.my) / scale

    if (dragging === 'move') {
      const nx = Math.max(0, Math.min(imgSize.w - dragStart.cw, dragStart.cx + dx))
      const ny = Math.max(0, Math.min(imgSize.h - dragStart.ch, dragStart.cy + dy))
      setCrop(c => ({ ...c, x: nx, y: ny }))
    } else {
      // Resize from bottom-right, maintain aspect
      const nw = Math.max(100, Math.min(imgSize.w - dragStart.cx, dragStart.cw + dx))
      const nh = nw / ASPECT
      if (dragStart.cy + nh <= imgSize.h) {
        setCrop(c => ({ ...c, w: nw, h: nh }))
      }
    }
  }, [dragging, dragStart, getScale, imgSize])

  const handleMouseUp = useCallback(() => setDragging(null), [])

  const handleCrop = useCallback(() => {
    if (!imgSrc) return
    const canvas = document.createElement('canvas')
    canvas.width = TARGET_W
    canvas.height = TARGET_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, TARGET_W, TARGET_H)
      canvas.toBlob((blob) => {
        if (blob) onCropped(blob)
      }, 'image/jpeg', 0.85)
    }
    img.src = imgSrc
  }, [imgSrc, crop, onCropped])

  if (!imgSrc) return null

  const scale = getScale()

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ background: 'var(--b1n0-card)', borderRadius: '16px', padding: '24px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: F, fontSize: '14px', fontWeight: 700, color: 'var(--b1n0-text-1)' }}>Recortar imagen</p>
          <p style={{ fontFamily: F, fontSize: '11px', color: 'var(--b1n0-muted)' }}>1200 x 630px</p>
        </div>

        {/* Image + crop overlay */}
        <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', maxWidth: '700px', maxHeight: '500px', overflow: 'hidden' }}>
          <img
            ref={imgRef}
            src={imgSrc}
            alt=""
            style={{ display: 'block', maxWidth: '700px', maxHeight: '500px', objectFit: 'contain' }}
            draggable={false}
          />
          {/* Dark overlay outside crop */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
            {/* Top */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: crop.y * scale, background: 'rgba(0,0,0,0.5)' }} />
            {/* Bottom */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(0, (imgSize.h - crop.y - crop.h) * scale), background: 'rgba(0,0,0,0.5)' }} />
            {/* Left */}
            <div style={{ position: 'absolute', top: crop.y * scale, left: 0, width: crop.x * scale, height: crop.h * scale, background: 'rgba(0,0,0,0.5)' }} />
            {/* Right */}
            <div style={{ position: 'absolute', top: crop.y * scale, right: 0, width: Math.max(0, (imgSize.w - crop.x - crop.w) * scale), height: crop.h * scale, background: 'rgba(0,0,0,0.5)' }} />
          </div>
          {/* Crop box */}
          <div
            style={{
              position: 'absolute',
              left: crop.x * scale, top: crop.y * scale,
              width: crop.w * scale, height: crop.h * scale,
              border: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
              cursor: dragging === 'move' ? 'grabbing' : 'grab',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
          >
            {/* Grid lines */}
            <div style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ position: 'absolute', top: '66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ position: 'absolute', left: '33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
            <div style={{ position: 'absolute', left: '66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
            {/* Resize handle */}
            <div
              style={{ position: 'absolute', bottom: -6, right: -6, width: 12, height: 12, background: '#fff', borderRadius: '2px', cursor: 'nwse-resize', border: '1px solid rgba(255,255,255,0.1)' }}
              onMouseDown={(e) => handleMouseDown(e, 'resize')}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--b1n0-border)', background: 'transparent', fontFamily: F, fontWeight: 600, fontSize: '13px', color: 'var(--b1n0-muted)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleCrop} style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'var(--b1n0-text-1)', fontFamily: F, fontWeight: 600, fontSize: '13px', color: '#fff', cursor: 'pointer' }}>
            Recortar y subir
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

import { useState, useEffect } from 'react'

const IMAGES = ['/otter1.png', '/otter2.png', '/otter3.png', '/otter4.png', '/otter5.png']
const DISPLAY_MS = 4000
const FADE_MS    = 600

// Two layers (A / B) sit on top of each other.
// The visible one fades out while the hidden one fades in simultaneously.
// After the fade, the now-hidden layer silently loads the next upcoming image.
export function OtterCarousel({ size = 120 }: { size?: number }) {
  const [layers, setLayers] = useState<{ a: number; b: number; showing: 'a' | 'b' }>({
    a: 0, b: 1, showing: 'a',
  })

  useEffect(() => {
    let counter = 2   // next image index to preload into the hidden slot

    const id = setInterval(() => {
      // 1) Swap which layer is visible — CSS transition handles the cross-fade
      setLayers(prev => ({ ...prev, showing: prev.showing === 'a' ? 'b' : 'a' }))

      // 2) Once the fade finishes, quietly load the upcoming image into the hidden layer
      const nextImg = counter % IMAGES.length
      counter = (counter + 1) % IMAGES.length

      setTimeout(() => {
        setLayers(prev => {
          // after the swap, prev.showing is already the NEW showing layer
          if (prev.showing === 'a') {
            // a is visible → b is hidden → load next into b
            return { ...prev, b: nextImg }
          } else {
            // b is visible → a is hidden → load next into a
            return { ...prev, a: nextImg }
          }
        })
      }, FADE_MS + 50)
    }, DISPLAY_MS)

    return () => clearInterval(id)
  }, [])

  const base = {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    mixBlendMode: 'multiply' as const,
    transition: `opacity ${FADE_MS}ms ease`,
    userSelect: 'none' as const,
    pointerEvents: 'none' as const,
  }

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <img src={IMAGES[layers.a]} alt="" draggable={false}
        style={{ ...base, opacity: layers.showing === 'a' ? 1 : 0 }} />
      <img src={IMAGES[layers.b]} alt="" draggable={false}
        style={{ ...base, opacity: layers.showing === 'b' ? 1 : 0 }} />
    </div>
  )
}

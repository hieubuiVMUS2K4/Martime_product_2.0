import { useRef, type PointerEvent, type MouseEvent } from 'react'

/** Touch uses browser panning. Mouse/pen dragging adds the same interaction to dropdowns. */
export function useDragScroll() {
  const gesture = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null)

  const finish = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      gesture.current = null
      if (event.pointerType === 'touch' || event.button !== 0) return
      const region = event.currentTarget
      gesture.current = {
        pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        left: region.scrollLeft, top: region.scrollTop, moved: false,
      }
      // Keep the combobox input focused until an option is deliberately selected.
      event.preventDefault()
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const drag = gesture.current
      if (!drag || drag.pointerId !== event.pointerId || !event.buttons) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < 6) return
      drag.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.scrollLeft = drag.left - dx
      event.currentTarget.scrollTop = drag.top - dy
      event.preventDefault()
    },
    onPointerUp: finish,
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      finish(event)
      gesture.current = null
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (gesture.current?.moved) {
        event.preventDefault()
        event.stopPropagation()
      }
      gesture.current = null
    },
  }
}

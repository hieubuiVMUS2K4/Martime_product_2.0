import { useEffect } from 'react'

type ScrollRegion = { element: HTMLElement; left: number; top: number; horizontal: boolean; vertical: boolean }
type Gesture = { pointerId: number; x: number; y: number; touch: boolean; regions: ScrollRegion[]; capture: HTMLElement }

/** One gesture owner for the workspace and its portalled dialogs. Touch retains native inertia. */
export function useExecuteHandPan() {
  useEffect(() => {
    let gesture: Gesture | null = null
    let dragged = false
    const inWorkspace = (target: EventTarget | null) => target instanceof Element && !!target.closest('.execute-work-orders, .edge-modal-overlay, .execute-work-order-filter')
    const editable = (target: Element) => !!target.closest('textarea, select, [contenteditable=true], input:not([type=checkbox]):not([type=radio]), [role=slider]')
    const release = () => {
      if (gesture?.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId)
      gesture = null
      document.body.classList.remove('execute-hand-dragging')
    }
    const down = (event: PointerEvent) => {
      release()
      dragged = false
      if (!inWorkspace(event.target) || !(event.target instanceof Element) || editable(event.target) || event.button !== 0 || !event.isPrimary) return
      const regions: ScrollRegion[] = []
      for (let element = event.target as HTMLElement | null; element && element !== document.body; element = element.parentElement) {
        const style = getComputedStyle(element)
        const horizontal = /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth + 1
        const vertical = /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1
        if (horizontal || vertical) regions.push({ element, horizontal, vertical, left: element.scrollLeft, top: element.scrollTop })
      }
      if (!regions.length) return
      gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', regions, capture: regions[0].element }
      // Preserve the focused combobox while dragging its options. Clicks still activate on release.
      if (!gesture.touch) event.preventDefault()
    }
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
      if (!dragged && Math.hypot(dx, dy) < 8) return
      dragged = true
      if (gesture.touch) return
      gesture.capture.setPointerCapture(event.pointerId)
      document.body.classList.add('execute-hand-dragging')
      const horizontal = gesture.regions.find(region => region.horizontal)
      const vertical = gesture.regions.find(region => region.vertical)
      if (horizontal) horizontal.element.scrollLeft = horizontal.left - dx
      if (vertical) vertical.element.scrollTop = vertical.top - dy
      event.preventDefault()
    }
    const finish = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) release() }
    const click = (event: MouseEvent) => {
      if (dragged && event.detail > 0 && inWorkspace(event.target)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      dragged = false
    }
    const dragStart = (event: DragEvent) => { if (inWorkspace(event.target) && event.target instanceof Element && !editable(event.target)) event.preventDefault() }
    document.body.classList.add('execute-hand-mode')
    document.addEventListener('pointerdown', down, { capture: true, passive: false })
    document.addEventListener('pointermove', move, { capture: true, passive: false })
    document.addEventListener('pointerup', finish, true)
    document.addEventListener('pointercancel', finish, true)
    document.addEventListener('click', click, true)
    document.addEventListener('dragstart', dragStart, true)
    window.addEventListener('blur', release)
    return () => {
      release()
      document.body.classList.remove('execute-hand-mode')
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', finish, true)
      document.removeEventListener('pointercancel', finish, true)
      document.removeEventListener('click', click, true)
      document.removeEventListener('dragstart', dragStart, true)
      window.removeEventListener('blur', release)
    }
  }, [])
}

var swipeGestureTimeout = -1

var horizontalMouseMove = 0
var verticalMouseMove = 0

var beginningScrollLeft = null
var beginningScrollRight = null

var hasShownSwipeArrow  = false

function resetCounters () {
  horizontalMouseMove = 0
  verticalMouseMove = 0

  beginningScrollLeft = null
  beginningScrollRight = null

  hasShownSwipeArrow = false
}

function onSwipeGestureFinish () {

  // swipe to the left to go forward
  if (horizontalMouseMove - beginningScrollRight > 150 && Math.abs(horizontalMouseMove / verticalMouseMove) > 2.5) {
    if (beginningScrollRight < 10) {
      resetCounters()
      ipc.sendToHost('goForward')
    }
  }

  // swipe to the right to go backwards
  if (horizontalMouseMove + beginningScrollLeft < -150 && Math.abs(horizontalMouseMove / verticalMouseMove) > 2.5) {
    if (beginningScrollLeft < 10) {
      resetCounters()
      ipc.sendToHost('goBack')
    }
  }

  resetCounters()
}

window.addEventListener('wheel', function (e) {
  verticalMouseMove += e.deltaY
  horizontalMouseMove += e.deltaX

  if (!beginningScrollLeft || !beginningScrollRight) {
    beginningScrollLeft = document.scrollingElement.scrollLeft
    beginningScrollRight = document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth - document.scrollingElement.scrollLeft
  }

  if (Math.abs(e.deltaX) >= 20 || Math.abs(e.deltaY) >= 20) {
    clearTimeout(swipeGestureTimeout)

    if (horizontalMouseMove < -150 && Math.abs(horizontalMouseMove / verticalMouseMove) > 2.5 && !hasShownSwipeArrow) {
      hasShownSwipeArrow = true
      ipc.sendToHost('showBackArrow')
    } else if (horizontalMouseMove > 150 && Math.abs(horizontalMouseMove / verticalMouseMove) > 2.5 && !hasShownSwipeArrow) {
      hasShownSwipeArrow = true
      ipc.sendToHost('showForwardArrow')
    }

    swipeGestureTimeout = setTimeout(onSwipeGestureFinish, 70)
  }

  /* default zoom modifier is ctrl. Mac uses cmd/meta/super so an exeption will be made below */
  var platformZoomKey = e.ctrlKey

  /* if platform is Mac, enable pinch zoom
  	the browser engine detects pinches as ctrl+mousewheel on Mac,
  	therefore, it should not affect other platforms that uses ctrl+mousewheel to zoom.
  */
  if (navigator.platform === 'MacIntel') {
    if (e.ctrlKey && !e.defaultPrevented) {
      if (verticalMouseMove > 10) {
        zoomOut()
        verticalMouseMove = 0
      }
      if (verticalMouseMove < -10) {
        zoomIn()
        verticalMouseMove = 0
      }

      e.preventDefault()
    }
    platformZoomKey = e.metaKey
  }
  /* cmd-key while scrolling should zoom in and out */

  if (verticalMouseMove > 55 && platformZoomKey) {
    verticalMouseMove = -10
    zoomOut()
  }

  if (verticalMouseMove < -55 && platformZoomKey) {
    verticalMouseMove = -10
    zoomIn()
  }

  if (platformZoomKey) {
    e.preventDefault()
  }
})

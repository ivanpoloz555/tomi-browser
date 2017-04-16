window.electron = require('electron')
window.ipc = electron.ipcRenderer
window.remote = electron.remote
window.Dexie = require('dexie')

// disable dragdrop, since it currently doesn't work
window.addEventListener('drop', function (e) {
  e.preventDefault()
})

// add a class to the body for fullscreen status

ipc.on('enter-full-screen', function () {
  document.body.classList.add('fullscreen')
})

ipc.on('leave-full-screen', function () {
  document.body.classList.remove('fullscreen')
})

window.addEventListener('load', function (e) {
  if (navigator.platform !== 'MacIntel') {
    document.body.classList.add('notMac')
  }
})

// work around https://github.com/electron/electron/issues/5900

window.addEventListener('focus', function () {
  // if nothing in the UI is focused, focus the current tab's webview
  if (document.activeElement === document.body) {
    getWebview(tabs.getSelected()).focus()
  }
})

// https://remysharp.com/2010/07/21/throttling-function-calls

function throttle (fn, threshhold, scope) {
  threshhold || (threshhold = 250)
  var last,
    deferTimer
  return function () {
    var context = scope || this

    var now = new Date()
    var args = arguments
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer)
      deferTimer = setTimeout(function () {
        last = now
        fn.apply(context, args)
      }, threshhold)
    } else {
      last = now
      fn.apply(context, args)
    }
  }
}

// https://remysharp.com/2010/07/21/throttling-function-calls

function debounce (fn, delay) {
  var timer = null
  return function () {
    var context = this
    var args = arguments
    clearTimeout(timer)
    timer = setTimeout(function () {
      fn.apply(context, args)
    }, delay)
  }
}

function empty (node) {
  var n
  while (n = node.firstElementChild) {
    node.removeChild(n)
  }
}

/* prevent a click event from firing after dragging the window */

window.addEventListener('load', function () {
  var isMouseDown = false
  var isDragging = false

  document.body.addEventListener('mousedown', function () {
    isMouseDown = true
    isDragging = false
  })

  var dragHandles = document.getElementsByClassName('windowDragHandle')

  for (var i = 0; i < dragHandles.length; i++) {
    dragHandles[i].addEventListener('mousemove', function () {
      if (isMouseDown) {
        isDragging = true
      }
    })
  }

  document.body.addEventListener('click', function (e) {
    if (isDragging) {
      e.stopImmediatePropagation()
      isDragging = false
    }
  }, true)
})

import { registerPlugin } from '@pexip/plugin-api'

interface DrawingPoint {
  x: number
  y: number
  pressure?: number
}

interface DrawingStroke {
  points: DrawingPoint[]
  color: string
  width: number
  timestamp: number
  userId: string
  userName: string
}

interface WhiteboardState {
  strokes: DrawingStroke[]
  isActive: boolean
  currentStroke?: DrawingStroke
}

let whiteboardState: WhiteboardState = {
  strokes: [],
  isActive: false
}

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let isDrawing = false
let currentStroke: DrawingStroke | null = null
let currentUserId: string = ''
let currentUserName: string = 'Unknown User'
let currentColor: string = '#000000'
let currentWidth: number = 3
let isEraser: boolean = false
let isWhiteBackground: boolean = true
let isPresentationMode: boolean = false

const plugin = await registerPlugin({
  id: 'whiteboard',
  version: 0
})

// Whiteboard icon SVG
const WhiteboardIcon = {
  custom: {
    main: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zm64 0v64h64V96H64zm384 0H192v64H448V96zM64 224v64h64V224H64zm384 0H192v64H448V224zM64 352v64h64V352H64zm384 0H192v64H448V352z" fill="rgb(43, 64, 84)"/></svg>',
    hover: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M0 96C0 60.7 28.7 32 64 32H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96zm64 0v64h64V96H64zm384 0H192v64H448V96zM64 224v64h64V224H64zm384 0H192v64H448V224zM64 352v64h64V352H64zm384 0H192v64H448V352z" fill="white"/></svg>'
  }
}

// Initialize button for all users (can be restricted to hosts later)
const initializeButton = async () => {
  // For now, show button to everyone
  currentUserId = 'user-' + Date.now() // Generate unique user ID
  
  // Get current participant info for name
  try {
    // Temporary name resolution
    currentUserName = 'User ' + Math.floor(Math.random() * 1000)
  } catch (e) {
    console.log('Could not get current participant name, using default')
  }
  
  const button = await plugin.ui.addButton({
    position: 'toolbar',
    tooltip: 'Whiteboard',
    icon: WhiteboardIcon
  })

  button.onClick.add(async () => {
    try {
      if (whiteboardState.isActive) {
        await closeWhiteboard()
      } else {
        await openWhiteboard()
      }
    } catch (e) {
      console.error('Whiteboard button error:', e)
    }
  })
}

// Initialize the button
await initializeButton()

async function openWhiteboard() {
  try {
    // Use current user name for now, will be updated
    let displayName = currentUserName

    // Send message to all participants that whiteboard is being opened
    await plugin.conference.sendApplicationMessage({
      payload: {
        type: 'whiteboard-open',
        userId: currentUserId,
        userName: displayName
      }
    })

    whiteboardState.isActive = true
    createWhiteboardOverlay()
    
    await plugin.ui.showToast({
      message: 'Whiteboard opened - Click and drag to draw. Click Close to exit.',
      isInterrupt: true
    })
  } catch (e) {
    console.error('Error opening whiteboard:', e)
  }
}

async function closeWhiteboard() {
  try {
    // Send message to all participants that whiteboard is being closed
    await plugin.conference.sendApplicationMessage({
      payload: {
        type: 'whiteboard-close',
        userId: currentUserId
      }
    })

    whiteboardState.isActive = false
    removeWhiteboardOverlay()
    
    await plugin.ui.showToast({
      message: 'Whiteboard closed',
      isInterrupt: true
    })
  } catch (e) {
    console.error('Error closing whiteboard:', e)
  }
}

function findPresentationContainer() {
  // Priority order for finding the correct container
  const selectors = [
    'div[data-testid="presentation-video-wrapper"]',
    'div[data-testid="presentation-content"]',
    'div[data-testid="shared-content"]',
    '[data-testid*="presentation"]',
    '[data-testid*="content"]',
    'div[data-testid="in-meeting-video-wrapper"]'
  ]
  
  for (const selector of selectors) {
    const element = parent.document.querySelector(selector)
    if (element) {
      return element
    }
  }
  
  return null
}

function createWhiteboardOverlay() {
  // Try to find the appropriate container based on mode
  let root = null
  
  if (isPresentationMode) {
    // In presentation mode, try to find presentation area first
    root = findPresentationContainer()
  }
  
  // If not found or not in presentation mode, use main video wrapper
  if (!root) {
    root = parent.document.querySelector(
      'div[data-testid="in-meeting-video-wrapper"]'
    )
  }

  if (!root) {
    throw new Error('Could not find video wrapper to attach whiteboard.')
  }

  // Create canvas container
  const container = document.createElement('div')
  container.id = 'whiteboard-container'
  container.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1000;
    pointer-events: auto;
    background: ${isWhiteBackground ? 'white' : 'transparent'};
    border: ${isWhiteBackground ? '2px solid #ccc' : 'none'};
  `

  // Create canvas
  canvas = document.createElement('canvas')
  canvas.id = 'whiteboard-canvas'
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    background: ${isWhiteBackground ? 'white' : 'transparent'};
  `
  
  // Set canvas size to match container
  canvas.width = root.clientWidth
  canvas.height = root.clientHeight
  
  ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Set initial canvas properties
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = isEraser ? (isWhiteBackground ? '#ffffff' : '#000000') : currentColor
  ctx.lineWidth = isEraser ? 10 : currentWidth
  
  // Fill background if white mode
  if (isWhiteBackground) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  container.appendChild(canvas)
  root.appendChild(container)

  // Add event listeners
  canvas.addEventListener('mousedown', startDrawing)
  canvas.addEventListener('mousemove', draw)
  canvas.addEventListener('mouseup', stopDrawing)
  canvas.addEventListener('mouseleave', stopDrawing)

  // Add touch support for mobile
  canvas.addEventListener('touchstart', handleTouchStart)
  canvas.addEventListener('touchmove', handleTouchMove)
  canvas.addEventListener('touchend', handleTouchEnd)

  // Create toolbar
  const toolbar = document.createElement('div')
  toolbar.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1001;
    display: flex;
    gap: 5px;
    background: rgba(0, 0, 0, 0.8);
    padding: 8px;
    border-radius: 8px;
    flex-wrap: wrap;
  `

  // Close button
  const closeButton = document.createElement('button')
  closeButton.textContent = '✕'
  closeButton.title = 'Close Whiteboard'
  closeButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(220, 53, 69, 0.8);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
  `
  closeButton.addEventListener('click', async () => {
    await closeWhiteboard()
  })
  toolbar.appendChild(closeButton)

  // Clear button
  const clearButton = document.createElement('button')
  clearButton.textContent = '🗑️'
  clearButton.title = 'Clear All'
  clearButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  clearButton.addEventListener('click', clearCanvas)
  toolbar.appendChild(clearButton)

  // Undo button
  const undoButton = document.createElement('button')
  undoButton.textContent = '↶'
  undoButton.title = 'Undo Last Stroke'
  undoButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  undoButton.addEventListener('click', undoLastStroke)
  toolbar.appendChild(undoButton)

  // Download button
  const downloadButton = document.createElement('button')
  downloadButton.textContent = '💾'
  downloadButton.title = 'Download Whiteboard'
  downloadButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  downloadButton.addEventListener('click', copyToClipboard)
  toolbar.appendChild(downloadButton)

  // Color palette
  const colors = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500']
  const colorContainer = document.createElement('div')
  colorContainer.style.cssText = `
    display: flex;
    gap: 3px;
    align-items: center;
  `

  colors.forEach(color => {
    const colorButton = document.createElement('button')
    colorButton.style.cssText = `
      width: 24px;
      height: 24px;
      border: 2px solid ${color === currentColor ? '#fff' : '#ccc'};
      border-radius: 50%;
      background: ${color};
      cursor: pointer;
      margin: 0;
    `
    colorButton.title = `Color: ${color}`
    colorButton.addEventListener('click', () => {
      currentColor = color
      isEraser = false
      if (ctx) {
        ctx.strokeStyle = color
        ctx.lineWidth = currentWidth
      }
      updateToolbar()
    })
    colorContainer.appendChild(colorButton)
  })
  toolbar.appendChild(colorContainer)

  // Eraser button
  const eraserButton = document.createElement('button')
  eraserButton.textContent = '🧽'
  eraserButton.title = 'Eraser'
  eraserButton.style.cssText = `
    padding: 8px 12px;
    background: ${isEraser ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.7)'};
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  eraserButton.addEventListener('click', () => {
    isEraser = !isEraser
    if (ctx) {
      if (isEraser) {
        ctx.strokeStyle = isWhiteBackground ? '#ffffff' : '#000000'
        ctx.lineWidth = 10
      } else {
        ctx.strokeStyle = currentColor
        ctx.lineWidth = currentWidth
      }
    }
    updateToolbar()
  })
  toolbar.appendChild(eraserButton)

  // Mode selector button
  const modeButton = document.createElement('button')
  modeButton.textContent = isPresentationMode ? '📊' : '📝'
  modeButton.title = isPresentationMode ? 'Switch to Whiteboard Mode' : 'Switch to Presentation Mode'
  modeButton.style.cssText = `
    padding: 8px 12px;
    background: ${isPresentationMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.7)'};
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  modeButton.addEventListener('click', () => {
    isPresentationMode = !isPresentationMode
    
    // Update button appearance
    modeButton.textContent = isPresentationMode ? '📊' : '📝'
    modeButton.title = isPresentationMode ? 'Switch to Whiteboard Mode' : 'Switch to Presentation Mode'
    modeButton.style.background = isPresentationMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.7)'
    
    // Recreate the overlay to attach to the correct container
    removeWhiteboardOverlay()
    createWhiteboardOverlay()
  })
  toolbar.appendChild(modeButton)

  // Background toggle button (only for whiteboard mode)
  const bgToggleButton = document.createElement('button')
  bgToggleButton.textContent = isWhiteBackground ? '⬜' : '⬛'
  bgToggleButton.title = isWhiteBackground ? 'Switch to Transparent' : 'Switch to White'
  bgToggleButton.style.cssText = `
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `
  bgToggleButton.addEventListener('click', () => {
    if (!isPresentationMode) {
      isWhiteBackground = !isWhiteBackground
      
      // Update button appearance
      bgToggleButton.textContent = isWhiteBackground ? '⬜' : '⬛'
      bgToggleButton.title = isWhiteBackground ? 'Switch to Transparent' : 'Switch to White'
      
      // Update container background
      container.style.background = isWhiteBackground ? 'white' : 'transparent'
      container.style.border = isWhiteBackground ? '2px solid #ccc' : 'none'
      
      // Update canvas background
      canvas!.style.background = isWhiteBackground ? 'white' : 'transparent'
      
      // Update canvas context
      if (ctx) {
        if (isWhiteBackground) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas!.width, canvas!.height)
        } else {
          ctx.clearRect(0, 0, canvas!.width, canvas!.height)
        }
        
        // Update eraser color if active
        if (isEraser) {
          ctx.strokeStyle = isWhiteBackground ? '#ffffff' : '#000000'
        }
      }
    }
  })
  toolbar.appendChild(bgToggleButton)

  // Update toolbar function
  const updateToolbar = () => {
    // Update color buttons
    const colorButtons = colorContainer.querySelectorAll('button')
    colorButtons.forEach((btn, index) => {
      const color = colors[index]
      ;(btn as HTMLElement).style.border = `2px solid ${color === currentColor ? '#fff' : '#ccc'}`
    })
    
    // Update eraser button
    eraserButton.style.background = isEraser ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.7)'
  }

  container.appendChild(toolbar)

  // Keyboard shortcut (WIP)
  const handleKeyDown = async (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      await closeWhiteboard()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  ;(container as any).keydownHandler = handleKeyDown

  // Redraw existing strokes
  redrawCanvas()
}

function removeWhiteboardOverlay() {
  const container = parent.document.getElementById('whiteboard-container')
  if (container) {
    // Remove keyboard event listener
    const keydownHandler = (container as any).keydownHandler
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler)
    }
    container.remove()
  }
  canvas = null
  ctx = null
  isDrawing = false
  currentStroke = null
}

function startDrawing(e: MouseEvent) {
  if (!canvas || !ctx) return
  
  isDrawing = true
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  currentStroke = {
    points: [{ x, y }],
    color: isEraser ? (isPresentationMode ? '#000000' : (isWhiteBackground ? '#ffffff' : '#000000')) : currentColor,
    width: ctx.lineWidth,
    timestamp: Date.now(),
    userId: currentUserId,
    userName: currentUserName
  }

  ctx.beginPath()
  ctx.moveTo(x, y)
}

function draw(e: MouseEvent) {
  if (!isDrawing || !canvas || !ctx || !currentStroke) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  currentStroke.points.push({ x, y })

  ctx.lineTo(x, y)
  ctx.stroke()

  // Send drawing data to other participants
  sendDrawingData(currentStroke)
}

function stopDrawing() {
  if (!isDrawing || !currentStroke) return

  isDrawing = false
  
  // Add final stroke to state
  whiteboardState.strokes.push(currentStroke)
  currentStroke = null
}

function handleTouchStart(e: TouchEvent) {
  e.preventDefault()
  if (!canvas) return
  
  const touch = e.touches[0]
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  })
  canvas.dispatchEvent(mouseEvent)
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault()
  if (!canvas) return
  
  const touch = e.touches[0]
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  })
  canvas.dispatchEvent(mouseEvent)
}

function handleTouchEnd(e: TouchEvent) {
  e.preventDefault()
  if (!canvas) return
  
  const mouseEvent = new MouseEvent('mouseup', {})
  canvas.dispatchEvent(mouseEvent)
}

function sendDrawingData(stroke: DrawingStroke) {
  try {
    plugin.conference.sendApplicationMessage({
      payload: {
        type: 'whiteboard-draw',
        stroke: stroke,
        userId: currentUserId,
        userName: currentUserName
      }
    })
  } catch (e) {
    console.error('Error sending drawing data:', e)
  }
}

function clearCanvas() {
  if (!canvas || !ctx) return

  if (isPresentationMode) {
    // Presentation mode: always transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  } else if (isWhiteBackground) {
    // Whiteboard mode: white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    // Whiteboard mode: transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  whiteboardState.strokes = []

  // Send clear message to other participants
  try {
    plugin.conference.sendApplicationMessage({
      payload: {
        type: 'whiteboard-clear',
        userId: currentUserId
      }
    })
  } catch (e) {
    console.error('Error sending clear message:', e)
  }
}

function undoLastStroke() {
  if (!canvas || !ctx || whiteboardState.strokes.length === 0) return

  // Remove the last stroke
  whiteboardState.strokes.pop()

  // Redraw the canvas without the last stroke
  redrawCanvas()

  // Send undo message to other participants
  try {
    plugin.conference.sendApplicationMessage({
      payload: {
        type: 'whiteboard-undo',
        userId: currentUserId
      }
    })
  } catch (e) {
    console.error('Error sending undo message:', e)
  }
}

function copyToClipboard() {
  if (!canvas) return

  try {
    // Create a temporary canvas to combine background and drawings
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCanvas.width = canvas.width
    tempCanvas.height = canvas.height

    // Fill background
    if (isWhiteBackground) {
      tempCtx.fillStyle = '#ffffff'
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height)
    }

    // Draw all strokes
    for (const stroke of whiteboardState.strokes) {
      if (stroke.points.length === 0) continue

      tempCtx.strokeStyle = stroke.color
      tempCtx.lineWidth = stroke.width
      tempCtx.lineCap = 'round'
      tempCtx.lineJoin = 'round'
      tempCtx.beginPath()
      tempCtx.moveTo(stroke.points[0].x, stroke.points[0].y)

      for (let i = 1; i < stroke.points.length; i++) {
        tempCtx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      tempCtx.stroke()
    }

    // Convert to blob
    tempCanvas.toBlob(async (blob) => {
      if (blob) {
        try {
          // Create a download link as fallback since clipboard doesn't work in iframe lol
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `whiteboard-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`
          a.style.display = 'none'
          
          // Add to parent document and trigger download
          parent.document.body.appendChild(a)
          a.click()
          parent.document.body.removeChild(a)
          URL.revokeObjectURL(url)
          
          plugin.ui.showToast({
            message: 'Whiteboard downloaded! You can copy the image from your downloads.',
            isInterrupt: true
          })
        } catch (e) {
          console.error('Error downloading whiteboard:', e)
          plugin.ui.showToast({
            message: 'Failed to download whiteboard',
            isInterrupt: true
          })
        }
      }
    }, 'image/png')
  } catch (e) {
    console.error('Error preparing clipboard copy:', e)
    plugin.ui.showToast({
      message: 'Error copying whiteboard',
      isInterrupt: true
    })
  }
}

function drawUserName(x: number, y: number, userName: string, strokeColor: string) {
  if (!ctx) return
  
  // Save current context state
  ctx.save()
  
  // Set text properties
  ctx.font = '12px Arial'
  ctx.fillStyle = strokeColor
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  
  // Calculate text position (slightly offset from the stroke end)
  const textX = x + 5
  const textY = y - 5
  
  // Draw text outline for better visibility
  ctx.strokeText(userName, textX, textY)
  
  // Draw text
  ctx.fillText(userName, textX, textY)
  
  // Restore context state
  ctx.restore()
}

function redrawCanvas() {
  if (!canvas || !ctx) return

  // Clear with appropriate background
  if (isPresentationMode) {
    // Presentation mode: always transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  } else if (isWhiteBackground) {
    // Whiteboard mode: white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    // Whiteboard mode: transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  for (const stroke of whiteboardState.strokes) {
    if (stroke.points.length === 0) continue

    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
    }
    ctx.stroke()
    
    // Draw user name only at the very end of the stroke (WIP)
    if (stroke.points.length > 0) {
      const lastPoint = stroke.points[stroke.points.length - 1]
      // Only draw name if this is the last stroke or if it's been more than 2 seconds since the last name
      const timeSinceLastStroke = Date.now() - stroke.timestamp
      if (timeSinceLastStroke > 2000 || stroke === whiteboardState.strokes[whiteboardState.strokes.length - 1]) {
        drawUserName(lastPoint.x, lastPoint.y, stroke.userName, stroke.color)
      }
    }
  }
}

// Handle incoming application messages
plugin.events.applicationMessage.add(async (appMessage) => {
  const message = appMessage.message
  const userId = (appMessage as any).participantId || (appMessage as any).userId || 'unknown'
  const userName = (appMessage as any).displayName || message.userName || 'Unknown User'

  try {
    // Update current user name if this is own message
    if (userId === currentUserId && appMessage.displayName) {
      currentUserName = appMessage.displayName
    }
    
    switch (message.type) {
      case 'whiteboard-open':
        if (userId !== currentUserId) {
          whiteboardState.isActive = true
          createWhiteboardOverlay()
          await plugin.ui.showToast({
            message: `${appMessage.displayName} opened the whiteboard`,
            isInterrupt: true
          })
        }
        break

      case 'whiteboard-close':
        if (userId !== currentUserId) {
          whiteboardState.isActive = false
          removeWhiteboardOverlay()
          await plugin.ui.showToast({
            message: `${appMessage.displayName} closed the whiteboard`,
            isInterrupt: true
          })
        }
        break

      case 'whiteboard-draw':
        if (userId !== currentUserId && canvas && ctx) {
          const stroke = message.stroke as DrawingStroke
          
          // Ensure stroke has userName
          if (!stroke.userName) {
            stroke.userName = userName
          }
          
          // Add stroke to state
          whiteboardState.strokes.push(stroke)
          
          // Draw the stroke
          ctx.strokeStyle = stroke.color
          ctx.lineWidth = stroke.width
          ctx.beginPath()
          
          if (stroke.points.length > 0) {
            ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
            
            for (let i = 1; i < stroke.points.length; i++) {
              ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
            }
          }
          ctx.stroke()
          
          // Draw user name only at the very end of the stroke (WIP)
          if (stroke.points.length > 0) {
            const lastPoint = stroke.points[stroke.points.length - 1]
            // Only draw name if this is the last stroke or if it's been more than 2 seconds since the last name
            const timeSinceLastStroke = Date.now() - stroke.timestamp
            if (timeSinceLastStroke > 2000 || stroke === whiteboardState.strokes[whiteboardState.strokes.length - 1]) {
              drawUserName(lastPoint.x, lastPoint.y, stroke.userName, stroke.color)
            }
          }
        }
        break

      case 'whiteboard-clear':
        if (userId !== currentUserId) {
          whiteboardState.strokes = []
          if (canvas && ctx) {
            if (isPresentationMode) {
              // Presentation mode: always transparent
              ctx.clearRect(0, 0, canvas.width, canvas.height)
            } else if (isWhiteBackground) {
              // Whiteboard mode: white background
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
            } else {
              // Whiteboard mode: transparent
              ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
          }
        }
        break

      case 'whiteboard-undo':
        if (userId !== currentUserId) {
          whiteboardState.strokes.pop()
          redrawCanvas()
        }
        break
    }
  } catch (e) {
    console.error('Error handling application message:', e)
  }
})

// Add CSS styles
const style = document.createElement('link')
style.rel = 'stylesheet'
style.href = getBasePath() + '/style.css'
parent.document.head.appendChild(style)

function getBasePath(): string {
  return window.location.pathname.slice(
    0,
    window.location.pathname.lastIndexOf('/')
  )
} 
# Whiteboard Plugin for Pexip Infinity

A collaborative whiteboard plugin for Pexip Infinity that allows participants to draw on the main conference screen in real-time.

## Features

- **Real-time Collaboration**: All participants can see drawings made by any user
- **Touch Support**: Works on both desktop and mobile devices (with some difficulties, best to stay on desktop)
- **Responsive Design**: Adapts to different screen sizes (again, with some difficulties)
- **Lightweight**: No external dependencies or servers required

## Installation

1. Clone the repo or download it
2. Build it using vite
3. Copy dist to existing webapp branding
4. Reference in manifest
   
## Usage

1. **Opening the Whiteboard**: Click the whiteboard button in the sidebar to open the drawing canvas
2. **Drawing**: Click and drag on the screen to draw. The whiteboard appears as an overlay on the main conference video
3. **Collaboration**: All participants will see the whiteboard and can draw simultaneously
4. **Clearing**: Use the "Clear" button in the top-left corner to reset the whiteboard, or use the eraser, or the undo button. World's your oyster
5. **Closing**: Click the big red cross to close the drawing canvas. I know the popup says ESC also works, don't trust everything websites tell you

## TODO

1. SIP or endpoint functionality
2. Name grabbing, stroke naming
3. Presentation mode change

### Architecture

The plugin uses the Pexip Plugin API to:
- Add a button to the conference toolbar
- Send and receive application messages for real-time synchronization
- Create canvas overlays on the main video area
- Handle mouse and touch events for drawing

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari (at least on iOS 26b4)
- Edge

## Troubleshooting

### Common Issues

1. The button doesn't appear!!! 
   Try again. But seriously, it needs the following permissions for the sandbox: `"sandboxValues": ["allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox", "allow-scripts"]`
2. Logs fill up fast!!!
   Yeah.
4. I found a bug!!! 
   Great, let me know, I'll do my best to fix it

## License

This plugin is provided as-is for use with Pexip Infinity. 

## Support

For issues or questions, please refer to the Pexip Plugin API documentation, contact your Pexip administrator or me.

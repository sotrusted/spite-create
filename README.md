# TBD — Semi-Anonymous, Realtime "Create Mode" Feed

A lightweight, modern meme/posting app with Snapchat/Instagram Create Mode energy and Spite-style realtime feed. Semi-anonymous, chronological, bold typography, edge-to-edge posts.

## Features

- **Semi-Anonymous Posting**: Auto-generated handles like "aqua-otter-931" with colorful avatars
- **Text-to-Image Rendering**: Server-side rendering of styled text posts with custom fonts, colors, and effects
- **Realtime Feed**: WebSocket-powered live updates when new posts arrive
- **Create Mode Composer**: Full-screen post creation with font selection, sizing, colors, and text outlines
- **Moderation System**: Report posts/users, mute functionality, admin panel for content management
- **Mobile-First Design**: Built with React Native/Expo for iOS with responsive design

## Architecture

### Backend (Django)
- **Models**: Custom User model with semi-anonymous features, Post model with styling options
- **API**: REST endpoints for CRUD operations with rate limiting and throttling
- **WebSockets**: Django Channels for realtime feed updates
- **Image Generation**: Pillow-based text-to-image rendering
- **Moderation**: Built-in reporting, shadowbanning, and admin interface

### Frontend (React Native/Expo)
- **Navigation**: Bottom tab navigation with modal post composer
- **Components**: Reusable PostCard, Feed, PostComposer components
- **Styling**: Dark theme with bold typography and vibrant colors
- **Interactions**: Long-press for context menus (report, mute, copy)
- **Real-time**: WebSocket integration for live feed updates

## Quick Start

### Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Activate virtual environment:**
   ```bash
   source venv/bin/activate
   ```

3. **Install dependencies** (already done):
   ```bash
   pip install -r requirements.txt
   ```

4. **Run migrations** (already done):
   ```bash
   python manage.py migrate
   ```

5. **Create superuser for admin:**
   ```bash
   python manage.py createsuperuser
   ```

6. **Start Redis server** (required for WebSockets):
   ```bash
   # Install Redis if not already installed
   brew install redis  # macOS
   redis-server
   ```

7. **Start Django development server:**
   ```bash
   python manage.py runserver
   ```

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies** (already done):
   ```bash
   npm install
   ```

3. **Start Expo development server:**
   ```bash
   npm start
   ```

4. **Run on device/simulator:**
   - **iOS Simulator**: Press `i` in the terminal
   - **Android**: Press `a` in the terminal
   - **Web**: Press `w` in the terminal
   - **Physical Device**: Scan QR code with Expo Go app

## API Endpoints

### Posts
- `POST /api/posts/` - Create new post
- `GET /api/feed/` - Get paginated feed
- `GET /api/posts/{id}/` - Get specific post

### Moderation
- `POST /api/posts/{id}/report/` - Report post
- `POST /api/users/{handle}/report/` - Report user
- `POST /api/users/{handle}/mute/` - Mute user
- `DELETE /api/users/{handle}/unmute/` - Unmute user

### User
- `POST /api/users/create/` - Create anonymous user
- `GET /api/users/profile/` - Get user profile

### WebSocket
- `ws://localhost:8000/ws/feed/` - Realtime feed updates

## Admin Interface

Access the Django admin at `http://localhost:8000/admin/` to:
- View and moderate posts
- Manage user reports and shadowbans
- Monitor system activity
- Bulk moderate content

## Configuration

### Backend Settings
Key settings in `backend/tbd_backend/settings.py`:
- `POST_IMAGE_WIDTH/HEIGHT`: Rendered image dimensions
- `MAX_POST_LENGTH`: Character limit for posts
- `SHADOWBAN_THRESHOLD`: Reports needed for auto-shadowban

### Frontend Config
API URL configured in `frontend/app.json`:
```json
{
  "extra": {
    "apiUrl": "http://localhost:8000"
  }
}
```

## Development Features

### Django Apps
- **users**: Custom user model, anonymous handles, moderation
- **posts**: Post creation, text rendering, feed API, WebSockets

### React Native Structure
```
frontend/src/
├── components/          # Reusable UI components
├── screens/            # Screen components
├── services/           # API and WebSocket services
├── types/              # TypeScript interfaces
├── constants/          # Colors, fonts, configuration
└── config/             # API configuration
```

## Production Considerations

For production deployment:

1. **Security**:
   - Change `SECRET_KEY` in Django settings
   - Set `DEBUG = False`
   - Configure proper CORS origins
   - Use HTTPS for API and WSS for WebSockets

2. **Database**:
   - Switch from SQLite to PostgreSQL
   - Set up database backups

3. **Media Storage**:
   - Use cloud storage (S3, CloudFront) for rendered images
   - Configure CDN for better performance

4. **WebSockets**:
   - Use Redis cluster for scaling
   - Configure WebSocket load balancing

5. **Mobile App**:
   - Build for app stores with EAS Build
   - Configure push notifications
   - Set up error reporting (Sentry)

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update documentation
4. Submit pull requests with clear descriptions

## License

MIT License - see LICENSE file for details.


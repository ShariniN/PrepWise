import express from 'express';
import {
  addNotice,
  getNotices,
  getNoticesByDateRange,
  getUpcomingNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  getEvents
} from '../controllers/noticesController.js';

const noticesRouter = express.Router();

// Special routes - MUST come first to avoid conflicts with parameter routes
noticesRouter.get('/news', async (req, res) => {
  try {
    console.log("NEWS_API_KEY:", process.env.NEWS_API_KEY ? "Set" : "Missing");
    
    if (!process.env.NEWS_API_KEY) {
      return res.status(500).json({ 
        error: "NEWS_API_KEY not configured",
        articles: [] 
      });
    }

    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=20&apiKey=${process.env.NEWS_API_KEY}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("NewsAPI error:", response.status, response.statusText, errorText);
      
      // Return a structured error response instead of throwing
      return res.status(response.status).json({ 
        error: `NewsAPI error: ${response.statusText}`,
        articles: [] 
      });
    }

    const data = await response.json();
    console.log("NewsAPI response success:", data.articles?.length || 0, "articles");
    res.json(data);
    
  } catch (err) {
    console.error("Error fetching news:", err.message);
    res.status(500).json({ 
      error: "Internal server error fetching news",
      articles: [] 
    });
  }
});

// Other special routes
noticesRouter.get('/events', getEvents);                   // Get all events
noticesRouter.get('/upcoming', getUpcomingNotices);        // Get upcoming notices
noticesRouter.get('/search', getNoticesByDateRange);       // Get notices by date range

// Main CRUD routes
noticesRouter.get('/', getNotices);                        // Get all notices
noticesRouter.post('/', addNotice);                        // Add new notice
noticesRouter.put('/:id', updateNotice);                   // Update notice by ID
noticesRouter.delete('/:id', deleteNotice);                // Delete notice by ID

// Admin routes (optional - if you need separate admin endpoints)
noticesRouter.post('/admin/notices', addNotice);           // Admin: Add new notice
noticesRouter.get('/admin/notices', getNotices);           // Admin: Get all notices

// Parameter routes MUST come last to avoid conflicts
noticesRouter.get('/:id', getNoticeById);                  // Get single notice by ID

export default noticesRouter;